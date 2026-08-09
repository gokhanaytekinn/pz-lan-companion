"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pz", {
  getState: () => ipcRenderer.invoke("get-state"),
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  pollStatus: () => ipcRenderer.invoke("poll-status"),
  getLanguagePrefs: () => ipcRenderer.invoke("get-language-prefs"),
  setLanguage: (language) => ipcRenderer.invoke("set-language", language),
  updateSettings: (patch) => ipcRenderer.invoke("update-settings", patch),
  setDeviceNickname: (ip, nickname) =>
    ipcRenderer.invoke("set-device-nickname", { ip, nickname }),
});
