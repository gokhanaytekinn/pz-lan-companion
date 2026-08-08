# PZ Companion

Desktop companion for **Project Zomboid** mods **PZ Map** and **PZ Pulse**.  
It broadcasts the mod web UIs and live Lua data over your local Wi‑Fi so you can open them on a phone or tablet via QR code.

## Download (recommended)

1. Open the [**Releases**](../../releases) page
2. Download **`PZ_Companion-portable.zip`**
3. Extract anywhere
4. Double‑click **`PZ_Companion.exe`**
5. Press **Start Server** and scan a QR code

No installer. No Python required for the portable build.

> Windows may warn about an unsigned app (Smart App Control / SmartScreen). That is expected for community builds. If blocked, use the source / `run.bat` method below.

## Requirements

- Windows PC running Project Zomboid
- [PZ Map](https://steamcommunity.com/sharedfiles/filedetails/?id=3770149036) and [PZ Pulse](https://steamcommunity.com/sharedfiles/filedetails/?id=3753700423) subscribed in Steam Workshop
- Phone/tablet on the **same Wi‑Fi** as the PC
- Allow local network access on port **8080** (Windows Firewall prompt)

## How to use

1. Start Project Zomboid with the mods enabled (so data folders are written)
2. Open **PZ Companion**
3. Confirm Steam / workshop paths were found (or choose the folder when prompted)
4. Click **Start Server**
5. Scan **PZ Map** or **PZ Pulse** QR with your phone
6. Watch **Active devices** for connected clients
7. Click **Stop Server** when finished

## Run from source

```bat
python -m pip install -r requirements.txt
.\run.bat
```

Or:

```bat
python app.py
```

CLI-only server (no GUI):

```bat
python main.py
```

## Build portable zip locally

```bat
.\build.bat
```

Output:

- `dist\PZ_Companion.exe`
- `dist\PZ_Companion-portable.zip`

## Publishing a GitHub Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions builds `PZ_Companion-portable.zip` and attaches it to the release.

## Steam folder detection

The app tries to find Steam libraries via:

- Windows registry
- `libraryfolders.vdf`
- Common install locations

If mods are missing, use **Choose Steam Folder…** and select your `steamapps` folder (or `workshop\content\108600`). The choice is saved under `%APPDATA%\PZCompanion\config.json`.

## Security

While the server is **Start**ed, devices on the same LAN can read only these mounts:

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
| Phone cannot connect | Same Wi‑Fi, allow firewall port 8080, press Start |
| Port in use | Stop another PZ Companion / process using 8080 |
| Exe blocked | Use `.\run.bat` with Python, or allow the app in Windows Security |

## License

Use freely with Project Zomboid workshop mods. Not affiliated with The Indie Stone.
