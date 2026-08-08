#!/usr/bin/env python3
"""
PZ Companion Server core
LAN HTTP server for PZ Map + PZ Pulse with virtual mounts and Steam discovery.
"""

from __future__ import annotations

import getpass
import http.server
import json
import mimetypes
import os
import re
import socket
import socketserver
import sys
import threading
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

import qrcode
from PIL import Image

PORT = 8080
PZ_APP_ID = "108600"
MAP_WORKSHOP_ID = "3770149036"
PULSE_WORKSHOP_ID = "3753700423"
ACTIVE_SECONDS = 15.0
CONFIG_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "PZCompanion"
CONFIG_PATH = CONFIG_DIR / "config.json"


@dataclass(frozen=True)
class ModTarget:
    key: str
    name: str
    workshop_id: str
    mod_folder: str  # e.g. Pz_Map
    data_folder: str  # e.g. PZ_Map
    url_mod: str  # /mods/map/
    url_data: str  # /data/map/


MODS: tuple[ModTarget, ...] = (
    ModTarget(
        key="map",
        name="PZ Map",
        workshop_id=MAP_WORKSHOP_ID,
        mod_folder="Pz_Map",
        data_folder="PZ_Map",
        url_mod="/mods/map/",
        url_data="/data/map/",
    ),
    ModTarget(
        key="pulse",
        name="PZ Pulse",
        workshop_id=PULSE_WORKSHOP_ID,
        mod_folder="Pz_Pulse",
        data_folder="PZ_Pulse",
        url_mod="/mods/pulse/",
        url_data="/data/pulse/",
    ),
)


@dataclass
class ResolvedPaths:
    steam_root: Path | None = None
    workshop_root: Path | None = None  # .../workshop/content/108600
    web_dirs: dict[str, Path] = field(default_factory=dict)  # mod key -> media/web
    data_dirs: dict[str, Path] = field(default_factory=dict)

    def mounts(self) -> dict[str, Path]:
        """URL prefix (no trailing issues) -> filesystem directory."""
        out: dict[str, Path] = {}
        for mod in MODS:
            web = self.web_dirs.get(mod.key)
            data = self.data_dirs.get(mod.key)
            if web is not None:
                out[mod.url_mod.rstrip("/")] = web
            if data is not None:
                out[mod.url_data.rstrip("/")] = data
        return out

    def is_ready(self) -> bool:
        return all(mod.key in self.web_dirs for mod in MODS)


def get_profile_folder_name() -> str:
    home = Path.home()
    if home.name:
        return home.name
    try:
        return os.getlogin()
    except OSError:
        return getpass.getuser()


def get_local_ipv4() -> str:
    candidates: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                candidates.append(ip)
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip = sock.getsockname()[0]
            if not ip.startswith("127.") and ip not in candidates:
                candidates.insert(0, ip)
    except OSError:
        pass
    if not candidates:
        return "127.0.0.1"

    def score(ip: str) -> tuple[int, str]:
        if ip.startswith("192.168."):
            return (0, ip)
        if ip.startswith("10."):
            return (1, ip)
        if ip.startswith("172."):
            try:
                second = int(ip.split(".")[1])
            except (IndexError, ValueError):
                return (3, ip)
            if 16 <= second <= 31:
                return (2, ip)
        return (3, ip)

    return sorted(candidates, key=score)[0]


def _steam_path_from_registry() -> Path | None:
    if sys.platform != "win32":
        return None
    try:
        import winreg
    except ImportError:
        return None
    for root, sub in (
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Valve\Steam"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam"),
    ):
        try:
            with winreg.OpenKey(root, sub) as key:
                for name in ("SteamPath", "InstallPath"):
                    try:
                        value, _ = winreg.QueryValueEx(key, name)
                        path = Path(str(value))
                        if path.is_dir():
                            return path
                    except OSError:
                        continue
        except OSError:
            continue
    return None


