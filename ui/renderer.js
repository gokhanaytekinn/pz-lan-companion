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
const ipSelect = document.getElementById("ipSelect");
const portInput = document.getElementById("portInput");
const modMap = document.getElementById("modMap");
const modPulse = document.getElementById("modPulse");

/** @type {Record<string, string>} */
let urls = {};
/** @type {Record<string, boolean>} */
let urlVisible = { map: false, pulse: false };
/** @type {"en" | "tr"} */
let lang = "en";
/** @type {object | null} */
let lastState = null;
let isRunning = false;
let applyingSettings = false;

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

function syncSettingsControls(state) {
  applyingSettings = true;
  const ips = state.availableIps || [];
  ipSelect.innerHTML = "";
  for (const ip of ips) {
    const opt = document.createElement("option");
    opt.value = ip;
    opt.textContent = ip;
    ipSelect.appendChild(opt);
  }
  ipSelect.value = state.localIp || ips[0] || "";
  portInput.value = String(state.port || 8080);
  modMap.checked = state.enabledMods?.map !== false;
  modPulse.checked = state.enabledMods?.pulse !== false;
  applyingSettings = false;
}

function refreshUrlBox(modKey) {
  const el = panel(modKey);
  if (!el) return;
  const urlBox = el.querySelector(".url-box");
  const toggle = el.querySelector(".toggle-url-btn");
  const copy = el.querySelector(".copy-btn");
  const url = urls[modKey] || "";
  if (!url) {
    urlBox.value = t("urlMissing");
    if (toggle) toggle.disabled = true;
    if (copy) copy.disabled = true;
    return;
  }
  if (toggle) toggle.disabled = false;
  if (copy) copy.disabled = false;
  urlBox.value = urlVisible[modKey] ? url : t("urlHidden");
  if (toggle) toggle.textContent = urlVisible[modKey] ? t("hideUrl") : t("showUrl");
}

function renderMod(mod) {
  const el = panel(mod.key);
  if (!el) return;
  const qr = el.querySelector(".qr");
  const fallback = el.querySelector(".qr-fallback");
  const status = el.querySelector(".mod-status");
  const badge = el.querySelector(`[data-enabled-badge="${mod.key}"]`);

  el.classList.toggle("disabled-mod", !mod.enabled);
  if (badge) {
    badge.textContent = mod.enabled ? t("modOn") : t("modOff");
    badge.classList.toggle("on", mod.enabled);
    badge.classList.toggle("off", !mod.enabled);
  }

  urls[mod.key] = mod.enabled ? mod.url || "" : "";

  if (mod.enabled && mod.qrDataUrl) {
    qr.src = mod.qrDataUrl;
    qr.hidden = false;
    fallback.hidden = true;
  } else {
    qr.removeAttribute("src");
    qr.hidden = true;
    fallback.hidden = false;
    fallback.textContent = mod.enabled ? t("noQr") : t("modDisabled");
  }

  if (!mod.enabled) {
    status.textContent = t("modDisabled");
    status.classList.remove("ok", "bad");
  } else {
    const lines = [
      mod.webOk ? t("webOk") : t("webMissing"),
      mod.dataOk ? t("dataOk") : t("dataMissing"),
    ];
    status.textContent = lines.join("\n");
    status.classList.toggle("ok", mod.webOk);
    status.classList.toggle("bad", !mod.webOk);
  }

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

    const title = document.createElement("div");
    title.className = "device-title";
    const label = row.nickname ? `${row.nickname} (${row.ip})` : row.ip;
    title.textContent = `${label}  ·  ${state}  ·  ${ageText}`;

    const meta = document.createElement("div");
    meta.className = "device-meta";
    meta.textContent = pathHint(row.lastPath);

    const nickRow = document.createElement("div");
    nickRow.className = "device-nick";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 40;
    input.value = row.nickname || "";
    input.placeholder = t("nicknamePlaceholder");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn nick-save";
    saveBtn.textContent = t("saveNickname");
    saveBtn.addEventListener("click", async () => {
      const result = await window.pz.setDeviceNickname(row.ip, input.value);
      if (result.ok) applyState(result.state);
    });
    nickRow.appendChild(input);
    nickRow.appendChild(saveBtn);

    div.appendChild(title);
    div.appendChild(meta);
    div.appendChild(nickRow);
    devicesList.appendChild(div);
  }
}

function applyState(state) {
  if (!state) return;
  lastState = state;
  setRunning(Boolean(state.running));
  syncSettingsControls(state);
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

async function pushSettings(patch) {
  if (applyingSettings) return;
  const result = await window.pz.updateSettings(patch);
  if (!result.ok) {
    if (result.errorKey === "portInUse") {
      window.alert(t("portInUse", { port: result.port || portInput.value }));
    } else if (result.error) {
      window.alert(result.error);
    }
  }
  if (result.state) applyState(result.state);
}

startBtn.addEventListener("click", async () => {
  const result = await window.pz.startServer();
  if (!result.ok) {
    let message = result.error || t("cannotStart");
    if (result.errorKey === "cannotStartPaths") message = t("cannotStartPaths");
    if (result.errorKey === "noModsEnabled") message = t("noModsEnabled");
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

ipSelect.addEventListener("change", () => {
  pushSettings({ selectedIp: ipSelect.value });
});

portInput.addEventListener("change", () => {
  const port = Number(portInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    window.alert(t("invalidPort"));
    if (lastState) portInput.value = String(lastState.port || 8080);
    return;
  }
  pushSettings({ port });
});

function syncModToggles() {
  pushSettings({
    enabledMods: {
      map: modMap.checked,
      pulse: modPulse.checked,
    },
  });
}

modMap.addEventListener("change", syncModToggles);
modPulse.addEventListener("change", syncModToggles);

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
      if (lastState) {
        lastState.devices = status.devices || [];
        lastState.availableIps = status.availableIps || lastState.availableIps;
        lastState.localIp = status.selectedIp || lastState.localIp;
        lastState.port = status.port || lastState.port;
      }
      if (!applyingSettings && status.availableIps) {
        const current = ipSelect.value;
        const editingIp = document.activeElement === ipSelect;
        if (!editingIp) {
          applyingSettings = true;
          ipSelect.innerHTML = "";
          for (const ip of status.availableIps) {
            const opt = document.createElement("option");
            opt.value = ip;
            opt.textContent = ip;
            ipSelect.appendChild(opt);
          }
          ipSelect.value = status.selectedIp || current || status.availableIps[0] || "";
          applyingSettings = false;
        }
      }
      const nickEditing = document.activeElement && document.activeElement.closest(".device-nick");
      if (!nickEditing) {
        renderDevices(status.devices || [], status.activeSeconds || 15);
      }
      setRunning(Boolean(status.running));
      if (lastState) {
        metaLabel.textContent = t("meta", {
          ip: status.selectedIp || lastState.localIp,
          port: status.port || lastState.port,
          profile: lastState.profile,
        });
      }
    } catch {
      // ignore
    }
  }, 1000);
})();
