"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const PZ_APP_ID = "108600";
const MAP_WORKSHOP_ID = "3770149036";
const PULSE_WORKSHOP_ID = "3753700423";

const MODS = [
  {
    key: "map",
    name: "PZ Map",
    workshopId: MAP_WORKSHOP_ID,
    modFolder: "Pz_Map",
    dataFolder: "PZ_Map",
    urlMod: "/mods/map/",
    urlData: "/data/map/",
  },
  {
    key: "pulse",
    name: "PZ Pulse",
    workshopId: PULSE_WORKSHOP_ID,
    modFolder: "Pz_Pulse",
    dataFolder: "PZ_Pulse",
    urlMod: "/mods/pulse/",
    urlData: "/data/pulse/",
  },
];

const CONFIG_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "PZCompanion"
);
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function getProfileFolderName() {
  return path.basename(os.homedir()) || os.userInfo().username || "user";
}

function getLocalIPv4() {
  const candidates = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        candidates.push(entry.address);
      }
    }
  }
  if (!candidates.length) return "127.0.0.1";

  function score(ip) {
    if (ip.startsWith("192.168.")) return [0, ip];
    if (ip.startsWith("10.")) return [1, ip];
    if (ip.startsWith("172.")) {
      const second = Number(ip.split(".")[1]);
      if (second >= 16 && second <= 31) return [2, ip];
    }
    return [3, ip];
  }

  return candidates.sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    return sa[0] - sb[0] || sa[1].localeCompare(sb[1]);
  })[0];
}

