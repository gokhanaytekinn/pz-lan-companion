"use strict";

const statusPill = document.getElementById("statusPill");
const metaLabel = document.getElementById("metaLabel");
const pathLabel = document.getElementById("pathLabel");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const folderBtn = document.getElementById("folderBtn");
const devicesHint = document.getElementById("devicesHint");
const devicesList = document.getElementById("devicesList");

/** @type {Record<string, string>} */
let urls = {};

function panel(modKey) {
  return document.querySelector(`.panel[data-mod="${modKey}"]`);
}

function setRunning(running) {
  statusPill.textContent = running ? "RUNNING" : "STOPPED";
  statusPill.classList.toggle("running", running);
  statusPill.classList.toggle("stopped", !running);
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

function renderMod(mod) {
  const el = panel(mod.key);
  if (!el) return;
  const qr = el.querySelector(".qr");
  const fallback = el.querySelector(".qr-fallback");
  const status = el.querySelector(".mod-status");
  const urlBox = el.querySelector(".url-box");

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
    `Web UI: ${mod.webOk ? "OK" : "MISSING"}`,
    `Data: ${mod.dataOk ? "OK" : "MISSING (start game with mod)"}`,
  ];
  status.textContent = lines.join("\n");
  status.classList.toggle("ok", mod.webOk);
  status.classList.toggle("bad", !mod.webOk);

  urlBox.value = mod.url || "Mod web UI not found.";
}

function pathHint(p) {
  const lower = (p || "").toLowerCase();
  if (lower.includes("/mods/map") || lower.includes("/data/map")) return "PZ Map";
  if (lower.includes("/mods/pulse") || lower.includes("/data/pulse")) return "PZ Pulse";
  return p ? p.slice(-40) : "—";
}

function renderDevices(rows, activeSeconds) {
  devicesHint.textContent = `Listening clients (active ≤ ${Math.trunc(activeSeconds)}s)`;
  devicesList.innerHTML = "";
  if (!rows || !rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.innerHTML = "No devices yet.<br />Start the server and open a QR on your phone.";
    devicesList.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const age = Math.trunc(row.ageSeconds);
    let ageText = "just now";
    if (age >= 60) ageText = `${Math.floor(age / 60)}m ago`;
    else if (age >= 1) ageText = `${age}s ago`;
    const state = row.active ? "ACTIVE" : "idle";
    const div = document.createElement("div");
    div.className = `device${row.active ? " active" : ""}`;
    div.textContent =
      `${row.ip}  ·  ${state}  ·  ${ageText}\n` +
      `${pathHint(row.lastPath)}  ·  ${row.requestCount} req`;
    devicesList.appendChild(div);
  }
}

function applyState(state) {
  if (!state) return;
  setRunning(Boolean(state.running));
  metaLabel.textContent = `IP ${state.localIp}   ·   Port ${state.port}   ·   Profile ${state.profile}`;
  if (state.paths && state.paths.workshopRoot) {
    pathLabel.textContent = `Workshop: ${state.paths.workshopRoot}`;
  } else {
    pathLabel.textContent = "Workshop: not found — choose your Steam folder";
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
  const ok = window.confirm(
    "Could not find PZ Map / PZ Pulse workshop files automatically.\n\n" +
      "Click OK to select your Steam steamapps folder\n" +
      "(or the folder that contains workshop\\content\\108600)."
  );
  if (ok) await chooseFolder();
}

async function chooseFolder() {
  const result = await window.pz.chooseFolder();
  if (result.cancelled) return;
  if (!result.ok) {
    window.alert(result.error || "Mods not found");
    return;
  }
  applyState(result.state);
  if (result.partial) {
    window.alert("Found some mods but missing:\n- " + result.missing.join("\n- "));
  } else {
    window.alert("Mod folders found and saved.");
  }
}

startBtn.addEventListener("click", async () => {
  const result = await window.pz.startServer();
  if (!result.ok) {
    window.alert(result.error || "Cannot start");
    if ((result.error || "").includes("Choose your Steam")) {
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

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const key = btn.getAttribute("data-copy");
    const url = urls[key];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  });
});

(async () => {
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
