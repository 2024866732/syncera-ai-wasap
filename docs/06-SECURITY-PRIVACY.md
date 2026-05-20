# 06 · Security & Privacy

## Privacy-First Design Principle

SYNCERA was architected with a core principle: **user data never leaves the user's device** unless the user explicitly opts in to a remote feature (Google Drive backup, cloud AI fallback).

---

## Data Locations

### Local-Only Data (NEVER transmitted)
- All conversations (text content, timestamps, status)
- Contact list (names, phones, labels, tags, notes)
- Knowledge Base entries
- Templates
- Orders, Reminders, Broadcasts
- AI chat history & personas
- Business profile, settings
- Downloaded media (images, videos, documents)

### Transit-Only Data (encrypted in flight)
- WhatsApp messages (end-to-end encrypted via Signal Protocol — Baileys does NOT decrypt server-side)
- AI prompts/replies (if using cloud Pollinations.ai — see "Cloud AI Disclosure" below)
- Google Drive backup files (HTTPS to Google)

### Stored on Third Parties
- WhatsApp servers — message routing only; E2E content not readable by Meta
- Google Drive (only if user opts in) — encrypted DB backup files in user's own Drive
- Pollinations.ai (only if user selects this backend) — see disclosure below

---

## Cloud AI Disclosure

SYNCERA includes **three** AI backends. ONE of them sends data to a third-party service:

### Local Backends (no data leaves device)
- **Ollama** — runs entirely on user's PC
- **LM Studio** — runs entirely on user's PC

### Cloud Backend (data sent to third party)
- **Pollinations.ai** — free public AI API
  - Receives: KB context + recent conversation history + customer message
  - Does NOT receive: contact phone numbers, your business name (unless user explicitly puts it in the prompt)
  - Pollinations.ai privacy policy: see https://pollinations.ai

**Recommendation:** For maximum privacy, use Ollama. Pollinations is acceptable for non-sensitive small businesses (retail, F&B, services).

---

## End-to-End Encryption (E2E)

SYNCERA uses Baileys to connect to WhatsApp. Baileys implements the **Signal Protocol**, the same E2E encryption WhatsApp uses internally.

