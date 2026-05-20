# 08 · Troubleshooting & FAQ

## Connection Issues

### Q: QR code won't appear
**Causes:**
- No internet connection
- Baileys handshake failure
- Corrupted auth folder

**Fix:**
1. Check internet (ping google.com)
2. Settings → **Disconnect WA** (with delete auth = true)
3. Close and restart SYNCERA
4. New QR should appear within 5 seconds

### Q: QR code expired before I scanned
QR auto-refreshes every 60 seconds. If it expires:
- Just wait — new QR generates automatically
- Or click **Cuba semula** (Try again) button

### Q: Scanned QR but stuck on "Connecting..."
**Cause:** Baileys is downloading initial encryption keys.

**Fix:** Wait 30-60 seconds. If still stuck:
1. Check phone has internet (WhatsApp Web on phone uses your phone's data)
2. Force-close app, restart
3. If persistent: delete `%APPDATA%\syncera\wa-auth\`, re-scan

### Q: Constantly disconnects
**Possible causes:**
- Phone went offline (WhatsApp Web requires phone connected)
- Multiple devices conflict (>4 linked devices)
- Network firewall blocking WebSocket

**Fix:**
- Ensure phone is always connected to internet
- WhatsApp → Linked Devices → Remove unused devices
- Whitelist `*.whatsapp.net` and `*.cdn.whatsapp.net` in firewall

---

## AI Issues

### Q: AI not replying to customers
**Diagnostic checklist:**
1. Is AI enabled on this specific conversation? (Chat header should show "AI Active")
2. Is auto-enable for new customers ON? (Settings → AI Settings)
3. Is the AI backend running? (Settings → AI → Scan → should detect Ollama/LM Studio, or Pollinations always available)
4. Is the conversation a GROUP? (Group AI is OFF by default)

**Fix:**
- Settings → AI Settings → **Show AI status banner** (will surface specific issue)
- Look at app logs in `%APPDATA%\syncera\logs\`

### Q: AI replies are slow (10+ seconds)
**Cause:** Slow CPU running large local model, or slow internet to Pollinations.

**Fix:**
- Use smaller model: `ollama pull llama3.2:1b` (only 1.3 GB, fast on CPU)
- Lower `Max Length` in Settings (300-500 tokens)
- Consider GPU upgrade (NVIDIA → CUDA acceleration)

### Q: AI gives wrong answers
**Common reasons:**
- KB entry too generic (use specific titles)
- Persona unclear (rewrite default persona)
- Customer language different from KB language (KB matcher auto-handles BM↔EN; for other languages, add translations)
- AI is hallucinating (lower model temperature in advanced settings — roadmap feature)

**Fix:**
- Review the failed conversation
- Add a specific KB entry that addresses the question
- Set `is_active = 1` and reload AI

### Q: "AI tak boleh reply — Ollama tak dikesan"
The status banner says Ollama isn't running.

**Fix:**
- Install Ollama from [ollama.com](https://ollama.com)
- Open Command Prompt, run: `ollama serve`
- In SYNCERA: Settings → AI → Scan
- If still not detected: check port 11434 isn't blocked by firewall

### Q: AI sends inappropriate / off-brand replies
**Mitigations:**
- Strengthen persona: add "DO NOT discuss politics, religion, competitors..."
- Add forbidden topics to KB as explicit "do not reply" entries
- Enable `Show AI Badge` so customers know it's AI
- Always review AI replies, disable AI for sensitive customers

---

## Performance Issues

### Q: App is slow / laggy
**Causes:**
- DB has 50k+ messages
- Running on HDD instead of SSD
- 4 GB RAM with many other apps

**Fix:**
- Upgrade RAM to 8 GB+
- Move user data to SSD (advanced — symlink `%APPDATA%\syncera`)
- Clear Chat on inactive conversations
- Close other apps

### Q: App takes 30 seconds to open
**Cause:** First-time launch initializes DB schema (~5-10 sec). Subsequent launches ~6-10 sec.

**Fix:** Normal behavior. If consistently slow on subsequent launches:
- Check DB file size (`%APPDATA%\syncera\wa-bizai.db`)
- If >500 MB, consider archiving old conversations

### Q: High RAM usage (>1 GB)
**Cause:** Electron baseline + many conversations loaded.

**Fix:**
- Normal for Electron apps
- Close conversations that aren't actively in use
- Restart app daily

---

## UI Issues

### Q: Text appears in English/Malay even after switching
Some components may not have refreshed. Settings → Language → re-select your language to force refresh.

### Q: Dark mode looks wrong
- Settings → Appearance → Theme → **Light** then back to **Dark**
- This re-applies CSS variables

### Q: Notifications not showing
**Windows side:**
- Settings → Notifications → SYNCERA → ON
- Focus Assist not in "priority only" mode
- DND (Do Not Disturb) is off

**SYNCERA side:**
- Settings → Notifications → Desktop Notifications → ON

---

## Database Issues

### Q: App says "Database locked"
**Cause:** Another SYNCERA instance is running.

**Fix:**
- Task Manager → end ALL `SYNCERA.exe` / `electron.exe` processes
- Re-open SYNCERA

### Q: My data disappeared after install
**Causes:**
- You installed under a different Windows user account
- You deleted `%APPDATA%\syncera\` manually

**Fix:**
- Check `C:\Users\<other_user>\AppData\Roaming\syncera\` for old data
- Restore from Drive Backup if you had one
- Otherwise, data is unrecoverable

### Q: How do I export all my data?
1. Settings → Drive Backup → Backup Now (uploads to your Drive)
2. Or manually copy `%APPDATA%\syncera\wa-bizai.db` to external drive
3. To export to CSV/Excel: use a SQLite browser tool to query and export

### Q: Database corruption ("Database disk image is malformed")
**Fix:**
1. Close SYNCERA
2. Find `%APPDATA%\syncera\wa-bizai.db.bak` (auto-created during restore)
3. Rename current `wa-bizai.db` → `wa-bizai.db.broken`
4. Rename `.bak` → `wa-bizai.db`
5. Restart SYNCERA
6. If no .bak: restore from Google Drive

---

## Update Issues

### Q: How do I update to a new version?
1. Download new installer from Darksea Network
2. Run it — NSIS detects existing install and offers in-place upgrade
3. Your data is preserved
4. Restart app

### Q: Update failed mid-install
**Fix:**
1. Uninstall old version via Control Panel
2. Install new version fresh
3. Data in `%APPDATA%\syncera\` is preserved across uninstall

---

## Licensing & Activation

### Q: Do I need to activate?
v1.0.0 does NOT include online activation (no DRM). One copy of installer = one license per the EULA. Activation system planned for v1.5.

### Q: Can I install on multiple PCs with one license?
EULA: one license per PC. For team use, purchase additional licenses or contact for volume pricing.

### Q: I lost my installer
Email proof of purchase to contact@example.com to receive a fresh download link.

---

## WhatsApp Compliance

### Q: Will my WhatsApp account get banned?
**Risk depends on usage:**
- Sending normal customer replies: very low risk
- Bulk sending >100 messages with <1s delay: HIGH risk
- Sending identical promotional messages to non-consented contacts: HIGH risk

**Best practices:**
- Always use delay (1.5s+ for broadcasts)
- Vary message content
- Only message consented customers
- Use a dedicated business number, not personal

### Q: Is this allowed by WhatsApp ToS?
SYNCERA uses the WhatsApp Web protocol (same as the official WhatsApp Web). This is in a gray area:
- WhatsApp's official ToS prohibits automated unsolicited messaging
- Manual replies via SYNCERA are equivalent to typing on Web
- AI replies are technically "automated" — use disclaimer to comply with implied consent

**Disclaimer:** SYNCERA is a third-party tool. Use at your own risk. Account suspension is a possibility you accept.

### Q: Can I use this for cold outreach / mass marketing?
**Strongly discouraged.** Mass cold outreach has high ban risk. Use SYNCERA for:
- Replying to existing customers
- Sending updates to opted-in customers
- Customer service automation

NOT for:
- Cold marketing to random numbers
- Spam blasts

---

## Google Drive Backup Issues

### Q: "Setup Google OAuth Client ID" — what is this?
For privacy, SYNCERA doesn't ship with hard-coded Google credentials. Each user creates their own free Google Cloud OAuth Client (5 minutes setup). Steps:
1. Open https://console.cloud.google.com
2. Create a new project (free)
3. Enable Google Drive API
4. Create OAuth 2.0 Client ID (type: Desktop app)
5. Copy Client ID into SYNCERA's Drive setup field
6. Click Connect

Full step-by-step in Settings → Drive Backup → setup helper.

### Q: Backup fails with "Quota exceeded"
**Cause:** Free Google Drive = 15 GB.

**Fix:**
- Delete old backups from Drive
- Upgrade Drive storage (Google One)
- Use a different Google account

### Q: Restore overwrote my current data!
This is expected behavior. Before restore, SYNCERA saves your current DB as `wa-bizai.db.bak`. To revert:
1. Close SYNCERA
2. Rename `.db` → `.db.failed`
3. Rename `.bak` → `.db`
4. Restart

---

## Reports Issues

### Q: PDF won't generate
**Causes:**
- Date range has zero messages
- Disk space full
- Antivirus blocking write

**Fix:**
- Try a wider date range
- Check disk space (need 50 MB free)
- Disable AV briefly, retry

### Q: Logo doesn't appear in PDF
- Ensure image is < 2 MB
- Use PNG or JPG format
- Re-upload in Reports → Company Profile

### Q: Report has wrong numbers
**Cause:** Data was modified after the report was previewed.

**Fix:** Click **Refresh** in preview, then regenerate.

---

## General

### Q: Where are my conversations stored?
`%APPDATA%\syncera\wa-bizai.db` — SQLite file on YOUR PC only.

### Q: Can I see my data without the app?
Yes — open `wa-bizai.db` with any SQLite browser (e.g. DB Browser for SQLite, free).

### Q: How do I completely uninstall?
1. Control Panel → Programs → SYNCERA → Uninstall
2. Manually delete `%APPDATA%\syncera\`

### Q: Is there a Mac / Linux version?
Not in v1.0. Roadmap consideration based on demand.

### Q: Can I get a refund?
See the EULA + Terms of Service. Standard policy: 7-day refund if installation fails or product is materially non-functional.

### Q: Contact for support?
**Email:** contact@example.com
**Response time:** 24-48 hours business days
**Premium support tier:** available — contact for pricing

---

## Submitting a Bug Report

Include:
1. SYNCERA version (Settings → About)
2. Windows version (winver)
3. Steps to reproduce
4. Expected vs actual behavior
5. Screenshots/screen recording if applicable
6. Recent log file from `%APPDATA%\syncera\logs\`

Send to: contact@example.com — Subject: `[BUG] Brief title`