def _parse_libraryfolders(vdf_path: Path) -> list[Path]:
    """Parse libraryfolders.vdf for library paths (simple regex, not full VDF)."""
    libraries: list[Path] = []
    try:
        text = vdf_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return libraries
    # "path"		"D:\\SteamLibrary"
    for match in re.finditer(r'"path"\s*"([^"]+)"', text, flags=re.IGNORECASE):
        raw = match.group(1).replace("\\\\", "\\")
        path = Path(raw)
        if path.is_dir():
            libraries.append(path)
    return libraries


def discover_steam_libraries() -> list[Path]:
    """Return Steam library root folders (each contains steamapps/)."""
    found: list[Path] = []
    seen: set[str] = set()

    def add(path: Path | None) -> None:
        if path is None:
            return
        try:
            key = str(path.resolve()).lower()
        except OSError:
            key = str(path).lower()
        if key in seen:
            return
        if path.is_dir():
            seen.add(key)
            found.append(path)

    steam = _steam_path_from_registry()
    add(steam)
    if steam is not None:
        vdf = steam / "steamapps" / "libraryfolders.vdf"
        if vdf.is_file():
            for lib in _parse_libraryfolders(vdf):
                add(lib)

    # Common fallbacks
    for candidate in (
        Path(r"C:\Program Files (x86)\Steam"),
        Path(r"C:\Program Files\Steam"),
        Path(r"D:\Steam"),
        Path(r"D:\SteamLibrary"),
        Path(r"E:\SteamLibrary"),
    ):
        add(candidate)

    return found


def _find_web_dir(workshop_app: Path, mod: ModTarget) -> Path | None:
    """
    workshop_app = .../workshop/content/108600
    Prefer .../<id>/mods/<Mod>/42/media/web/index.html
    Also accept user-selected folders that already point at media/web or mod root.
    """
    candidates = [
        workshop_app
        / mod.workshop_id
        / "mods"
        / mod.mod_folder
        / "42"
        / "media"
        / "web",
        workshop_app / "mods" / mod.mod_folder / "42" / "media" / "web",
    ]
    # If workshop_app itself is the workshop id folder
    candidates.append(
        workshop_app / "mods" / mod.mod_folder / "42" / "media" / "web"
    )
    for web in candidates:
        if (web / "index.html").is_file():
            return web

    # Recursive shallow search under workshop id
    id_root = workshop_app / mod.workshop_id
    search_roots = [id_root, workshop_app]
    for root in search_roots:
        if not root.is_dir():
            continue
        try:
            for index in root.rglob("index.html"):
                parent = index.parent
                # .../media/web/index.html under the right mod folder name
                parts = [p.lower() for p in parent.parts]
                if (
                    mod.mod_folder.lower() in parts
                    and parent.name.lower() == "web"
                    and "media" in parts
                ):
                    return parent
        except OSError:
            continue
    return None


def resolve_data_dirs() -> dict[str, Path]:
    base = Path.home() / "Zomboid" / "Lua"
    return {mod.key: base / mod.data_folder for mod in MODS}


def resolve_from_steam_libraries(libraries: list[Path] | None = None) -> ResolvedPaths:
    libraries = libraries if libraries is not None else discover_steam_libraries()
    resolved = ResolvedPaths(data_dirs=resolve_data_dirs())

    for lib in libraries:
        steamapps = lib / "steamapps" if (lib / "steamapps").is_dir() else lib
        workshop_app = steamapps / "workshop" / "content" / PZ_APP_ID
        if not workshop_app.is_dir():
            # Maybe user pointed directly at workshop/content/108600
            if lib.name == PZ_APP_ID and (lib.parent.name.lower() == "content"):
                workshop_app = lib
            else:
                continue

        web_dirs: dict[str, Path] = {}
        for mod in MODS:
            web = _find_web_dir(workshop_app, mod)
            if web is not None:
                web_dirs[mod.key] = web

        if web_dirs:
            resolved.steam_root = lib
            resolved.workshop_root = workshop_app
            resolved.web_dirs = web_dirs
            if resolved.is_ready():
                return resolved

    return resolved


