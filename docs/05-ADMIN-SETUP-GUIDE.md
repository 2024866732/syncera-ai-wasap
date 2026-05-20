# 05 · Admin Setup Guide

> Audience: Business owner / operator who configures SYNCERA for their team or sole operation.

## Onboarding Roadmap (Day 1 → Week 1)

### Day 1 (30 minutes)
- [ ] Install SYNCERA
- [ ] Link WhatsApp number via QR
- [ ] Wait for history sync to complete
- [ ] Fill Business Profile in Settings
- [ ] Test sending one message

### Day 2 (1 hour)
- [ ] Add first 20 KB entries
- [ ] Configure AI backend (Ollama or Pollinations)
- [ ] Enable AI on 1-2 test customer conversations
- [ ] Monitor first AI replies, refine KB

### Day 3-7 (gradual rollout)
- [ ] Add 30+ more KB entries based on real customer questions
- [ ] Set up templates for common scenarios
- [ ] Enable global "Auto-Enable AI for New Customers"
- [ ] Configure Drive Backup
- [ ] Review Analytics daily

### Week 2 onwards
- [ ] Generate first weekly PDF report
- [ ] Set up daily reminders for follow-ups
- [ ] Run first broadcast to existing customers
- [ ] Move customers across Pipeline stages

---

## Business Profile — The AI's Brain

This is the most important setup step. The AI reads this for EVERY customer message.

### Template
```
NAMA BISNES: <Your business name>
JENIS: <Industry — e.g. Online retail, Service trade, F&B>
LOKASI: <City / area>
WAKTU OPERASI: <Days + hours>

PRODUK / SERVIS UTAMA:
- <Item 1>: <Price + brief description>
- <Item 2>: <Price + brief description>
- ...

POLISI:
- <Shipping / delivery policy>
- <Return / refund policy>
- <Payment methods accepted>
- <Warranty terms>

PERSONALITY SALES:
- <Tone: friendly / professional / casual>
- <Greeting style>
- <How to handle complaints>
- <Upsell approach>

INFO TAMBAHAN:
- <Anything else AI should know>
```

### Real Example — Electrical Contractor
```
NAMA BISNES: Maju Elektrik Sdn Bhd
JENIS: Electrical contractor & retail
LOKASI: Shah Alam, Selangor
WAKTU OPERASI: Isnin-Sabtu 9am-6pm, Ahad tutup

PRODUK / SERVIS UTAMA:
- Pasang point 13A: RM45 supply + install, termasuk wayar 12ft
- Pasang point aircond: RM150-RM250 ikut tonage
- Pasang point oven: RM180 (32A breaker)
- Service kerosakan elektrik: RM80 minimum + parts
- Install lampu LED: RM35/point (lampu basic), RM55/point (downlight)

POLISI:
- Warranty 1 tahun untuk semua kerja pemasangan
- Free site survey area Selangor/KL
- Payment: cash, transfer, atau split 50/50 (booking + completion)
- Tidak menerima kerja luar Klang Valley

PERSONALITY SALES:
- Sopan, professional, guna "Encik/Cik"
- Jangan pushy — biar customer fikir
- Kalau customer tanya harga tanpa detail, minta info: berapa point, jenis property, alamat
- Confirmation kerja kena ada visit dulu untuk quote tepat

INFO TAMBAHAN:
- Wireman certified by Suruhanjaya Tenaga
- Boleh terbit invoice rasmi syarikat
- Mengikut standard MS IEC 60364
```

---

## Knowledge Base Strategy

### Structure
Aim for 50-150 entries spread across these categories:

| Category | Count | Examples |
|---|---|---|
| Pricing | 15-30 | "13A socket price", "LED downlight price", "Service call fee" |
| Products | 10-20 | "Available casing models", "Wireless charger specs" |
| Services | 10-20 | "Installation process", "Site survey procedure" |
| Policies | 5-10 | "Refund policy", "Warranty terms", "Cancellation" |
| FAQ | 10-20 | "How long does installation take?", "Do you provide invoice?" |
| Contact | 3-5 | "Office address", "Operating hours", "Emergency contact" |

### Writing Good KB Entries

**Bad** ❌:
- Title: "price"
- Content: "rm45"

**Good** ✅:
- Title: "Harga Pemasangan Point 13A (Standard)"
- Content: "RM45 per point untuk pemasangan socket outlet 13A standard. Termasuk: wayar PVC 2.5mm² panjang 12 kaki, soket plate, conduit (jika perlu), labor. Tidak termasuk: kerja chasing dinding (extra RM20/point). Warranty 1 tahun."

**Why:** AI's KB matcher scores TITLE matches 3× content matches. Long descriptive titles help retrieval.

### Synonym Strategy
The matcher auto-expands BM↔EN synonyms:
- point ↔ soket ↔ socket
- harga ↔ price ↔ kos
- pasang ↔ install ↔ setup

So you don't need to duplicate entries — write in one language, AI handles both.

---

## AI Backend Selection

### Comparison

| Backend | Cost | Privacy | Speed | Quality | Setup |
|---|---|---|---|---|---|
| **Ollama (local)** | Free | 100% local | Fast (GPU) / Medium (CPU) | High (good models) | Install + pull model |
| **LM Studio** | Free | 100% local | Same as Ollama | Same | Install + load model |
| **Pollinations.ai** | Free | Cloud | Fast | Medium | None — works instantly |

### Recommended Setup by Business Size

