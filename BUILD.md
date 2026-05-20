# SYNCERA — Build & Distribute Guide

## Quick build (one command)

```bash
npm run build
```

This produces a Windows installer (.exe) at `dist-electron/SYNCERA-Setup-1.0.0-x64.exe`.

## Build variants

| Command | Output |
|---|---|
| `npm run build` | NSIS installer (recommended for selling) |
| `npm run build:portable` | Portable .exe (no install required) |
| `npm run build:all` | Both NSIS + portable |
| `npm run pack` | Unpacked folder (for testing, no installer) |

## What ships in the installer

✅ Included (everything user needs to run the app):
- All compiled React UI (dist/)
- Electron runtime (~150 MB)
- Node.js bridges (Baileys, sql.js, AI, Drive)
- App icons, splash, license
- All `node_modules` production dependencies

❌ Excluded automatically (your private data stays on YOUR machine):
- `%APPDATA%/syncera/wa-bizai.db` — your conversations, contacts, KB
- `%APPDATA%/syncera/wa-auth/` — your WhatsApp session
- `%APPDATA%/syncera/media/` — saved attachments
- Dev tools, tests, source maps, READMEs of deps
- Seed scripts (seed-electrical-kb-full.js etc.)

**On fresh PC: user gets EMPTY app. They scan QR with their own number, set their own business profile, build their own KB.**

## Where user data lives (per machine)

```
%APPDATA%\syncera\
  ├── wa-bizai.db          ← SQLite database (conversations, settings, KB)
  ├── wa-auth/             ← Baileys auth (WhatsApp session)
  └── media/               ← Downloaded images / videos / docs
```

On uninstall: data is **preserved** (`deleteAppDataOnUninstall: false`). User can reinstall later without losing data. To fully reset, user manually deletes `%APPDATA%\syncera`.

## AI setup notes for end users

The installer does NOT bundle AI models (would be 5+ GB). AI works in 3 tiers:

1. **Pollinations.ai** (default fallback) — works immediately, free, online, no setup
2. **Ollama** — user installs from ollama.com → app auto-detects → faster, private, offline
3. **LM Studio** — user runs local server → app auto-detects

App's "Detect AI" button in Settings scans for backends.

## Installer features

- ✅ License agreement page (build/LICENSE.txt)
- ✅ User chooses install directory
- ✅ Per-user install (no admin needed)
- ✅ Desktop + Start Menu shortcut auto-created
- ✅ Proper uninstaller in "Add/Remove Programs"
- ✅ Run after finish option
- ✅ Maximum compression (smaller download)
- ✅ Code-signing ready (add cert later)

## Code signing (optional, recommended for sale)

To avoid Windows SmartScreen warnings, sign the installer with an EV code-signing certificate. Add to `package.json` → `build.win`:

```json
"certificateFile": "path/to/cert.pfx",
"certificatePassword": "YOUR_PASSWORD"
```

Or use environment variables `CSC_LINK` and `CSC_KEY_PASSWORD`.

## Versioning for updates

Update `package.json` → `"version": "1.0.1"` before each release. NSIS auto-handles upgrade-in-place.

## Distribution

Upload `dist-electron/SYNCERA-Setup-1.0.0-x64.exe` to:
- Gumroad / Lemon Squeezy / Stripe Payment Links (digital sales)
- Your own website with payment gateway
- Bundle download link in email after purchase

Installer size: ~180-220 MB (Electron baseline + dependencies).

---

## Troubleshooting

**Build fails with "cannot find sql-wasm.wasm"** — Run `npm install` first.

**Antivirus flags installer** — Normal for unsigned Electron apps. Sign with EV cert to eliminate warnings.

**App shows old data after install** — User's `%APPDATA%\syncera` is from previous install. Manual delete or use the in-app "Clear Chat" / "Disconnect WA" buttons.
