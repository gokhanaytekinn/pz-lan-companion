"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const inCI = Boolean(process.env.GITHUB_ACTIONS);
// Build unpacked Electron tree outside the workspace so Cursor/AV don't lock app.asar.
const outDir = inCI
  ? path.join(root, "release")
  : path.join(os.tmpdir(), "pz-lan-companion-release");

function rmSafe(target) {
  if (!fs.existsSync(target)) return true;
  try {
    fs.rmSync(target, { recursive: true, force: true });
    return true;
  } catch (err) {
    if (err && (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES")) {
      const relocated = `${target}.old-${Date.now()}`;
      try {
        fs.renameSync(target, relocated);
        console.warn(`Locked path renamed to ${relocated}`);
        return true;
      } catch (renameErr) {
        console.warn(`Leaving locked path in place: ${target} (${renameErr.message})`);
        return false;
      }
    }
    throw err;
  }
}

rmSafe(outDir);
fs.mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  "npx",
  ["electron-builder", "--win", "portable", "zip", `--config.directories.output=${outDir}`],
  { cwd: root, stdio: "inherit", shell: true }
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}

const artifacts = ["PZ_Companion-portable.exe", "PZ_Companion-portable.zip"];
const localRelease = path.join(root, "release");

if (!inCI) {
  fs.mkdirSync(localRelease, { recursive: true });
  // Remove previous unpacked tree if present (often locked by Cursor).
  rmSafe(path.join(localRelease, "win-unpacked"));
  for (const name of artifacts) {
    const src = path.join(outDir, name);
    const dest = path.join(localRelease, name);
    if (!fs.existsSync(src)) {
      console.error(`Missing artifact: ${src}`);
      process.exit(1);
    }
    fs.copyFileSync(src, dest);
    console.log(`Copied ${name} -> release\\${name}`);
  }
  console.log(`\nBuild tree kept at: ${outDir}`);
  console.log(`Artifacts for use: ${localRelease}`);
} else {
  for (const name of artifacts) {
    if (!fs.existsSync(path.join(outDir, name))) {
      console.error(`Missing artifact: ${name}`);
      process.exit(1);
    }
  }
}