function steamPathFromRegistry() {
  if (process.platform !== "win32") return null;
  const queries = [
    'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
    'reg query "HKLM\\Software\\Valve\\Steam" /v InstallPath',
    'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
  ];
  for (const cmd of queries) {
    try {
      const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const match = out.match(/REG_SZ\s+(.+)/i);
      if (match) {
        const p = match[1].trim();
        if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function parseLibraryFolders(vdfPath) {
  const libraries = [];
  try {
    const text = fs.readFileSync(vdfPath, "utf8");
    const re = /"path"\s*"([^"]+)"/gi;
    let match;
    while ((match = re.exec(text))) {
      const raw = match[1].replace(/\\\\/g, "\\");
      if (fs.existsSync(raw) && fs.statSync(raw).isDirectory()) {
        libraries.push(raw);
      }
    }
  } catch {
    // ignore
  }
  return libraries;
}

function discoverSteamLibraries() {
  const found = [];
  const seen = new Set();

  function add(p) {
    if (!p) return;
    let key;
    try {
      key = path.resolve(p).toLowerCase();
    } catch {
      key = String(p).toLowerCase();
    }
    if (seen.has(key)) return;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      seen.add(key);
      found.push(p);
    }
  }

  const steam = steamPathFromRegistry();
  add(steam);
  if (steam) {
    const vdf = path.join(steam, "steamapps", "libraryfolders.vdf");
    if (fs.existsSync(vdf)) {
      for (const lib of parseLibraryFolders(vdf)) add(lib);
    }
  }

  for (const candidate of [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
    "D:\\Steam",
    "D:\\SteamLibrary",
    "E:\\SteamLibrary",
  ]) {
    add(candidate);
  }

  return found;
}

function findWebDir(workshopApp, mod) {
  const candidates = [
    path.join(workshopApp, mod.workshopId, "mods", mod.modFolder, "42", "media", "web"),
    path.join(workshopApp, "mods", mod.modFolder, "42", "media", "web"),
  ];

  for (const web of candidates) {
    if (fs.existsSync(path.join(web, "index.html"))) return web;
  }

  const searchRoots = [path.join(workshopApp, mod.workshopId), workshopApp];
  for (const root of searchRoots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    try {
      const found = walkForIndex(root, mod);
      if (found) return found;
    } catch {
      // ignore
    }
  }
  return null;
}

function walkForIndex(root, mod, depth = 0) {
  if (depth > 10) return null;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === "index.html") {
      const parent = root;
      const parts = parent.split(/[/\\]/).map((p) => p.toLowerCase());
      if (
        parts.includes(mod.modFolder.toLowerCase()) &&
        path.basename(parent).toLowerCase() === "web" &&
        parts.includes("media")
      ) {
        return parent;
      }
    } else if (entry.isDirectory()) {
      const found = walkForIndex(full, mod, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function resolveDataDirs() {
  const base = path.join(os.homedir(), "Zomboid", "Lua");
  const out = {};
  for (const mod of MODS) {
    out[mod.key] = path.join(base, mod.dataFolder);
  }
  return out;
}

function emptyResolved() {
  return {
    steamRoot: null,
    workshopRoot: null,
    webDirs: {},
    dataDirs: resolveDataDirs(),
  };
}

function isReady(resolved) {
  return MODS.every((mod) => Boolean(resolved.webDirs[mod.key]));
}

function mountsFrom(resolved) {
  const out = {};
  for (const mod of MODS) {
    const web = resolved.webDirs[mod.key];
    const data = resolved.dataDirs[mod.key];
    if (web) out[mod.urlMod.replace(/\/$/, "")] = web;
    if (data) out[mod.urlData.replace(/\/$/, "")] = data;
  }
  return out;
}

function resolveFromSteamLibraries(libraries) {
  const libs = libraries || discoverSteamLibraries();
  const resolved = emptyResolved();

  for (const lib of libs) {
    let steamapps = path.join(lib, "steamapps");
    if (!fs.existsSync(steamapps) || !fs.statSync(steamapps).isDirectory()) {
      steamapps = lib;
    }
    let workshopApp = path.join(steamapps, "workshop", "content", PZ_APP_ID);
    if (!fs.existsSync(workshopApp) || !fs.statSync(workshopApp).isDirectory()) {
      if (
        path.basename(lib) === PZ_APP_ID &&
        path.basename(path.dirname(lib)).toLowerCase() === "content"
      ) {
        workshopApp = lib;
      } else {
        continue;
      }
    }

    const webDirs = {};
    for (const mod of MODS) {
      const web = findWebDir(workshopApp, mod);
      if (web) webDirs[mod.key] = web;
    }

    if (Object.keys(webDirs).length) {
      resolved.steamRoot = lib;
      resolved.workshopRoot = workshopApp;
      resolved.webDirs = webDirs;
      if (isReady(resolved)) return resolved;
    }
  }

  return resolved;
}

function resolveFromUserFolder(selected) {
  selected = path.resolve(selected);
  const candidates = [selected];
  if (path.basename(selected).toLowerCase() === "steamapps") {
    candidates.push(path.dirname(selected));
  }
  if (fs.existsSync(path.join(selected, "steamapps"))) {
    candidates.push(selected);
  }
  let cur = selected;
  for (let i = 0; i < 6; i++) {
    candidates.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  const resolved = resolveFromSteamLibraries(candidates);
  if (isReady(resolved)) return resolved;

  const direct = emptyResolved();
  direct.workshopRoot = selected;
  for (const mod of MODS) {
    let web = findWebDir(selected, mod);
    if (!web && path.basename(selected) === mod.workshopId) {
      web = findWebDir(path.dirname(selected), mod);
    }
    if (web) direct.webDirs[mod.key] = web;
  }
  if (Object.keys(direct.webDirs).length) return direct;
  return resolved;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveConfig(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

function loadResolvedPaths() {
  const cfg = loadConfig();
  const manual = cfg.steamapps_or_workshop;
  if (manual && fs.existsSync(manual) && fs.statSync(manual).isDirectory()) {
    const resolved = resolveFromUserFolder(manual);
    if (Object.keys(resolved.webDirs).length) return resolved;
  }
  return resolveFromSteamLibraries();
}

function persistManualPath(folder) {
  const cfg = loadConfig();
  cfg.steamapps_or_workshop = path.resolve(folder);
  saveConfig(cfg);
}

function buildModUrl(localIp, mod, port) {
  return (
    `http://${localIp}:${port}${mod.urlMod}index.html` +
    `?d=http://${localIp}:${port}${mod.urlData}`
  );
}

function serializePaths(resolved) {
  return {
    steamRoot: resolved.steamRoot,
    workshopRoot: resolved.workshopRoot,
    webDirs: { ...resolved.webDirs },
    dataDirs: { ...resolved.dataDirs },
    ready: isReady(resolved),
  };
}

module.exports = {
  PORT: 8080,
  ACTIVE_SECONDS: 15,
  MODS,
  getProfileFolderName,
  getLocalIPv4,
  loadResolvedPaths,
  resolveFromUserFolder,
  persistManualPath,
  buildModUrl,
  isReady,
  mountsFrom,
  serializePaths,
};
