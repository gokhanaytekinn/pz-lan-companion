#!/usr/bin/env python3
"""
PZ Companion — desktop UI for PZ Map + PZ Pulse LAN broadcast.
"""

from __future__ import annotations

from pathlib import Path
from tkinter import filedialog, messagebox

import customtkinter as ctk
from PIL import Image

from main import (
    ACTIVE_SECONDS,
    MODS,
    PORT,
    ClientActivityTracker,
    ResolvedPaths,
    ServerController,
    build_mod_url,
    get_local_ipv4,
    get_profile_folder_name,
    load_resolved_paths,
    make_qr_image,
    persist_manual_path,
    resolve_from_user_folder,
)

# Visual direction: charcoal + muted green / amber (not purple AI defaults)
COLOR_BG = "#141816"
COLOR_PANEL = "#1c221f"
COLOR_BORDER = "#2c3530"
COLOR_TEXT = "#e8efe9"
COLOR_MUTED = "#8a968c"
COLOR_ACCENT = "#7a9e6a"
COLOR_AMBER = "#c4a35a"
COLOR_DANGER = "#b85c4a"
COLOR_OK = "#6faf7a"


class CompanionApp(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("green")

        self.title("PZ Companion")
        self.geometry("980x720")
        self.minsize(900, 640)
        self.configure(fg_color=COLOR_BG)

        self.local_ip = get_local_ipv4()
        self.profile = get_profile_folder_name()
        self.paths: ResolvedPaths = load_resolved_paths()
        self.tracker = ClientActivityTracker()
        self.controller = ServerController(self.paths, tracker=self.tracker)
        self._qr_images: dict[str, ctk.CTkImage] = {}
        self._device_labels: list[ctk.CTkLabel] = []

        self._build_ui()
        self._refresh_path_ui()
        self._refresh_qr()
        self.after(200, self._maybe_prompt_paths)
        self.after(1000, self._tick_devices)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        header = ctk.CTkFrame(self, fg_color=COLOR_PANEL, corner_radius=0)
        header.pack(fill="x")

        title_row = ctk.CTkFrame(header, fg_color="transparent")
        title_row.pack(fill="x", padx=20, pady=(16, 8))

        ctk.CTkLabel(
            title_row,
            text="PZ Companion",
            font=ctk.CTkFont(family="Segoe UI Semibold", size=26),
            text_color=COLOR_TEXT,
        ).pack(side="left")

        self.status_pill = ctk.CTkLabel(
            title_row,
            text="  STOPPED  ",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=COLOR_BG,
            fg_color=COLOR_MUTED,
            corner_radius=6,
        )
        self.status_pill.pack(side="right", padx=(8, 0))

        meta = ctk.CTkFrame(header, fg_color="transparent")
        meta.pack(fill="x", padx=20, pady=(0, 8))
        self.meta_label = ctk.CTkLabel(
            meta,
            text="",
            font=ctk.CTkFont(size=13),
            text_color=COLOR_MUTED,
            anchor="w",
        )
        self.meta_label.pack(fill="x")

        self.path_label = ctk.CTkLabel(
            header,
            text="",
            font=ctk.CTkFont(size=12),
            text_color=COLOR_MUTED,
            anchor="w",
        )
        self.path_label.pack(fill="x", padx=20, pady=(0, 4))

        warn = ctk.CTkLabel(
            header,
            text="Same Wi‑Fi devices can read Map/Pulse data while the server is running.",
            font=ctk.CTkFont(size=11),
            text_color=COLOR_AMBER,
            anchor="w",
        )
        warn.pack(fill="x", padx=20, pady=(0, 12))

        controls = ctk.CTkFrame(self, fg_color="transparent")
        controls.pack(fill="x", padx=20, pady=(14, 8))

        self.start_btn = ctk.CTkButton(
            controls,
            text="Start Server",
            width=140,
            height=36,
            fg_color=COLOR_ACCENT,
            hover_color="#8bb57a",
            text_color=COLOR_BG,
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self.start_server,
        )
        self.start_btn.pack(side="left")

        self.stop_btn = ctk.CTkButton(
            controls,
            text="Stop Server",
            width=140,
            height=36,
            fg_color=COLOR_BORDER,
            hover_color="#3a453e",
            text_color=COLOR_TEXT,
            state="disabled",
            command=self.stop_server,
        )
        self.stop_btn.pack(side="left", padx=(10, 0))

        ctk.CTkButton(
            controls,
            text="Choose Steam Folder…",
            width=170,
            height=36,
            fg_color="transparent",
            border_width=1,
            border_color=COLOR_BORDER,
            text_color=COLOR_TEXT,
            hover_color=COLOR_PANEL,
            command=self.choose_folder,
        ).pack(side="right")

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=(4, 12))
        body.grid_columnconfigure(0, weight=1)
        body.grid_columnconfigure(1, weight=1)
        body.grid_columnconfigure(2, weight=1)
        body.grid_rowconfigure(0, weight=1)

        self.mod_frames: dict[str, dict] = {}
        for i, mod in enumerate(MODS):
            frame = ctk.CTkFrame(body, fg_color=COLOR_PANEL, corner_radius=10)
            frame.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 8, 0))
            ctk.CTkLabel(
                frame,
                text=mod.name,
                font=ctk.CTkFont(size=18, weight="bold"),
                text_color=COLOR_TEXT,
            ).pack(pady=(16, 8))

            qr_label = ctk.CTkLabel(frame, text="")
            qr_label.pack(pady=8)

            status = ctk.CTkLabel(
                frame,
                text="",
                font=ctk.CTkFont(size=12),
                text_color=COLOR_MUTED,
                justify="left",
            )
            status.pack(padx=16, pady=(4, 8))

            url_box = ctk.CTkTextbox(
                frame,
                height=70,
                fg_color=COLOR_BG,
                text_color=COLOR_MUTED,
                font=ctk.CTkFont(size=11),
                wrap="word",
            )
            url_box.pack(fill="x", padx=16, pady=(0, 8))
            url_box.configure(state="disabled")

            ctk.CTkButton(
                frame,
                text="Copy URL",
                fg_color=COLOR_BORDER,
                hover_color="#3a453e",
                command=lambda m=mod: self.copy_url(m.key),
            ).pack(pady=(0, 16))

            self.mod_frames[mod.key] = {
                "qr": qr_label,
                "status": status,
                "url_box": url_box,
                "url": "",
            }

        devices = ctk.CTkFrame(body, fg_color=COLOR_PANEL, corner_radius=10)
        devices.grid(row=0, column=2, sticky="nsew", padx=(8, 0))
        ctk.CTkLabel(
            devices,
            text="Active devices",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color=COLOR_TEXT,
        ).pack(pady=(16, 4), padx=16, anchor="w")
        ctk.CTkLabel(
            devices,
            text=f"Listening clients (active ≤ {int(ACTIVE_SECONDS)}s)",
            font=ctk.CTkFont(size=11),
            text_color=COLOR_MUTED,
        ).pack(padx=16, anchor="w")

        self.devices_scroll = ctk.CTkScrollableFrame(
            devices, fg_color=COLOR_BG, corner_radius=8
        )
        self.devices_scroll.pack(fill="both", expand=True, padx=12, pady=12)

        self.devices_empty = ctk.CTkLabel(
            self.devices_scroll,
            text="No devices yet.\nStart the server and open a QR on your phone.",
            text_color=COLOR_MUTED,
            justify="left",
        )
        self.devices_empty.pack(anchor="w", padx=8, pady=8)

    def _set_status(self, running: bool) -> None:
        if running:
            self.status_pill.configure(text="  RUNNING  ", fg_color=COLOR_OK)
            self.start_btn.configure(state="disabled")
            self.stop_btn.configure(state="normal")
        else:
            self.status_pill.configure(text="  STOPPED  ", fg_color=COLOR_MUTED)
            self.start_btn.configure(state="normal")
            self.stop_btn.configure(state="disabled")

    def _refresh_path_ui(self) -> None:
        self.meta_label.configure(
            text=f"IP {self.local_ip}   ·   Port {PORT}   ·   Profile {self.profile}"
        )
        workshop = self.paths.workshop_root
        if workshop:
            self.path_label.configure(text=f"Workshop: {workshop}")
        else:
            self.path_label.configure(text="Workshop: not found — choose your Steam folder")

        for mod in MODS:
            web = self.paths.web_dirs.get(mod.key)
            data = self.paths.data_dirs.get(mod.key)
            web_ok = web is not None and (web / "index.html").is_file()
            data_ok = data is not None and data.is_dir()
            lines = [
                f"Web UI: {'OK' if web_ok else 'MISSING'}",
                f"Data: {'OK' if data_ok else 'MISSING (start game with mod)'}",
            ]
            color = COLOR_OK if web_ok else COLOR_DANGER
            self.mod_frames[mod.key]["status"].configure(
                text="\n".join(lines), text_color=color if web_ok else COLOR_DANGER
            )

    def _refresh_qr(self) -> None:
        for mod in MODS:
            if mod.key not in self.paths.web_dirs:
                self.mod_frames[mod.key]["url"] = ""
                box = self.mod_frames[mod.key]["url_box"]
                box.configure(state="normal")
                box.delete("1.0", "end")
                box.insert("1.0", "Mod web UI not found.")
                box.configure(state="disabled")
                self.mod_frames[mod.key]["qr"].configure(image=None, text="No QR")
                continue

            url = build_mod_url(self.local_ip, mod)
            self.mod_frames[mod.key]["url"] = url
            box = self.mod_frames[mod.key]["url_box"]
            box.configure(state="normal")
            box.delete("1.0", "end")
            box.insert("1.0", url)
            box.configure(state="disabled")

            img = make_qr_image(url, box_size=5)
            img = img.resize((200, 200), Image.Resampling.NEAREST)
            ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=(200, 200))
            self._qr_images[mod.key] = ctk_img
            self.mod_frames[mod.key]["qr"].configure(image=ctk_img, text="")

    def _maybe_prompt_paths(self) -> None:
        if self.paths.is_ready():
            return
        if not messagebox.askokcancel(
            "Steam folder not found",
            "Could not find PZ Map / PZ Pulse workshop files automatically.\n\n"
            "Click OK to select your Steam steamapps folder\n"
            "(or the folder that contains workshop\\content\\108600).",
        ):
            return
        self.choose_folder()

    def choose_folder(self) -> None:
        selected = filedialog.askdirectory(
            title="Select Steam steamapps (or workshop content 108600) folder"
        )
        if not selected:
            return
        resolved = resolve_from_user_folder(Path(selected))
        if not resolved.web_dirs:
            messagebox.showerror(
                "Mods not found",
                "That folder does not contain PZ Map / PZ Pulse web UI files.\n"
                "Select your Steam steamapps directory and try again.",
            )
            return
        persist_manual_path(Path(selected))
        self.paths = resolved
        self.controller.update_paths(resolved)
        self._refresh_path_ui()
        self._refresh_qr()
        if not resolved.is_ready():
            missing = [m.name for m in MODS if m.key not in resolved.web_dirs]
            messagebox.showwarning(
                "Partial match",
                "Found some mods but missing:\n- " + "\n- ".join(missing),
            )
        else:
            messagebox.showinfo("Paths saved", "Mod folders found and saved.")

    def start_server(self) -> None:
        if not self.paths.is_ready():
            messagebox.showerror(
                "Cannot start",
                "Both PZ Map and PZ Pulse web UIs are required.\n"
                "Use “Choose Steam Folder…” first.",
            )
            self._maybe_prompt_paths()
            return
        try:
            self.controller.start()
        except OSError as exc:
            messagebox.showerror(
                "Port in use",
                f"Could not bind port {PORT}.\n{exc}\n\nIs another instance running?",
            )
            return
        except RuntimeError as exc:
            messagebox.showerror("Cannot start", str(exc))
            return
        self._set_status(True)

    def stop_server(self) -> None:
        self.controller.stop()
        self._set_status(False)

    def copy_url(self, mod_key: str) -> None:
        url = self.mod_frames[mod_key]["url"]
        if not url:
            return
        self.clipboard_clear()
        self.clipboard_append(url)
        self.update()

    def _path_hint(self, path: str) -> str:
        lower = path.lower()
        if "/mods/map" in lower or "/data/map" in lower:
            return "PZ Map"
        if "/mods/pulse" in lower or "/data/pulse" in lower:
            return "PZ Pulse"
        return path[-40:] if path else "—"

    def _tick_devices(self) -> None:
        rows = self.tracker.snapshot()
        for label in self._device_labels:
            label.destroy()
        self._device_labels.clear()

        if not rows:
            self.devices_empty.pack(anchor="w", padx=8, pady=8)
        else:
            self.devices_empty.pack_forget()
            for row in rows:
                age = int(row["age_seconds"])
                if age < 1:
                    age_text = "just now"
                elif age < 60:
                    age_text = f"{age}s ago"
                else:
                    age_text = f"{age // 60}m ago"
                state = "ACTIVE" if row["active"] else "idle"
                color = COLOR_OK if row["active"] else COLOR_MUTED
                hint = self._path_hint(row["last_path"])
                text = f"{row['ip']}  ·  {state}  ·  {age_text}\n{hint}  ·  {row['request_count']} req"
                label = ctk.CTkLabel(
                    self.devices_scroll,
                    text=text,
                    anchor="w",
                    justify="left",
                    text_color=color,
                    font=ctk.CTkFont(size=12),
                )
                label.pack(fill="x", padx=8, pady=6, anchor="w")
                self._device_labels.append(label)

        self.after(1000, self._tick_devices)

    def _on_close(self) -> None:
        try:
            self.controller.stop()
        except Exception:
            pass
        self.destroy()


def main() -> int:
    try:
        app = CompanionApp()
        app.mainloop()
    except Exception as exc:  # noqa: BLE001
        messagebox.showerror("PZ Companion", f"Failed to start UI:\n{exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
