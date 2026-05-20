# SYNCERA — Auto-Update Deployment Guide

## What's Built In

✅ Auto-checking for updates every 4 hours (silent)
✅ First check 30 seconds after each app launch
✅ "Check for Updates" button in **Settings → About**
✅ Floating update banner (bottom-right) when:
   - Update available → "Download Update" button
   - Downloading → progress bar + speed
   - Downloaded → "Restart & Install" button
✅ Native dialog popup when update is ready
✅ Logs at `%APPDATA%/syncera/logs/main.log`
✅ Skips checks in dev mode (no false alarms)

---

## How Updates Are Delivered — Architecture

```
┌──────────────────────────────────┐         ┌─────────────────────────────┐
│  Update Server (you control)      │         │  User's PC                  │
│                                   │         │                             │
│  https://updates.darksea.network/ │  HTTPS  │  SYNCERA v1.0.0 running    │
│    syncera/latest/                │ ◄─────► │  electron-updater checks   │
│      ├── latest.yml               │  query  │  every 4 hours              │
│      ├── SYNCERA-Setup-1.0.1.exe  │         │                             │
│      └── SYNCERA-Setup-1.0.1.exe  │         │  If newer version found:    │
│          .blockmap                │         │  - Show banner to user      │
└──────────────────────────────────┘         │  - User clicks Download     │
                                              │  - User clicks Install      │
                                              │  - App restarts on v1.0.1   │
                                              └─────────────────────────────┘
```

---

## STEP 1 — Set up the update server (one-time)

You have 3 options. Pick one.

### Option A — Cloudflare R2 (Recommended, almost free)
- Free 10 GB storage, free egress on Workers/CDN
- Custom domain support
- Globally fast

Setup:
1. Sign up at https://www.cloudflare.com → R2
2. Create a bucket: `syncera-updates`
3. Enable public access (Settings → Public access → Allow)
4. Add custom domain: `updates.darksea.network` (or use the r2.dev URL)
5. Update `package.json` → `build.publish[0].url` to point at the bucket

### Option B — GitHub Releases (Free, public visibility)
Best if you don't mind anyone being able to download.

1. Create a private repo `darksea/syncera-releases`
2. Change `package.json` publish to:
   ```json
   "publish": [{
     "provider": "github",
     "owner": "darksea",
     "repo": "syncera-releases",
     "private": false
   }]
   ```
3. Set env var: `GH_TOKEN=ghp_yourtoken`
4. When building, electron-builder auto-uploads to Releases

### Option C — Your own VPS / shared hosting
1. Get any HTTP host with HTTPS (Cloudflare Pages, Vercel, Netlify all free)
2. Upload files to a directory served at `https://updates.darksea.network/syncera/latest/`
3. That's it — current `package.json` already points here

---

## STEP 2 — Release a new version

Every time you fix a bug or add a feature:

### 2.1 Bump the version
Edit `package.json`:
```json
"version": "1.0.1"  ← change this
```

Semver rules:
- **Patch** (1.0.0 → 1.0.1) — bug fixes
- **Minor** (1.0.0 → 1.1.0) — new features, backward compatible
- **Major** (1.0.0 → 2.0.0) — breaking changes

### 2.2 Build the installer
```bash
npm run build
```

This creates 3 files in `dist-electron/`:
- `SYNCERA-Setup-1.0.1-x64.exe` ← the installer
- `SYNCERA-Setup-1.0.1-x64.exe.blockmap` ← for delta updates
- `latest.yml` ← version metadata (electron-updater reads this)

### 2.3 Upload all 3 files to your update server
The directory structure must be exact:

```
https://updates.darksea.network/syncera/latest/
   ├── latest.yml
   ├── SYNCERA-Setup-1.0.1-x64.exe
   └── SYNCERA-Setup-1.0.1-x64.exe.blockmap
```

### 2.4 Verify
Wait 30 seconds, then open SYNCERA on a test PC running the old version. The update banner should appear within 4 hours (or click "Check for Updates" in Settings → About to trigger immediately).

---

## STEP 3 — Automated publish (optional, faster)

Instead of manual upload, use `electron-builder` to push automatically.

For Cloudflare R2 or S3:
```bash
# Set env vars (once, or in .env.local)
$env:AWS_ACCESS_KEY_ID="your-r2-key"
$env:AWS_SECRET_ACCESS_KEY="your-r2-secret"
$env:AWS_S3_ENDPOINT="https://abc.r2.cloudflarestorage.com"

# Build + publish in one command
npm run build -- --publish always
```

For GitHub:
```bash
$env:GH_TOKEN="ghp_..."
npm run build -- --publish always
```

---

## STEP 4 — Test the update flow before going live

