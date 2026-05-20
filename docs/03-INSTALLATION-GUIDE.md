# 03 · Installation Guide

## System Requirements

### Minimum
- **OS:** Windows 10 (64-bit) version 1809 or later
- **CPU:** Intel Core i3 / AMD Ryzen 3 (2 cores, 2.0 GHz)
- **RAM:** 4 GB
- **Storage:** 500 MB free space for app + ~50 MB per 10,000 messages
- **Network:** Internet connection for WhatsApp & AI fallback
- **Display:** 1366 × 768 minimum

### Recommended
- **OS:** Windows 11 (64-bit)
- **CPU:** Intel Core i5 / AMD Ryzen 5 (4 cores, 3.0 GHz+)
- **RAM:** 8 GB (16 GB if running Ollama locally)
- **Storage:** SSD with 5 GB+ free space
- **Display:** 1920 × 1080 or higher

### For Local AI (Ollama / LM Studio)
- **RAM:** 16 GB minimum (32 GB for 13B+ models)
- **CPU:** Modern 8-core processor
- **GPU (optional, dramatically faster):** NVIDIA RTX 3060+ or Apple Silicon

---

## Installation Steps

### Step 1 — Download
Obtain the installer from your authorized SYNCERA reseller or directly from `https://darksea.network/syncera/download` after purchase.

File: **`SYNCERA-Setup-1.0.0-x64.exe`** (~72 MB)

### Step 2 — Run Installer
1. **Double-click** `SYNCERA-Setup-1.0.0-x64.exe`.
2. If Windows SmartScreen appears, click **More info** → **Run anyway**.
   *Reason: Code signing certificates cost ~RM1,500/year; SYNCERA is unsigned by default. Future releases will be EV-signed.*
3. The NSIS installer wizard launches.

### Step 3 — License Agreement
Read the End User License Agreement (EULA). Click **I Agree** to proceed.

Key points:
- Single-PC license (per copy purchased)
- No reverse engineering, redistribution prohibited
- WhatsApp ToS compliance is YOUR responsibility
- No warranty, AS-IS basis