- Your WhatsApp messages are encrypted between your SYNCERA and the customer's phone.
- Meta/WhatsApp servers route encrypted blobs without ability to read content.
- Auth keys are stored in `%APPDATA%\syncera\wa-auth\` — protect this folder!

---

## Authentication Storage

### What's in `wa-auth/`?
- `creds.json` — Identity keys + registration ID
- `pre-key-*.json` — One-time prekey bundle for E2E session setup
- `sender-key-*.json` — Group message keys
- `session-*.json` — Per-contact session state

### Threat: Auth folder theft
If an attacker copies `wa-auth/` AND your DB, they can impersonate your WhatsApp session.

**Mitigations:**
- Windows user-account permissions protect this folder from other Windows users on the same PC
- Do NOT share your `%APPDATA%\syncera\` folder
- Do NOT include `wa-auth/` in any Drive backup (SYNCERA only backs up the DB by design)
- If you suspect compromise: open WhatsApp on phone → Linked Devices → Log out SYNCERA → re-scan QR

---

## Network Communication

| Destination | Protocol | Purpose | Required? |
|---|---|---|---|
| `*.whatsapp.net` | WebSocket TLS | WhatsApp messages | Yes |
| `mmg.whatsapp.net` | HTTPS | Media download | Yes |
| `media-*.cdn.whatsapp.net` | HTTPS | Media CDN | Yes |
| `localhost:11434` | HTTP | Ollama API | Optional |
| `localhost:1234` | HTTP | LM Studio API | Optional |
| `text.pollinations.ai` | HTTPS | Cloud AI | Optional |
| `accounts.google.com` | HTTPS | OAuth | Only if Drive enabled |
| `www.googleapis.com` | HTTPS | Drive API | Only if Drive enabled |
| `duckduckgo.com` | HTTPS | AI web search | Only if web access ON |

**Firewall rules:** SYNCERA does not require inbound connections. Outbound to the above is sufficient.

---

## Code Security

### Renderer Sandbox
- `contextIsolation: true` — Renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — No `require()` in renderer
- IPC bridge (`preload.js`) exposes only whitelisted main-process functions

### Input Sanitization
- All user-entered KB / templates / personas → stored as-is, escaped on render
- HTML rendering uses React's built-in XSS protection
- No `dangerouslySetInnerHTML` except in PDF report template (controlled HTML, no user injection)

### Dependency Auditing
- `npm audit` run before each release
- High-severity CVEs patched within 7 days
- All dependencies use permissive licenses (MIT/BSD/ISC) — no GPL contamination

---

## Account Security

### Setting Up
- Use a **dedicated business WhatsApp number** — never your personal one
- Enable 2FA on your business WhatsApp account
- Use a strong PIN on your phone

### Detecting Compromise
**Indicators:**
- Messages appearing in your Sent folder that you didn't send
- WhatsApp showing "Linked Devices" entries you don't recognize
- AI replies generated when you don't expect

**Response:**
1. Phone → WhatsApp → Linked Devices → Log out ALL
2. Change phone unlock PIN
3. Re-link SYNCERA via fresh QR
4. Review recent conversations for unauthorized messages

---

## Backup Security

### What's in a Drive Backup?
A `.db` file (SQLite) containing all your data EXCEPT:
- WhatsApp auth keys (intentionally excluded)
- Media files (too large; users keep these locally)

### Where Is It Stored?
- Your own Google Drive (not Darksea Network's)
- In a folder labeled "SYNCERA Backups"
- Only YOUR Google account can access

### Encryption
- Drive backups are NOT additionally encrypted by SYNCERA (Google Drive provides at-rest + in-transit encryption)
- For sensitive industries, consider encrypting the DB locally before upload (advanced — contact support)

### Restoring
- Restore overwrites your local DB
- Old DB is preserved as `wa-bizai.db.bak` before replacement
- Restore does NOT include WA auth — you must re-scan QR after restore

---

## Compliance Frameworks

### Malaysia — PDPA 2010
SYNCERA helps you comply with the Personal Data Protection Act:
- ✅ All data on user's device — "no transfer outside Malaysia" possible
- ✅ User has full control to delete data (Clear Chat / Reset)
- ✅ Notice & Choice principle: include AI disclaimer in messages

**Your obligations as data controller:**
- Notify customers their data is processed
- Honor customer requests to delete their data
- Have a Data Protection Officer if processing 100,000+ records

### EU — GDPR
For EU customers:
- ✅ Data minimization (only store what's needed)
- ✅ Right to erasure (you can delete conversations)
- ✅ Data portability (export via Drive backup)
- ⚠ Cross-border data transfer: avoid Pollinations.ai if EU customers data flows through it

### Industry-Specific
- **Healthcare:** Consider HIPAA — disable cloud AI, use Ollama only
- **Financial:** PCI DSS — never input card numbers in chats; SYNCERA does not store payment data
- **Legal:** Attorney-client privilege — use local AI only

---

## Threat Model

### In-Scope Threats
| Threat | Mitigation |
|---|---|
| Network eavesdropping | TLS + E2E |
| Compromised AI cloud provider | Use local Ollama |
| Disk theft | Windows BitLocker recommended |
| Antivirus false positives | Sign code with EV cert (roadmap) |
| Cross-Windows-user access | NTFS permissions |
| XSS / code injection in renderer | Context isolation |
| Dependency vulnerabilities | npm audit + patch cycle |

### Out-of-Scope Threats
- Physical access to unlocked PC (no app-level password — relies on Windows lock)
- Sophisticated state-level attackers
- Compromised WhatsApp account through phone-side attack
- Social engineering of business owner

---

## Data Retention & Deletion

### User-Initiated
- **Clear Chat** (per-conversation) — local messages deleted
- **Reset AI Memory** — only AI-generated messages deleted
- **Disconnect WA** — Auth wiped, conversations preserved
- **Manual delete `%APPDATA%\syncera\`** — total wipe

### Automatic
- SYNCERA does NOT auto-delete data (unlike cloud services with retention policies)
- For compliance, implement your own retention via manual cleanup

---

## Security Best Practices for Users

### Strong Foundation
1. Use Windows 11 with latest updates
2. Enable BitLocker disk encryption
3. Use a Microsoft account with 2FA
4. Install antivirus (Defender is sufficient)

### App-Level
1. Use the dedicated business WhatsApp number
2. Don't share your PC login
3. Lock PC when stepping away (`Win+L`)
4. Backup to Drive weekly

### Operational
1. Train staff on phishing recognition
2. Never paste customer credit card numbers into chat
3. Audit linked devices monthly (WhatsApp → Linked Devices)
4. Rotate Google OAuth Client ID annually

---

## Reporting Security Issues

If you discover a vulnerability in SYNCERA, please contact:

**Email:** contact@example.com
**Subject:** [SECURITY] Brief description

Please include:
- Steps to reproduce
- Impact assessment
- Your contact details

We commit to:
- Acknowledgment within 48 hours
- Initial assessment within 7 days
- Patch release within 30 days for high-severity issues
- Credit to responsible reporters (with permission) in changelog

**Please do NOT** publicly disclose vulnerabilities before a patch is released.

---

## Audit Statement

This software has not undergone third-party security audit as of v1.0.0. A formal audit by an independent firm is planned for v2.0 (Q1 2027). For high-assurance deployments, consider:
- Running SYNCERA in a Windows Sandbox or isolated VM
- Network monitoring via firewall rules
- Regular DB exports for tamper detection