### Test plan
1. Build v1.0.0 → install on a test PC
2. Bump version to 1.0.1 → build again
3. Upload v1.0.1 files to update server
4. On test PC running v1.0.0:
   - Open SYNCERA
   - Wait ~30 seconds OR click "Check for Updates" in Settings
   - Expect: bottom-right banner "SYNCERA Update Available · v1.0.1"
   - Click "Download Update" → progress bar appears
   - When done: native dialog "Restart Now / Later"
   - Click Restart → app closes, installer runs, app reopens on v1.0.1
   - Verify: Settings → About shows v1.0.1

### Common issues

**"Cannot check for updates" error in dev mode**
Expected — auto-update only works in packaged builds. Build with `npm run build` then run the installer.

**Banner doesn't appear**
- Check `%APPDATA%/syncera/logs/main.log` for errors
- Verify `latest.yml` accessible via browser: `curl https://updates.darksea.network/syncera/latest/latest.yml`
- Verify version in `latest.yml` is higher than installed version

**Update downloads but won't install**
- Likely needs Administrator rights — make sure installer was built with `perMachine: false` (already set)
- Check disk space (need 200 MB+ free)

**Customer sees "verifying signature" error**
You haven't code-signed the new version. You have 2 options:
- Sign with EV certificate (RM 1,500/year, eliminates all warnings)
- Keep `verifyUpdateCodeSignature: false` in build config (already set — works without signing)

---

## Pricing — Update Server Costs

| Option | Setup Cost | Monthly Cost | Notes |
|---|---|---|---|
| **Cloudflare R2** | Free | ~RM 0-5 | Best for production. 10 GB free. |
| **GitHub Releases** | Free | Free | Files publicly accessible. |
| **Cloudflare Pages** | Free | Free | Free for static files. |
| **AWS S3** | Free | RM 5-20 | Standard option, more expensive than R2. |
| **Self-hosted (VPS)** | RM 20+ | RM 20+ | Full control. Overkill for this. |

**Recommendation:** Cloudflare R2 with custom domain. Total cost for first 1,000 customers ≈ RM 0/month.

---

## Server Folder Structure (when ready)

```
https://updates.darksea.network/syncera/
   ├── latest/                       ← Stable channel
   │   ├── latest.yml
   │   ├── SYNCERA-Setup-1.0.1-x64.exe
   │   └── SYNCERA-Setup-1.0.1-x64.exe.blockmap
   │
   ├── beta/                         ← (Optional) Beta channel
   │   ├── beta.yml
   │   └── ...
   │
   └── archive/                      ← (Optional) Old versions
       ├── 1.0.0/
       └── 1.0.1/
```

To enable beta channel:
1. In `electron/bridge/updater.js`, set `autoUpdater.allowPrerelease = true` (or expose as a setting)
2. Upload separate files under `/beta/beta.yml`
3. Bump beta version with `-beta.1` suffix: `"version": "1.1.0-beta.1"`

---

## Security Notes

1. **HTTPS required** — electron-updater rejects HTTP URLs (good for you, for free).
2. **Domain pinning** — only your server can serve updates (URL is hardcoded in the app binary).
3. **No tampering** — `blockmap` file contains hashes; modified `.exe` would fail integrity check.
4. **Code signing (optional but recommended)** — Eliminates Windows SmartScreen warnings:
   - Buy EV code signing cert (~RM 1,500/year from Sectigo, DigiCert, etc.)
   - Add to `package.json`:
     ```json
     "win": {
       "certificateFile": "path/to/cert.pfx",
       "certificatePassword": "..."
     }
     ```
   - Or use env vars: `CSC_LINK`, `CSC_KEY_PASSWORD`

---

## What Customer Sees

### Scenario 1: Update available
1. Customer using SYNCERA normally
2. Bottom-right popup appears: 🟢 **"SYNCERA Update Available · v1.0.1"**
3. Shows release notes preview, file size
4. Two buttons: **[Download Update]** or **[Later]**

### Scenario 2: Downloading
1. Click "Download Update"
2. Banner shows progress bar with percentage + MB/s speed
3. Customer can keep using SYNCERA — download is in background

### Scenario 3: Ready to install
1. Download completes
2. Native dialog: **"Version 1.0.1 has been downloaded. Restart SYNCERA to apply."**
3. Two buttons: **[Restart Now]** or **[Later]**
4. If "Later": update applies automatically when customer quits SYNCERA next

### Scenario 4: Manual check (Settings → About)
1. Customer clicks **"Check for Updates"** button
2. If up to date: Native dialog "You are running the latest version (1.0.0)"
3. If update found: Banner appears (same as Scenario 1)

---

## TL;DR — Workflow Summary

**Once setup:**
```bash
1. Fix bug in code
2. Bump version in package.json (1.0.0 → 1.0.1)
3. npm run build
4. Upload 3 files (latest.yml, .exe, .blockmap) to update server
5. Done.
```

All customers on v1.0.0 will get the update banner within 4 hours (or instantly if they manually check).

---

## Contact

For questions about deployment:
**Email:** contact@example.com
**Logs:** `%APPDATA%/syncera/logs/main.log`
