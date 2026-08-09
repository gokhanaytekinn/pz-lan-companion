# PZ Companion

Desktop companion for **Project Zomboid** mods **[PZ Map](https://steamcommunity.com/sharedfiles/filedetails/?id=3770149036)** and **[PZ Pulse](https://steamcommunity.com/sharedfiles/filedetails/?id=3753700423)**.

It serves the mod web UIs and live Lua data on your local Wi‑Fi so you can open them on a phone or tablet via QR code.

## Run (terminal only)

Requires [Node.js](https://nodejs.org/) 20+.

```bat
npm install
npm start
```

Or:

```bat
.\start.bat
```

There is no portable exe / GitHub Actions release build in this project. Use the terminal commands above.

## Requirements

- Windows PC running Project Zomboid
- PZ Map and/or PZ Pulse subscribed in Steam Workshop
- Phone/tablet on the **same Wi‑Fi** as the PC
- Allow local network access on the chosen port (default **8080**)

## Features

- Start / stop LAN server
- **IP selector** (multi-adapter / VPN friendly)
- **Port setting**
- **Per-mod broadcast** (enable Map and/or Pulse)
- QR codes + copy URL (URLs hidden by default)
- Active devices with **nicknames**
- Turkish / English UI (follows system language when possible)
- Steam workshop auto-detect + manual folder picker

## How to use

1. Start Project Zomboid with the mods enabled (so `Zomboid\Lua\PZ_*` data folders exist)
2. Run `npm start`
3. Confirm Steam / workshop paths (or choose the folder when prompted)
4. Pick IP / port and enable the mods you want
5. Click **Start Server**
6. Scan a QR code on your phone
7. Click **Stop Server** when finished

## Steam folder detection

The app looks for Steam libraries via:

- Windows registry
- `libraryfolders.vdf`
- Common install locations

If mods are missing, use **Choose Steam Folder…** and select your `steamapps` folder (or `workshop\content\108600`). Settings are saved under `%APPDATA%\PZCompanion\config.json` (language, IP, port, enabled mods, device nicknames, manual path).

## Security

While the server is **Start**ed, devices on the same LAN can read only these mounts (for enabled mods):

| URL | Content |
|-----|---------|
| `/mods/map/` | PZ Map web UI |
| `/mods/pulse/` | PZ Pulse web UI |
| `/data/map/` | `%USERPROFILE%\Zomboid\Lua\PZ_Map` |
| `/data/pulse/` | `%USERPROFILE%\Zomboid\Lua\PZ_Pulse` |

Your whole disk is **not** shared. Path traversal outside these folders is blocked.  
There is no password; do not use on untrusted public Wi‑Fi.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| QR opens but data 404 | Start the game with the mod so `Zomboid\Lua\PZ_*` exists |
| Workshop not found | Use **Choose Steam Folder…** |
| Phone cannot connect | Same Wi‑Fi, allow firewall for the selected port, press Start |
| Port in use | Change port in the UI, or stop the other process |
| Wrong QR / unreachable | Pick the correct LAN IP from the IP selector |

## License

Use freely with Project Zomboid workshop mods. Not affiliated with The Indie Stone.
