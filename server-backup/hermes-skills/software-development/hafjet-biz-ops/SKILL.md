---
name: hafjet-biz-ops
description: Operasi bisnes HAFJET untuk WhatsApp, Loyverse, Gmail, repair updates, invoice dispatch, stock alerts, dan daily digest.
version: 1.0.0
author: HAFJET (M) SDN BHD
license: Proprietary
platforms: [linux]
metadata:
  hermes:
    tags: [hafjet, business-ops, whatsapp, loyalty, gmail, repair, invoice]
    homepage: https://github.com/2024866732/hafjet-whatsapp-bot
---

# HAFJET Biz Ops

Gunakan skill ini bila tugasan melibatkan operasi kedai HAFJET, termasuk jualan POS, status repair, reminder pickup, invoice customer, low-stock alert, dan laporan harian owner.

## Tujuan
- Kurangkan chat manual dengan pelanggan.
- Pastikan notifikasi konsisten dan mesra pelanggan.
- Bezakan mesej customer-facing dan internal-owner report.
- Elakkan hantar mesej jika data kritikal tiada atau tidak sah.

## Input yang dijangka
- event_type
- source_system
- order_id atau ticket_id
- customer.name
- customer.phone
- customer.email
- items[]
- amount_total
- payment_status
- repair_status
- pickup_due_date
- invoice_url
- created_at

## Peraturan utama
1. Jangan hantar mesej customer jika nombor telefon tiada atau tidak sah.
2. Jangan hantar invoice email jika email customer kosong.
3. Untuk mesej customer, guna bahasa ringkas, sopan, dan jelas.
4. Untuk owner report, utamakan exception, nilai jualan, item kritikal, dan tindakan susulan.
5. Jika data bercanggah, hasilkan exception report dahulu, bukan mesej customer.

## Workflow mengikut event

### sale.completed
- Semak payment_status.
- Jika paid, sediakan ringkasan jualan.
- Jika ada customer.phone, sediakan mesej WhatsApp terima kasih + ringkasan.
- Jika ada customer.email dan invoice_url, sediakan Gmail invoice dispatch.
- Jika tiada phone/email, log ke exception report.

### repair.status_changed
- Tukar status teknikal kepada ayat mudah difahami pelanggan.
- Status disaran: received, diagnosing, waiting-part, in-progress, ready-pickup, completed.
- Jika status ready-pickup, cadangkan reminder selepas 3 hari jika belum diambil.

### cron.daily-sales-digest
- Ringkaskan jumlah jualan harian.
- Nyatakan top items dan isu penting.
- Sertakan pending repair dan low stock jika tersedia.
- Format untuk owner, bukan customer.

### cron.pickup-reminder
- Cari ticket ready-pickup lebih 3 hari.
- Hantar reminder lembut sekali sehari maksimum.
- Elakkan spam; jangan lebih 1 reminder/customer/day.

### cron.low-stock
- Senaraikan item di bawah threshold.
- Susun ikut kategori dan tahap kritikal.
- Cadangkan reorder shortlist.

## Format mesej

### WhatsApp customer
- Pendek.
- Nada mesra.
- Nyatakan tindakan seterusnya.
- Elakkan jargon teknikal.

### Gmail invoice
- Subject jelas: Invoice / Resit HAFJET.
- Nyatakan order_id, amount_total, dan link/attachment invoice.
- Simpan gaya profesional ringkas.

### Owner digest
- Guna bullet point.
- Utamakan nombor penting, exception, dan tindakan.

## Edge cases
- Phone ada, email tiada: hantar WhatsApp sahaja.
- Email ada, phone tiada: hantar Gmail sahaja.
- Dua-dua tiada: masukkan ke exception report.
- payment_status bukan paid: jangan dispatch invoice customer kecuali diminta sistem.
- repair_status tidak dikenali: tandakan untuk semakan manual.

## Output yang dijangka
- whatsapp_message
- gmail_subject
- gmail_body
- owner_summary
- exception_notes

## References
- `references/message-templates.md` — Template mesej WhatsApp & Gmail
- `references/status-mapping.md` — Pemetaan status backend ke customer-facing
- `references/cron-jobs.md` — Jadual cron jobs operasi

## Architecture

```
Meta Cloud API
     ↓
HAFJET Bot (Azure: hafjet-whatsapp-bot.azurewebsites.net)
     ↓ VERIFY_TOKEN = HAFJET_RAUB_RAK
Process message → Static menu / AI query
     ↓
Hermes (HAFJET-Hermes-Server) — AI backend via CLI/SSH
     ↓
Response back to Bot → Customer WhatsApp
```

**CRITICAL:** Hermes is an AI backend TOOL, NOT a webhook replacement.
- Do NOT change VERIFY_TOKEN at Meta or Azure — existing bot already working.
- Do NOT change webhook URL — keep https://hafjet-whatsapp-bot.azurewebsites.net/webhook
- Hermes provides: AI responses, daily digest, cron jobs, automation

