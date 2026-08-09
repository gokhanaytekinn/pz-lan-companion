"use strict";

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const QRCode = require("qrcode");
const {
  ACTIVE_SECONDS,
  MODS,
  getProfileFolderName,
  loadResolvedPaths,
  resolveFromUserFolder,
  persistManualPath,
  getSavedLanguage,
  persistLanguage,
  loadAppSettings,
  persistAppSettings,
  setDeviceNickname,
  buildModUrl,
  isReady,
  serializePaths,
} = require("./paths");
const { ClientActivityTracker, ServerController } = require("./server");

/** @type {BrowserWindow | null} */
let mainWindow = null;
let pathsState = loadResolvedPaths();
let settings = loadAppSettings();
const tracker = new ClientActivityTracker();
const controller = new ServerController(
  pathsState,
  settings.port,
  tracker,
  settings.enabledMods
);

const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 920,
    minHeight: 660,
    backgroundColor: "#141816",
    title: "PZ Companion",
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "ui", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function deviceRows() {
  const nicknames = settings.deviceNicknames || {};
  return tracker.snapshot().map((row) => ({
    ...row,
    nickname: nicknames[row.ip] || "",
  }));
}

function buildState() {
  settings = loadAppSettings();
  controller.setPort(settings.port);
  controller.setEnabledMods(settings.enabledMods);

  const mods = MODS.map((mod) => {
    const enabled = settings.enabledMods[mod.key] !== false;
    const web = pathsState.webDirs[mod.key];
    const data = pathsState.dataDirs[mod.key];
    const webOk = Boolean(web && fs.existsSync(path.join(web, "index.html")));
    const dataOk = Boolean(data && fs.existsSync(data) && fs.statSync(data).isDirectory());
    const url = enabled && web ? buildModUrl(settings.selectedIp, mod, settings.port) : "";
    return {
      key: mod.key,
      name: mod.name,
      enabled,
      url,
      webOk,
      dataOk,
    };
  });

  return {
    localIp: settings.selectedIp,
    availableIps: settings.availableIps,
    port: settings.port,
    enabledMods: settings.enabledMods,
    profile: getProfileFolderName(),
    activeSeconds: ACTIVE_SECONDS,
    running: controller.running,
    paths: serializePaths(pathsState, settings.enabledMods),
    mods,
    devices: deviceRows(),
  };
}

async function attachQr(state) {
  for (const mod of state.mods) {
    if (!mod.enabled) {
      mod.qrDataUrl = "";
      continue;
    }
    if (!mod.url) {
      mod.qrDataUrl = "";
      continue;
    }
    mod.qrDataUrl = await QRCode.toDataURL(mod.url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 200,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }
  return state;
}

function resolveLanguage() {
  const saved = getSavedLanguage();
  if (saved) return saved;
  const locale = String(app.getLocale() || "").toLowerCase();
  if (locale.startsWith("tr")) return "tr";
  if (locale.startsWith("en")) return "en";
  return "en";
}

ipcMain.handle("get-state", async () => attachQr(buildState()));

ipcMain.handle("get-language-prefs", () => ({
  language: resolveLanguage(),
  systemLocale: app.getLocale(),
}));

ipcMain.handle("set-language", (_event, language) => {
  const next = language === "tr" ? "tr" : "en";
  persistLanguage(next);
  return { language: next };
});

ipcMain.handle("update-settings", async (_event, patch) => {
  const prevPort = settings.port;
  const prevMods = JSON.stringify(settings.enabledMods);
  settings = persistAppSettings(patch || {});
  controller.setPort(settings.port);
  controller.setEnabledMods(settings.enabledMods);

  const portChanged = prevPort !== settings.port;
  const modsChanged = prevMods !== JSON.stringify(settings.enabledMods);
  if (controller.running && (portChanged || modsChanged)) {
    try {
      await controller.restart();
    } catch (err) {
      if (err && err.code === "EADDRINUSE") {
        return {
          ok: false,
          errorKey: "portInUse",
          port: settings.port,
          state: await attachQr(buildState()),
        };
      }
      return {
        ok: false,
        error: (err && err.message) || String(err),
        state: await attachQr(buildState()),
      };
    }
  }

  return { ok: true, state: await attachQr(buildState()) };
});

ipcMain.handle("set-device-nickname", async (_event, payload) => {
  const ip = payload && payload.ip;
  if (!ip) return { ok: false, errorKey: "cannotStart" };
  settings.deviceNicknames = setDeviceNickname(ip, payload.nickname || "");
  return { ok: true, state: await attachQr(buildState()) };
});

ipcMain.handle("start-server", async () => {
  settings = loadAppSettings();
  controller.setPort(settings.port);
  controller.setEnabledMods(settings.enabledMods);

  if (!settings.enabledMods.map && !settings.enabledMods.pulse) {
    return { ok: false, errorKey: "noModsEnabled" };
  }
  if (!isReady(pathsState, settings.enabledMods)) {
    return { ok: false, errorKey: "cannotStartPaths" };
  }
  try {
    await controller.start();
    return { ok: true, state: await attachQr(buildState()) };
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      return { ok: false, errorKey: "portInUse", port: settings.port };
    }
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle("stop-server", async () => {
  controller.stop();
  return { ok: true, state: await attachQr(buildState()) };
});

ipcMain.handle("choose-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Steam",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, cancelled: true };
  }
  const selected = result.filePaths[0];
  const resolved = resolveFromUserFolder(selected);
  if (!Object.keys(resolved.webDirs).length) {
    return { ok: false, errorKey: "modsNotFound" };
  }
  persistManualPath(selected);
  pathsState = resolved;
  await controller.updatePaths(resolved);
  settings = loadAppSettings();
  const missing = MODS.filter(
    (m) => settings.enabledMods[m.key] !== false && !resolved.webDirs[m.key]
  ).map((m) => m.name);
  return {
    ok: true,
    partial: missing.length > 0,
    missing,
    state: await attachQr(buildState()),
  };
});

ipcMain.handle("poll-status", () => {
  settings = loadAppSettings();
  return {
    running: controller.running,
    devices: deviceRows(),
    activeSeconds: ACTIVE_SECONDS,
    availableIps: settings.availableIps,
    selectedIp: settings.selectedIp,
    port: settings.port,
  };
});

app.whenReady().then(() => {
  if (process.platform === "win32" && fs.existsSync(ICON_PATH)) {
    app.setAppUserModelId("com.pzcompanion.app");
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  try {
    controller.stop();
  } catch {
    // ignore
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    controller.stop();
  } catch {
    // ignore
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
