"use strict";

const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const QRCode = require("qrcode");
const {
  PORT,
  ACTIVE_SECONDS,
  MODS,
  getProfileFolderName,
  getLocalIPv4,
  loadResolvedPaths,
  resolveFromUserFolder,
  persistManualPath,
  getSavedLanguage,
  persistLanguage,
  buildModUrl,
  isReady,
  serializePaths,
} = require("./paths");
const { ClientActivityTracker, ServerController } = require("./server");

/** @type {BrowserWindow | null} */
let mainWindow = null;
let pathsState = loadResolvedPaths();
const tracker = new ClientActivityTracker();
const controller = new ServerController(pathsState, PORT, tracker);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#141816",
    title: "PZ Companion",
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

function buildState() {
  const localIp = getLocalIPv4();
  const mods = MODS.map((mod) => {
    const web = pathsState.webDirs[mod.key];
    const data = pathsState.dataDirs[mod.key];
    const webOk = Boolean(web && require("fs").existsSync(path.join(web, "index.html")));
    const dataOk = Boolean(data && require("fs").existsSync(data) && require("fs").statSync(data).isDirectory());
    const url = web ? buildModUrl(localIp, mod, PORT) : "";
    return {
      key: mod.key,
      name: mod.name,
      url,
      webOk,
      dataOk,
    };
  });

  return {
    localIp,
    port: PORT,
    profile: getProfileFolderName(),
    activeSeconds: ACTIVE_SECONDS,
    running: controller.running,
    paths: serializePaths(pathsState),
    mods,
    devices: tracker.snapshot(),
  };
}

async function attachQr(state) {
  for (const mod of state.mods) {
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

ipcMain.handle("get-state", async () => attachQr(buildState()));

function resolveLanguage() {
  const saved = getSavedLanguage();
  if (saved) return saved;
  const locale = String(app.getLocale() || "").toLowerCase();
  if (locale.startsWith("tr")) return "tr";
  if (locale.startsWith("en")) return "en";
  return "en";
}

ipcMain.handle("get-language-prefs", () => ({
  language: resolveLanguage(),
  systemLocale: app.getLocale(),
}));

ipcMain.handle("set-language", (_event, language) => {
  const next = language === "tr" ? "tr" : "en";
  persistLanguage(next);
  return { language: next };
});

ipcMain.handle("start-server", async () => {
  if (!isReady(pathsState)) {
    return { ok: false, errorKey: "cannotStartPaths" };
  }
  try {
    await controller.start();
    return { ok: true, state: await attachQr(buildState()) };
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      return { ok: false, errorKey: "portInUse", port: PORT };
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
  const missing = MODS.filter((m) => !resolved.webDirs[m.key]).map((m) => m.name);
  return {
    ok: true,
    partial: missing.length > 0,
    missing,
    state: await attachQr(buildState()),
  };
});

ipcMain.handle("get-devices", () => tracker.snapshot());

ipcMain.handle("poll-status", () => ({
  running: controller.running,
  devices: tracker.snapshot(),
  activeSeconds: ACTIVE_SECONDS,
}));

app.whenReady().then(() => {
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

// Open external links in browser if any
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