## Credentials
| Sistem | Keperluan |
|--------|-----------|
| Loyverse | OAuth credentials, access/refresh token |
| Gmail | OAuth client, refresh token (dah siap) |
| WhatsApp | Existing HAFJET Bot on Azure (do not modify) |
| Hermes | CLI access via SSH for AI queries |

## Security Notes (CRITICAL)

When implementing workflows for HAFJET:

1. **Never use `curl | python3 -c`** — This pattern is HIGH risk and will be BLOCKED by Hermes security scanner. Write scripts to files first, then execute.

2. **Token handling** — Always read tokens from `~/.hermes/.env` via Python subprocess, not shell `$(...)` which gets censored by Hermes terminal.

3. **Safe script pattern:**
   ```python
   # Write to /tmp/script.py first, then run with python3 /tmp/script.py
   import os
   import json
   import urllib.request
   
   token = os.environ.get("LOYVERSE_ACCESS_TOKEN")
   url = "https://api.loyverse.com/v1.0/receipts?limit=5"
   req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
   
   with urllib.request.urlopen(req, timeout=10) as resp:
       data = json.loads(resp.read().decode())
   
   print(f"Found {len(data.get('receipts', []))} receipts")
   ```

4. **For cron jobs** — Use Hermes venv Python path:
   ```bash
   0 21 * * * /home/hafizi145/hermes-agent/venv/bin/python3 /path/to/script.py >> /home/hafizi145/.hermes/logs/output.log 2>&1
   ```

See `references/security-patterns.md` in `loyverse-sales` skill for full details.

## Security SOP (pointer)
Banned patterns + safe alternatives are enforced in the **`hafjet-command-safety`** skill
(software-development). Summary confirmed by Tuan Hafizi this session (denied 3x):
never `curl | python3 -c`, never `python3 << 'EOF'` heredoc, never redirect into dotfiles
(`cat >> ~/.hermes/.env`). Agent SUGGESTS; Tuan edits `.env` manually via `nano`. Schedule
jobs with the `hermes cron` TOOL, not `crontab -e`.

## Live Implementation State (2026-07-12)

**Integration = Option A:** Hermes is the AI BACKEND behind the EXISTING HAFJET Bot (Azure).
KEEP webhook `https://hafjet-whatsapp-bot.azurewebsites.net/webhook` and
`VERIFY_TOKEN=HAFJET_RAUB_RAK` (Azure env `VERIFY_TOKEN`) — do NOT rename/change.
Bot OpenAPI exposes ONLY `/webhook`, `/api/stats`, `/api/customers`, `/api/spx/*`,
`/api/analytics/*`, `/api/blast`. There is NO `/api/repairs` — repair tickets live in the
Google Sheet below, NOT the bot DB.

**Active Hermes cron jobs:**
| Job | UTC | MYT | Purpose | Job ID |
|-----|-----|-----|---------|--------|
| Daily Sales Report | `0 13 * * *` | 9:00 PM | Loyverse digest → Telegram | `9408be4cd593` |
| Pickup Reminder | `0 3 * * *` | 11:00 AM | GSheet → WhatsApp customer | `ebdae9cc10ab` |
| Low Stock Alert | `0 0 * * *` | 8:00 AM | Loyverse inventory → owner | pending |
| Exception Report | `0 */2 * * *` | every 2h | ops exceptions → owner | pending |

**Pickup Reminder (Google Sheets → WhatsApp Cloud API):** see `references/pickup-reminder-gsheets.md`.
- Sheet `1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE`, tab **`REPAIR BARU`**, range `REPAIR BARU!A1:Z1000`.
- SA JSON `/home/hafizi145/.hermes/secrets/gsheet_sa.json` (chmod 600); SA email
  `hafjet-sheets-sa@neat-ring-502113-c0.iam.gserviceaccount.com` (share sheet as Viewer).
- Cols (env-overridable): `NAMA CUSTOMER`, `NO_PHONE`, `STATUS_REPAIR`, `NO_REPAIR`, `TARIKH_SIAP`.
  Filter `STATUS_REPAIR == SIAP DIAMBIL` (override via `PICKUP_REMINDER_STATUS_VALUE`).
- Route to CUSTOMER `NO_PHONE` (NOT owner). `OWNER_PHONE=60198021500` → summary only.
- 24h window: Meta error 470 → log + skip (template message needed later).
- `DRY_RUN=1` = read + print, send nothing. Script: `scripts/hafjet_pickup_reminder.py`.

**Duplicate note:** a stale copy of this skill existed under `devops/hafjet-biz-ops/` (v1.0.0,
no scripts). This `software-development/` copy is canonical — delete the `devops/` one to
remove registry ambiguity.
