"use strict";

const statusPill = document.getElementById("statusPill");
const metaLabel = document.getElementById("metaLabel");
const pathLabel = document.getElementById("pathLabel");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const folderBtn = document.getElementById("folderBtn");
const devicesHint = document.getElementById("devicesHint");
const devicesList = document.getElementById("devicesList");
const langSelect = document.getElementById("langSelect");

/** @type {Record<string, string>} */
let urls = {};
/** @type {Record<string, boolean>} */
let urlVisible = { map: false, pulse: false };
/** @type {"en" | "tr"} */
let lang = "en";
/** @type {object | null} */
let lastState = null;
let isRunning = false;

function t(key, vars) {
  const table = window.I18N.STRINGS[lang] || window.I18N.STRINGS.en;
  return window.I18N.format(table[key] || window.I18N.STRINGS.en[key] || key, vars);
}

function panel(modKey) {
  return document.querySelector(`.panel[data-mod="${modKey}"]`);
}

function applyStaticI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  document.querySelectorAll(".toggle-url-btn").forEach((btn) => {
    const key = btn.getAttribute("data-toggle-url");
    btn.textContent = urlVisible[key] ? t("hideUrl") : t("showUrl");
  });
  setRunning(isRunning);
}

function setRunning(running) {
  isRunning = Boolean(running);
  statusPill.textContent = isRunning ? t("statusRunning") : t("statusStopped");
  statusPill.classList.toggle("running", isRunning);
  statusPill.classList.toggle("stopped", !isRunning);
  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;
}

function refreshUrlBox(modKey) {
  const el = panel(modKey);
  if (!el) return;
  const urlBox = el.querySelector(".url-box");
  const toggle = el.querySelector(".toggle-url-btn");
  const url = urls[modKey] || "";
  if (!url) {
    urlBox.value = t("urlMissing");
    if (toggle) toggle.disabled = true;
    return;
  }
  if (toggle) toggle.disabled = false;
  urlBox.value = urlVisible[modKey] ? url : t("urlHidden");
  if (toggle) toggle.textContent = urlVisible[modKey] ? t("hideUrl") : t("showUrl");
}

function renderMod(mod) {
  const el = panel(mod.key);
  if (!el) return;
  const qr = el.querySelector(".qr");
  const fallback = el.querySelector(".qr-fallback");
  const status = el.querySelector(".mod-status");

  urls[mod.key] = mod.url || "";

  if (mod.qrDataUrl) {
    qr.src = mod.qrDataUrl;
    qr.hidden = false;
    fallback.hidden = true;
  } else {
    qr.removeAttribute("src");
    qr.hidden = true;
    fallback.hidden = false;
  }

  const lines = [
    mod.webOk ? t("webOk") : t("webMissing"),
    mod.dataOk ? t("dataOk") : t("dataMissing"),
  ];
  status.textContent = lines.join("\n");
  status.classList.toggle("ok", mod.webOk);
  status.classList.toggle("bad", !mod.webOk);

  refreshUrlBox(mod.key);
}

function pathHint(p) {
  const lower = (p || "").toLowerCase();
  if (lower.includes("/mods/map") || lower.includes("/data/map")) return "PZ Map";
  if (lower.includes("/mods/pulse") || lower.includes("/data/pulse")) return "PZ Pulse";
  return p ? p.slice(-40) : "—";
}

function renderDevices(rows, activeSeconds) {
  devicesHint.textContent = t("devicesHint", { seconds: Math.trunc(activeSeconds) });
  devicesList.innerHTML = "";
  if (!rows || !rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.innerHTML = t("devicesEmpty");
    devicesList.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const age = Math.trunc(row.ageSeconds);
    let ageText = t("justNow");
    if (age >= 60) ageText = t("minutesAgo", { n: Math.floor(age / 60) });
    else if (age >= 1) ageText = t("secondsAgo", { n: age });
    const state = row.active ? t("active") : t("idle");
    const div = document.createElement("div");
    div.className = `device${row.active ? " active" : ""}`;
    div.textContent = `${row.ip}  ·  ${state}  ·  ${ageText}\n${pathHint(row.lastPath)}`;
    devicesList.appendChild(div);
  }
}

function applyState(state) {
  if (!state) return;
  lastState = state;
  setRunning(Boolean(state.running));
  metaLabel.textContent = t("meta", {
    ip: state.localIp,
    port: state.port,
    profile: state.profile,
  });
  if (state.paths && state.paths.workshopRoot) {
    pathLabel.textContent = t("workshop", { path: state.paths.workshopRoot });
  } else {
    pathLabel.textContent = t("workshopMissing");
  }
  for (const mod of state.mods || []) renderMod(mod);
  renderDevices(state.devices || [], state.activeSeconds || 15);
}

async function refresh() {
  const state = await window.pz.getState();
  applyState(state);
  return state;
}

async function maybePromptPaths(state) {
  if (state.paths && state.paths.ready) return;
  const ok = window.confirm(t("promptPaths"));
  if (ok) await chooseFolder();
}

async function chooseFolder() {
  const result = await window.pz.chooseFolder();
  if (result.cancelled) return;
  if (!result.ok) {
    window.alert(result.errorKey ? t(result.errorKey) : result.error || t("modsNotFound"));
    return;
  }
  applyState(result.state);
  if (result.partial) {
    window.alert(t("partialMatch", { list: (result.missing || []).join("\n- ") }));
  } else {
    window.alert(t("pathsSaved"));
  }
}

function setLanguage(next) {
  lang = next === "tr" ? "tr" : "en";
  langSelect.value = lang;
  applyStaticI18n();
  if (lastState) applyState(lastState);
}

startBtn.addEventListener("click", async () => {
  const result = await window.pz.startServer();
  if (!result.ok) {
    let message = result.error || t("cannotStart");
    if (result.errorKey === "cannotStartPaths") message = t("cannotStartPaths");
    if (result.errorKey === "portInUse") message = t("portInUse", { port: result.port || 8080 });
    window.alert(message);
    if (result.errorKey === "cannotStartPaths") {
      await maybePromptPaths(await window.pz.getState());
    }
    return;
  }
  applyState(result.state);
});

stopBtn.addEventListener("click", async () => {
  const result = await window.pz.stopServer();
  applyState(result.state);
});

folderBtn.addEventListener("click", () => {
  chooseFolder();
});

langSelect.addEventListener("change", async () => {
  setLanguage(langSelect.value);
  await window.pz.setLanguage(lang);
});

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const key = btn.getAttribute("data-copy");
    const url = urls[key];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  });
});

document.querySelectorAll(".toggle-url-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-toggle-url");
    urlVisible[key] = !urlVisible[key];
    refreshUrlBox(key);
  });
});

(async () => {
  const prefs = await window.pz.getLanguagePrefs();
  setLanguage(prefs.language || "en");
  const state = await refresh();
  await maybePromptPaths(state);
  setInterval(async () => {
    try {
      const status = await window.pz.pollStatus();
      renderDevices(status.devices || [], status.activeSeconds || 15);
      setRunning(Boolean(status.running));
    } catch {
      // ignore
    }
  }, 1000);
})();
