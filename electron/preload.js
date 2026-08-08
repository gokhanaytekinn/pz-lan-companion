"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pz", {
  getState: () => ipcRenderer.invoke("get-state"),
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  getDevices: () => ipcRenderer.invoke("get-devices"),
  pollStatus: () => ipcRenderer.invoke("poll-status"),
});
