"use strict";

const STRINGS = {
  en: {
    statusRunning: "RUNNING",
    statusStopped: "STOPPED",
    warn: "Same Wi‑Fi devices can read Map/Pulse data while the server is running.",
    startServer: "Start Server",
    stopServer: "Stop Server",
    chooseFolder: "Choose Steam Folder…",
    language: "Language",
    copyUrl: "Copy URL",
    showUrl: "Show",
    hideUrl: "Hide",
    urlHidden: "URL hidden",
    urlMissing: "Mod web UI not found.",
    noQr: "No QR",
    webOk: "Web UI: OK",
    webMissing: "Web UI: MISSING",
    dataOk: "Data: OK",
    dataMissing: "Data: MISSING (start game with mod)",
    activeDevices: "Active devices",
    devicesHint: "Listening clients (active ≤ {seconds}s)",
    devicesEmpty: "No devices yet.<br />Start the server and open a QR on your phone.",
    active: "ACTIVE",
    idle: "idle",
    justNow: "just now",
    secondsAgo: "{n}s ago",
    minutesAgo: "{n}m ago",
    meta: "IP {ip}   ·   Port {port}   ·   Profile {profile}",
    workshop: "Workshop: {path}",
    workshopMissing: "Workshop: not found — choose your Steam folder",
    promptPaths:
      "Could not find PZ Map / PZ Pulse workshop files automatically.\n\nClick OK to select your Steam steamapps folder\n(or the folder that contains workshop\\content\\108600).",
    modsNotFound:
      "That folder does not contain PZ Map / PZ Pulse web UI files. Select your Steam steamapps directory and try again.",
    partialMatch: "Found some mods but missing:\n- {list}",
    pathsSaved: "Mod folders found and saved.",
    cannotStartPaths: "Both PZ Map and PZ Pulse web UIs are required. Choose your Steam folder first.",
    portInUse: "Could not bind port {port}. Is another instance running?",
    cannotStart: "Cannot start",
    dialogFolderTitle: "Select Steam steamapps (or workshop content 108600) folder",
  },
  tr: {
    statusRunning: "ÇALIŞIYOR",
    statusStopped: "DURDURULDU",
    warn: "Sunucu açıkken aynı Wi‑Fi’deki cihazlar Map/Pulse verisini okuyabilir.",
    startServer: "Sunucuyu Başlat",
    stopServer: "Sunucuyu Durdur",
    chooseFolder: "Steam Klasörü Seç…",
    language: "Dil",
    copyUrl: "URL Kopyala",
    showUrl: "Göster",
    hideUrl: "Gizle",
    urlHidden: "URL gizli",
    urlMissing: "Mod web arayüzü bulunamadı.",
    noQr: "QR yok",
    webOk: "Web arayüzü: TAMAM",
    webMissing: "Web arayüzü: EKSİK",
    dataOk: "Veri: TAMAM",
    dataMissing: "Veri: EKSİK (modu açıp oyunu başlatın)",
    activeDevices: "Aktif cihazlar",
    devicesHint: "Dinlenen istemciler (aktif ≤ {seconds}sn)",
    devicesEmpty: "Henüz cihaz yok.<br />Sunucuyu başlatıp telefonda QR’ı açın.",
    active: "AKTİF",
    idle: "boşta",
    justNow: "az önce",
    secondsAgo: "{n}sn önce",
    minutesAgo: "{n}dk önce",
    meta: "IP {ip}   ·   Port {port}   ·   Profil {profile}",
    workshop: "Workshop: {path}",
    workshopMissing: "Workshop: bulunamadı — Steam klasörünü seçin",
    promptPaths:
      "PZ Map / PZ Pulse workshop dosyaları otomatik bulunamadı.\n\nSteam steamapps klasörünü seçmek için Tamam’a tıklayın\n(veya workshop\\content\\108600 içeren klasörü).",
    modsNotFound:
      "Bu klasörde PZ Map / PZ Pulse web dosyaları yok. Steam steamapps dizinini seçip tekrar deneyin.",
    partialMatch: "Bazı modlar bulundu, eksikler:\n- {list}",
    pathsSaved: "Mod klasörleri bulundu ve kaydedildi.",
    cannotStartPaths: "Hem PZ Map hem PZ Pulse web arayüzleri gerekli. Önce Steam klasörünü seçin.",
    portInUse: "Port {port} kullanılamıyor. Başka bir örnek çalışıyor olabilir mi?",
    cannotStart: "Başlatılamıyor",
    dialogFolderTitle: "Steam steamapps (veya workshop content 108600) klasörünü seçin",
  },
};

function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ""
  );
}

window.I18N = { STRINGS, format };