**Solo / micro-business (< 100 msgs/day):**
- Use Pollinations.ai (no install, free, sufficient)

**Small business (100-500 msgs/day):**
- Install Ollama with `llama3.2:3b` (4 GB model, fast on most PCs)
- Fallback to Pollinations

**Medium business (500+ msgs/day, sensitive data):**
- Install Ollama with `qwen2.5:7b` or `llama3.1:8b`
- Disable cloud fallback for maximum privacy

### Installing Ollama
1. Download from [ollama.com](https://ollama.com).
2. Run installer (~150 MB).
3. Open Command Prompt:
   ```bash
   ollama pull llama3.2:3b
   ollama serve
   ```
4. In SYNCERA Settings → AI → click **Scan** — Ollama auto-detected.

### Installing LM Studio
1. Download from [lmstudio.ai](https://lmstudio.ai).
2. Inside LM Studio, search & download a model (e.g. "qwen2.5-7b-instruct").
3. Click the **Local Server** tab, start the server (default port 1234).
4. SYNCERA auto-detects on next Scan.

---

## Anti-Ban Configuration

### Send Delay Settings
**Settings → AI Settings → WA Send Delay (Anti-ban)**

| Risk Level | Delay | Use Case |
|---|---|---|
| HIGH risk | 0-300ms | NOT recommended |
| Medium | 800-1200ms | Daily replies to <50 customers |
| Low | 1500-2500ms | Daily replies + occasional broadcasts |
| Safe | 3000ms+ | Heavy broadcasting (>200 contacts) |

### Reply Delay Settings
**Settings → AI Settings → Reply Delay**
- 0.5-1s: Looks robotic
- 2-4s: Natural (recommended)
- 5-8s: Casual human typing

### Group Chat Policy
Default: **OFF**. Only enable for specific customer service groups (e.g. "Maju Customers - Selangor"). AI replying to random group messages = spam = ban.

### Disclaimer
**ON (recommended)** — attaches a one-time notice on the FIRST AI reply per conversation, complying with implied consent expectations.

---

## Backup Strategy

### Local Backup
SYNCERA auto-flushes DB every 2 seconds. Crash-safe.

### Drive Backup
1. **Connect** Google Drive in Settings.
2. Enable **Daily auto-backup**.
3. Manually backup before major changes (new staff, system migration).

### Best Practices
- Keep at least 7 days of Drive backups (rolling)
- Once a month, download a Drive backup manually as offline archive
- Before uninstalling, ALWAYS backup
- Test restore on a secondary PC quarterly

---

## Multi-User Considerations

SYNCERA v1.0 is **single-user-per-install**. For team scenarios:

### Single device, multiple staff
- Use Windows user accounts — each gets own `%APPDATA%\syncera\`
- Each installs SYNCERA once per Windows account
- Note: WhatsApp linked devices max = 4 per number

### Multiple devices, same WhatsApp number
- Up to 4 linked devices supported by WhatsApp
- Each SYNCERA has independent local DB
- Cross-device data sharing via Drive Backup → Restore

### True multi-seat (Roadmap v2.0)
Q1 2027 release will add shared inbox + team mode.

---

## Performance Tuning

### For 10,000+ messages
- Use SSD (HDD shows lag at this scale)
- 16 GB RAM recommended
- Run "Clear Chat" on inactive conversations quarterly

### For large KB (200+ entries)
- Keep entry content under 500 characters
- Use clear category labels for filtering
- Disable inactive entries instead of deleting (toggling is free)

### For slow AI
- Use smaller models (3B parameters) for faster CPU-only inference
- Lower `Max Length` to 400-600 tokens
- Enable GPU acceleration in Ollama (CUDA / Metal)

---

## Compliance Checklist

Before going live:
- [ ] Read WhatsApp Business Terms of Service
- [ ] Verify EULA compliance with your business model
- [ ] Add disclaimer to your customer-facing messages
- [ ] Brief staff on no-spam, no-harassment policies
- [ ] Set up data retention policy (delete inactive conversations after X months)
- [ ] If handling EU customers, comply with GDPR (customer consent for data processing)
- [ ] If handling Malaysian customers, comply with PDPA 2010 (notice + choice)
- [ ] Test refund/cancellation flow

---

## Audit Trail

For business records, regularly:
- Export weekly Reports (PDF)
- Save Drive backups monthly
- Document KB versions (export DB before major KB rewrites)
- Keep template change logs

---

## Common Admin Tasks

### Reassigning a conversation to AI
1. Open conversation
2. Click **Enable AI** in chat header
3. Optionally add custom persona in Right Panel → AI tab

### Bulk-disabling AI for all conversations
1. Settings → AI → Auto-Enable AI for New Customers → OFF
2. For existing AI-active chats: manually toggle off in each chat, OR
3. Use Inbox filter "AI" → click each → disable

### Cleaning up test conversations
1. Right-click conversation → **Clear Chat** (removes messages locally only)
2. To delete entire conversation including from list: requires manual DB edit (advanced)

### Switching to a different WhatsApp number
1. Settings → **Disconnect WA**
2. App returns to QR screen
3. Scan with new phone number
4. **WARNING:** Previous history will be archived under old contact JIDs but new contacts treated as separate

### Migrating to a new PC
1. On OLD PC: Drive Backup → Backup Now
2. Install SYNCERA on NEW PC
3. Settings → Drive Backup → Connect (same Google account)
4. Click Restore on most recent backup
5. Restart app
6. Re-scan QR (auth is not in DB — security)
