# PZ Companion

LAN companion for Project Zomboid mods **[PZ Map](https://steamcommunity.com/sharedfiles/filedetails/?id=3770149036)** and **[PZ Pulse](https://steamcommunity.com/sharedfiles/filedetails/?id=3753700423)**.

Serves the mod web UIs and live Lua data over your Wi‑Fi so you can open them on a phone or tablet via QR code.

## Quick start

1. Install [Node.js 20+ (LTS)](https://nodejs.org/)
2. Open this project folder
3. Double‑click `start.bat`

First run installs dependencies, then opens the app.

```bat
npm install
npm start
```

## Requirements

- Windows PC with Project Zomboid
- PZ Map and/or PZ Pulse from the Steam Workshop
- Phone/tablet on the same Wi‑Fi
- Firewall allow for the chosen port (default `8080`)

## Features

- Start / stop LAN server
- IP selector and custom port
- Enable Map and/or Pulse separately
- QR codes and copy URL (hidden by default)
- Active devices with nicknames
- Turkish / English UI
- Steam workshop auto-detect + folder picker

## Usage

1. Start Project Zomboid with the mods enabled
2. Run `start.bat`
3. Confirm or choose the Steam folder if asked
4. Pick IP / port and enabled mods
5. Click **Start Server** and scan a QR code
6. Click **Stop Server** when done

Settings are stored in `%APPDATA%\PZCompanion\config.json`.

## Security

While the server is running, only these paths are shared on the LAN (for enabled mods):

| URL | Content |
|-----|---------|
| `/mods/map/` | PZ Map web UI |
| `/mods/pulse/` | PZ Pulse web UI |
| `/data/map/` | `%USERPROFILE%\Zomboid\Lua\PZ_Map` |
| `/data/pulse/` | `%USERPROFILE%\Zomboid\Lua\PZ_Pulse` |

The rest of the disk is not exposed. No password — avoid untrusted Wi‑Fi.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Node.js not found | Install [Node.js LTS](https://nodejs.org/), then run `start.bat` again |
| First run is slow | Normal — dependencies download once |
| QR opens, data 404 | Launch the game with the mod so `Zomboid\Lua\PZ_*` exists |
| Workshop not found | Use **Choose Steam Folder…** |
| Phone cannot connect | Same Wi‑Fi, allow the port in firewall, press Start |
| Port in use | Change the port in the UI |
| Wrong / unreachable QR | Select the correct LAN IP |

## License

Free to use with Project Zomboid workshop mods. Not affiliated with The Indie Stone.
