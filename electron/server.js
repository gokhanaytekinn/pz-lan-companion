"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { ACTIVE_SECONDS, mountsFrom } = require("./paths");

function guessType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
  };
  return map[ext] || "application/octet-stream";
}

function safeJoin(root, relative) {
  relative = decodeURIComponent(relative || "").replace(/\\/g, "/");
  if (relative.startsWith("/")) relative = relative.slice(1);
  const parts = [];
  for (const part of relative.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  const candidate = parts.length ? path.join(root, ...parts) : root;
  try {
    const rootResolved = path.resolve(root);
    const candResolved = path.resolve(candidate);
    const rel = path.relative(rootResolved, candResolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return candResolved;
  } catch {
    return null;
  }
}

class ClientActivityTracker {
  constructor(activeSeconds = ACTIVE_SECONDS) {
    this.activeSeconds = activeSeconds;
    this.clients = new Map();
  }

  record(ip, reqPath = "") {
    if (!ip) return;
    const now = Date.now() / 1000;
    const existing = this.clients.get(ip);
    if (!existing) {
      this.clients.set(ip, {
        ip,
        lastSeen: now,
        requestCount: 1,
        lastPath: reqPath,
      });
    } else {
      existing.lastSeen = now;
      existing.requestCount += 1;
      existing.lastPath = reqPath;
    }
  }

  snapshot() {
    const now = Date.now() / 1000;
    const rows = [];
    for (const entry of this.clients.values()) {
      const age = now - entry.lastSeen;
      rows.push({
        ip: entry.ip,
        lastSeen: entry.lastSeen,
        ageSeconds: age,
        active: age <= this.activeSeconds,
        requestCount: entry.requestCount,
        lastPath: entry.lastPath || "",
      });
    }
    rows.sort((a, b) => Number(b.active) - Number(a.active) || a.ageSeconds - b.ageSeconds);
    return rows;
  }

  clear() {
    this.clients.clear();
  }
}

class ServerController {
  constructor(paths, port, tracker, enabledMods) {
    this.paths = paths;
    this.port = port;
    this.enabledMods = enabledMods || { map: true, pulse: true };
    this.tracker = tracker || new ClientActivityTracker();
    this.server = null;
  }

  get running() {
    return this.server !== null;
  }

  setPort(port) {
    this.port = port;
  }

  setEnabledMods(enabledMods) {
    this.enabledMods = enabledMods;
  }

  updatePaths(paths) {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.paths = paths;
    if (wasRunning) return this.start();
    return Promise.resolve();
  }

  async restart() {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    if (wasRunning) await this.start();
  }

  start() {
    if (this.server) return Promise.resolve();
    const mounts = mountsFrom(this.paths, this.enabledMods);
    if (!Object.keys(mounts).length) {
      return Promise.reject(new Error("No mountable mod paths resolved."));
    }

    const tracker = this.tracker;
    const prefixes = Object.keys(mounts).sort((a, b) => b.length - a.length);

    this.server = http.createServer((req, res) => {
      const method = req.method || "GET";
      if (method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }
      if (method !== "GET" && method !== "HEAD") {
        res.writeHead(405, corsHeaders());
        res.end("Method Not Allowed");
        return;
      }

      let pathname = "/";
      try {
        pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
      } catch {
        res.writeHead(400, corsHeaders());
        res.end("Bad Request");
        return;
      }

      const clientIp = req.socket.remoteAddress
        ? req.socket.remoteAddress.replace(/^::ffff:/, "")
        : "";
      tracker.record(clientIp, pathname);

      let matched = null;
      for (const prefix of prefixes) {
        if (pathname === prefix || pathname.startsWith(prefix + "/")) {
          matched = {
            root: mounts[prefix],
            rel: pathname.slice(prefix.length).replace(/^\//, ""),
          };
          break;
        }
      }

      if (!matched) {
        res.writeHead(404, { ...corsHeaders(), "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      let rel = matched.rel;
      if (!rel || rel.endsWith("/")) {
        rel = `${rel || ""}index.html`.replace(/^\//, "");
      }

      const target = safeJoin(matched.root, rel);
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        res.writeHead(404, { ...corsHeaders(), "Content-Type": "text/plain" });
        res.end("File not found");
        return;
      }

      let data;
      try {
        data = fs.readFileSync(target);
      } catch {
        res.writeHead(404, { ...corsHeaders(), "Content-Type": "text/plain" });
        res.end("File not found");
        return;
      }

      res.writeHead(200, {
        ...corsHeaders(),
        "Content-Type": guessType(target),
        "Content-Length": data.length,
      });
      if (method === "HEAD") {
        res.end();
      } else {
        res.end(data);
      }
    });

    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.server = null;
        reject(err);
      };
      this.server.once("error", onError);
      this.server.listen(this.port, () => {
        this.server.removeListener("error", onError);
        resolve();
      });
    });
  }

  stop() {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    try {
      server.close();
    } catch {
      // ignore
    }
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

module.exports = {
  ClientActivityTracker,
  ServerController,
};