def resolve_from_user_folder(selected: Path) -> ResolvedPaths:
    """Try to interpret a user-selected steamapps / workshop / library folder."""
    selected = selected.resolve()
    candidates: list[Path] = [selected]
    # If they selected steamapps
    if selected.name.lower() == "steamapps":
        candidates.append(selected.parent)
    # If they selected Steam root
    if (selected / "steamapps").is_dir():
        candidates.append(selected)
    # Walk up a few levels looking for workshop content
    cur = selected
    for _ in range(6):
        candidates.append(cur)
        if cur.parent == cur:
            break
        cur = cur.parent

    resolved = resolve_from_steam_libraries(candidates)
    if resolved.is_ready():
        return resolved

    # Direct: selected folder contains both mod workshop ids as children
    direct = ResolvedPaths(data_dirs=resolve_data_dirs(), workshop_root=selected)
    for mod in MODS:
        web = _find_web_dir(selected, mod)
        if web is None and selected.name == mod.workshop_id:
            web = _find_web_dir(selected.parent, mod)
        if web is not None:
            direct.web_dirs[mod.key] = web
    if direct.web_dirs:
        return direct
    return resolved


def load_config() -> dict:
    try:
        if CONFIG_PATH.is_file():
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    return {}


def save_config(data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_resolved_paths() -> ResolvedPaths:
    cfg = load_config()
    manual = cfg.get("steamapps_or_workshop")
    if manual:
        path = Path(manual)
        if path.is_dir():
            resolved = resolve_from_user_folder(path)
            if resolved.web_dirs:
                return resolved
    return resolve_from_steam_libraries()


def persist_manual_path(path: Path) -> None:
    cfg = load_config()
    cfg["steamapps_or_workshop"] = str(path.resolve())
    save_config(cfg)


def build_mod_url(local_ip: str, mod: ModTarget) -> str:
    return (
        f"http://{local_ip}:{PORT}{mod.url_mod}index.html"
        f"?d=http://{local_ip}:{PORT}{mod.url_data}"
    )


def make_qr_image(url: str, box_size: int = 4) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


class ClientActivityTracker:
    def __init__(self, active_seconds: float = ACTIVE_SECONDS) -> None:
        self.active_seconds = active_seconds
        self._lock = threading.Lock()
        self._clients: dict[str, dict] = {}

    def record(self, ip: str, path: str = "") -> None:
        if not ip:
            return
        with self._lock:
            entry = self._clients.get(ip)
            now = time.time()
            if entry is None:
                self._clients[ip] = {
                    "ip": ip,
                    "last_seen": now,
                    "request_count": 1,
                    "last_path": path,
                }
            else:
                entry["last_seen"] = now
                entry["request_count"] = int(entry["request_count"]) + 1
                entry["last_path"] = path

    def snapshot(self) -> list[dict]:
        now = time.time()
        with self._lock:
            rows = []
            for ip, entry in self._clients.items():
                age = now - float(entry["last_seen"])
                rows.append(
                    {
                        "ip": ip,
                        "last_seen": float(entry["last_seen"]),
                        "age_seconds": age,
                        "active": age <= self.active_seconds,
                        "request_count": int(entry["request_count"]),
                        "last_path": str(entry.get("last_path") or ""),
                    }
                )
        rows.sort(key=lambda r: (not r["active"], r["age_seconds"]))
        return rows

    def clear(self) -> None:
        with self._lock:
            self._clients.clear()


def _safe_join(root: Path, relative: str) -> Path | None:
    """Join URL relative path under root; block traversal."""
    relative = urllib.parse.unquote(relative).replace("\\", "/")
    if relative.startswith("/"):
        relative = relative[1:]
    parts: list[str] = []
    for part in relative.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            return None
        parts.append(part)
    candidate = root.joinpath(*parts) if parts else root
    try:
        root_resolved = root.resolve()
        cand_resolved = candidate.resolve()
        cand_resolved.relative_to(root_resolved)
    except (OSError, ValueError):
        return None
    return cand_resolved


class MountHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    """Serve only configured virtual mounts with CORS + no-store."""

    mounts: dict[str, Path] = {}
    tracker: ClientActivityTracker | None = None

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(head_only=True)

    def do_GET(self) -> None:  # noqa: N802
        self._serve(head_only=False)

    def _match_mount(self, path: str) -> tuple[Path, str] | None:
        # Longest prefix match
        for prefix in sorted(self.mounts.keys(), key=len, reverse=True):
            if path == prefix or path.startswith(prefix + "/"):
                rel = path[len(prefix) :].lstrip("/")
                return self.mounts[prefix], rel
        return None

    def _serve(self, head_only: bool) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(parsed.path)
        client_ip = self.client_address[0]
        if self.tracker is not None:
            self.tracker.record(client_ip, path)

        matched = self._match_mount(path)
        if matched is None:
            self.send_error(404, "Not found")
            return
        root, rel = matched
        if rel == "" or rel.endswith("/"):
            rel = (rel + "index.html").lstrip("/")

        target = _safe_join(root, rel)
        if target is None or not target.is_file():
            self.send_error(404, "File not found")
            return

        try:
            data = target.read_bytes()
        except OSError:
            self.send_error(404, "File not found")
            return

        ctype = self.guess_type(str(target))
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    @staticmethod
    def guess_type(path: str) -> str:
        ctype, _ = mimetypes.guess_type(path)
        return ctype or "application/octet-stream"


class ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class ServerController:
    def __init__(
        self,
        paths: ResolvedPaths,
        port: int = PORT,
        tracker: ClientActivityTracker | None = None,
    ) -> None:
        self.paths = paths
        self.port = port
        self.tracker = tracker or ClientActivityTracker()
        self._httpd: ReusableTCPServer | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    @property
    def running(self) -> bool:
        return self._httpd is not None

    def start(self) -> None:
        with self._lock:
            if self._httpd is not None:
                return
            mounts = self.paths.mounts()
            if not mounts:
                raise RuntimeError("No mountable mod paths resolved.")

            tracker = self.tracker

            class Handler(MountHTTPRequestHandler):
                pass

            Handler.mounts = mounts
            Handler.tracker = tracker

            httpd = ReusableTCPServer(("", self.port), Handler)
            self._httpd = httpd
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            self._thread = thread
            thread.start()

    def stop(self) -> None:
        with self._lock:
            httpd = self._httpd
            self._httpd = None
            self._thread = None
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()

    def update_paths(self, paths: ResolvedPaths) -> None:
        was_running = self.running
        if was_running:
            self.stop()
        self.paths = paths
        if was_running:
            self.start()


def print_qr_ascii(url: str) -> None:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=1,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    qr.print_ascii(out=sys.stdout, invert=True)


def main_cli() -> int:
    paths = load_resolved_paths()
    local_ip = get_local_ipv4()
    profile = get_profile_folder_name()

    print("PZ Companion (CLI)")
    print(f"Profile : {profile}")
    print(f"IP      : {local_ip}")
    print(f"Port    : {PORT}")
    if paths.workshop_root:
        print(f"Workshop: {paths.workshop_root}")
    for mod in MODS:
        web = paths.web_dirs.get(mod.key)
        data = paths.data_dirs.get(mod.key)
        print(f"[{mod.name}] web={'OK' if web else 'MISSING'} data="
              f"{'OK' if data and data.is_dir() else 'MISSING'}")
        if web:
            url = build_mod_url(local_ip, mod)
            print(url)
            print_qr_ascii(url)
            print()

    if not paths.is_ready():
        print("ERROR: Could not resolve both mod web UIs.", file=sys.stderr)
        print("Select your Steam steamapps folder in the GUI app, or set config.", file=sys.stderr)
        return 1

    controller = ServerController(paths)
    print("Starting server... Ctrl+C to stop.")
    try:
        controller.start()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        controller.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