### Step 4 — Choose Installation Location
Default: `C:\Users\<YourName>\AppData\Local\Programs\SYNCERA\`

You may change this. Recommended: keep default (no admin rights required).

### Step 5 — Confirm & Install
The installer copies files and creates:
- Desktop shortcut **SYNCERA**
- Start Menu folder **SYNCERA** → **SYNCERA**
- Uninstall entry in **Control Panel → Programs & Features**

Installation time: 30-90 seconds.

### Step 6 — First Launch
Either:
- Check **Run SYNCERA now** at the end of installer, OR
- Double-click the Desktop **SYNCERA** icon.

The splash screen displays for 10 seconds (one-time-per-launch animation), then the main window opens.

---

## First-Time Setup

### A. Connect WhatsApp
1. The QR Login screen appears.
2. On your phone, open **WhatsApp** → **Settings** → **Linked Devices** → **Link a Device**.
3. Point your phone camera at the QR code shown in SYNCERA.
4. After successful link, SYNCERA shows your connection badge in the title bar (e.g. `Live · 16 May 14:30`).
5. SYNCERA begins **history sync** (downloading past 1000+ messages). Progress shown via toast notification.

**Tip:** Use a dedicated business WhatsApp number, not your personal one. WhatsApp allows up to 4 linked devices per number.

### B. Configure Business Profile
1. Click the **Settings** icon (gear) at the bottom of the left navigation.
2. Open **Profile** section.
3. Fill in:
   - **Business Name** — e.g. "Maju Electrical Sdn Bhd"
   - **Currency** — default `RM`
   - **🧠 Business Profile (AI Brain)** — Long-form description of your business. The AI reads this for every customer message.
     - Example: products, prices, hours, policies, location, personality.
   - **🎭 Default AI Persona** — Character of your AI staff.
4. Click **Save**.

### C. Configure AI Backend
1. Open **Settings → AI Settings**.
2. SYNCERA auto-detects:
   - **Ollama** (if installed) — pre-tested with `llama3.2`, `qwen2.5:7b`
   - **LM Studio** (if running) — uses currently loaded model
   - **Pollinations.ai** — always available, free cloud fallback
3. Select **Default AI Backend** + **Default Model**.
4. Adjust **Reply Delay** (recommended: 2-5 seconds to simulate human typing).
5. Toggle **🚀 Auto-Enable AI for New Customers** ON if you want AI to reply automatically to ALL new conversations.
6. Toggle **📌 AI Disclaimer** ON to attach a one-time disclaimer on the first AI reply per conversation.

### D. Build Knowledge Base
1. Open any conversation in the **Chats** section.
2. Click the **Knowledge** tab in the right panel.
3. Click **+ Add** to create entries:
   - **Category:** Pricing / Products / FAQ / etc.
   - **Title:** e.g. "Standard 13A Socket Pricing"
   - **Content:** e.g. "RM45 supply + install per point. Includes wire (12ft), socket plate, labor. 1-year warranty."
4. Toggle each entry's **Active** state.
5. The AI reads ALL active entries before generating replies.

**Pro tip:** More entries = smarter AI. Build 50-100 entries covering:
- Each product/service with price
- Operating hours
- Delivery / shipping policies
- Refund policies
- Common FAQs
- Brand voice examples ("How do you greet customers?")

### E. (Optional) Setup Google Drive Backup
1. Open **Settings → Drive Backup**.
2. Click **Setup Google OAuth Client ID** (read the inline guide).
3. Paste your Google Cloud OAuth Client ID (free to create).
4. Click **Connect** → browser opens → grant Drive permissions.
5. Enable **Daily auto-backup** if desired.
6. Click **Backup Now** to test.

---

## Verifying Installation

### Quick Smoke Test
1. Open Chats — should show your imported conversations.
2. Click any conversation — messages display correctly.
3. Send a test message (`"Test from SYNCERA"`) — should appear on customer's phone within 1-2 seconds.
4. Toggle **AI Active** on a test contact, then have someone message you — verify AI replies.

### Diagnostics
**Settings → About → Version:** Should show `1.0.0`.
**Title bar:** Green `Live` badge means connected to WhatsApp.
**Inbox header:** Shows total conversations + unread count.

---

## Uninstallation

### Standard Uninstall (preserves data)
1. **Control Panel → Programs & Features → SYNCERA — AI Messenger → Uninstall**.
2. Confirm. NSIS removes the app and shortcuts.
3. Your data (DB, conversations, KB, auth) remains at `%APPDATA%\syncera\`.

### Full Uninstall (delete all data)
After standard uninstall, manually delete:
```
C:\Users\<YourName>\AppData\Roaming\syncera\
```
This removes:
- Database (all conversations, KB, settings)
- WhatsApp auth (forces fresh QR scan)
- Downloaded media

**Warning:** This action is irreversible. Back up via Drive first if needed.

---

## Multiple Installations

SYNCERA supports running on multiple PCs, but each install requires its own license per the EULA. To use the same WhatsApp number on two PCs:
1. WhatsApp allows up to 4 linked devices per phone number.
2. Each SYNCERA install scans QR independently.
3. Conversations sync via WhatsApp's own multi-device protocol — not SYNCERA.
4. Each SYNCERA has its OWN local DB (no cross-machine sync of SYNCERA-specific data like KB, settings, or templates).

To synchronize KB/templates across machines, use **Drive Backup → Restore** on the second machine.

---

## Upgrading

When version 1.0.1+ is released:
1. Download new installer.
2. Run it. NSIS detects existing install and offers **Upgrade**.
3. Your `%APPDATA%\syncera\` data is preserved.
4. Restart the app.

No data migration required for patch versions. Major version upgrades (e.g. 1.x → 2.x) may include a migration wizard if schema changes.

---

## Common Installation Issues

### "Windows protected your PC" / SmartScreen warning
**Cause:** Installer is not code-signed.
**Fix:** Click **More info** → **Run anyway**. To eliminate this permanently, the vendor must purchase and apply an EV code-signing certificate.

### "Cannot create file" during install
**Cause:** Antivirus blocking, or insufficient permissions.
**Fix:** Temporarily disable antivirus real-time protection. Retry. Re-enable AV afterward.

### App launches but immediately crashes
**Cause:** Likely missing Visual C++ Redistributable.
**Fix:** Install [Microsoft Visual C++ Redistributable for Visual Studio 2015-2022 (x64)](https://aka.ms/vs/17/release/vc_redist.x64.exe).

### App opens but stuck on splash screen
**Cause:** First-time database initialization is slow on HDDs.
**Fix:** Wait up to 30 seconds. If it still doesn't load, check `%APPDATA%\syncera\` is writable.

### QR code never appears
**Cause:** No internet, or Baileys handshake failed.
**Fix:** Check internet connection. Click **Disconnect WA** in Settings, then restart app to retry.

---

## Next Steps

Now that SYNCERA is installed, read:
- [04 · User Manual](04-USER-MANUAL.md) — feature walkthrough
- [05 · Admin Setup Guide](05-ADMIN-SETUP-GUIDE.md) — business configuration
- [08 · Troubleshooting & FAQ](08-TROUBLESHOOTING-FAQ.md) — quick solutions
