---
name: hafjet-biz-ops
description: Operasi bisnes HAFJET untuk WhatsApp, Loyverse, Gmail, repair updates, invoice dispatch, stock alerts, dan daily digest.
version: 1.1.0
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
- Cari ticket ready-pickup (Status == SIAP) dalam Google Sheet.
- **Pre-flight check (dah diimplementasi dalam script v2):**
  Script `scripts/hafjet_pickup_reminder.py` sekarang buat GET request ke
  `https://graph.facebook.com/v21.0/{PHONE_ID}` untuk validate credential SEBELUM
  batch send. Kalau dapat HTTP 400 (code 100, subcode 33), abort terus dengan exit code 1.
  Owner summary pun tak sempat dihantar — jimat API call.
  **Cara ia berfungsi:**
  1. Selepas filter pending rows, script buat GET request ke Graph API untuk Phone ID.
  2. Jika balas 200 OK → credential sah, proceed batch send.
  3. Jika balas 400 + subcode 33 → abort dengan mesej jelas + recovery steps.
  4. Jika error lain → print warning, proceed anyway (mungkin rate limit dll).
- **Semak pending count dulu** — kalau > 50, script akan ambil masa ~7 minit untuk 600+ entries.\n  Guna DRY_RUN=1 untuk lihat count tanpa send. Kalau > 100, jalankan secara berperingkat\n  atau minta Tuan cleanup data lama dulu.\n  **Jul 24 real-world timing:** 606 messages in ~7 min (background mode, exit 0).\n  **Zero 470 blocks** observed despite many old tickets — all free-form texts went through.\n- Hantar reminder lembut sekali sehari maksimum.
- Elakkan spam; jangan lebih 1 reminder/customer/day.
- **Detect credential failure pattern:** Jika cron ke-2+ berturut-turut gagal dengan
  error credential yang sama (Phone ID / Token invalid), report mesti lebih assertive —
  sertakan langkah Tuan perlu buat dengan jelas, bukan sekadar "still broken".

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

## Pitfalls (dari operasi harian)

### Stale env vars corrupt script results
Setting `COLUMN_NAME_*` or other env overrides for testing leaves them in the terminal session. Subsequent runs (including cron) pick up the stale overrides and fail silently (0 pending rows, wrong column lookups). **Always `unset` overrides after testing, or use a subshell.**

### Verify actual sheet headers, don't trust docs
Sheet column names change over time. Before running pickup reminder, probe the actual headers:
```python
from google.oauth2 import service_account
from googleapiclient.discovery import build
creds = service_account.Credentials.from_service_account_file(
    '/home/hafizi145/.hermes/secrets/gsheet_sa.json',
    scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
svc = build('sheets', 'v4', credentials=creds)
result = svc.spreadsheets().values().get(
    spreadsheetId='1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE',
    range='REPAIR BARU!A1:Z1000').execute()
print(result['values'][0])  # actual headers
```

### Check WhatsApp API credentials before batch-sending
The Phone Number ID and access token can expire or become invalid. **As of script v2,
the script now performs an automatic pre-flight check** via GET request to the Graph API
Phone ID endpoint before any batch send. If the credential is invalid (code 100, subcode 33),
it aborts immediately with exit code 1.

Manual test still useful for debugging:

```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${PHONE_ID}/messages" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"60198021500","type":"text","text":{"preview_url":false,"body":"Test"}}'
```

If you get `code:100, error_subcode:33` ("object does not exist"), the PHONE_ID or token
is invalid. **Recovery steps:**
1. Go to https://business.facebook.com → WhatsApp → API Setup
2. Check the Phone Number ID — it may have changed if the number was re-added
3. Copy the new Phone Number ID (numeric, ~15 digits)
4. If the token is expired, regenerate a new access token in Meta Business settings
5. Update `~/.hermes/.env`:
   ```bash
   # Edit WHATSAPP_PHONE_ID and WHATSAPP_ACCESS_TOKEN
   nano ~/.hermes/.env
   ```
6. Verify the WABA ID (`WHATSAPP_BUSINESS_ACCOUNT_ID` in .env) is still correct
7. Re-test with the curl command above
8. Only then re-run the pickup reminder batch

### Phone number format issues in sheet data
Some cells contain multiple numbers separated by `/` (e.g. `601111144636/0104163884`). The `norm_phone()` function passes these raw, causing HTTP 400. Same for non-Malaysian numbers. These should be logged as data quality issues.

### Status filter value must match actual sheet data
The sheet uses `SIAP` (not `SIAP DIAMBIL`). There is also a variant `SEDIA DI AMBIL` (7 rows) not caught by a single-value filter. Always check actual status VALUE distribution before running:
```python
from collections import Counter
statuses = Counter((d.get('Status') or '').strip().upper() for d in data)
print(statuses)
```

### Cron job env var gap — missing .env vars cause silent failure
Several pickup-reminder env vars (`GOOGLE_SHEET_ID`, `GOOGLE_SHEETS_CREDENTIALS`,
`PICKUP_REMINDER_TAB`, `OWNER_PHONE`, `PICKUP_REMINDER_STATUS_VALUE`) are NOT in
`~/.hermes/.env`. The cron prompt says "Load from .env" but these aren't there,
so every cron run relies on the agent supplying them from session history.
If the agent doesn't know them, the script exits with ❌ Missing env.
**Mitigation:** Always verify vars exist in .env before relying on cron for this job.
When running manually via cron prompt, supply all 7 vars inline (see "Export before
running" in Live Implementation State below).

### Main .env WhatsApp credentials go stale — use bot's .env as fallback
The Phone ID and Access Token in `~/.hermes/.env` (`WHATSAPP_PHONE_ID`,
`WHATSAPP_ACCESS_TOKEN`) can become invalid if Meta re-creates the WABA or
regenerates tokens. The working credentials live in
`~/.hermes/whatsapp-bot/.env` (the Azure bot's env file).

**Pattern:** The wrapper script `/home/hafizi145/run_pickup_reminder.py` now:
1. Reads WhatsApp credentials from `~/.hermes/whatsapp-bot/.env` FIRST
2. Falls back to `~/.hermes/.env` if bot env doesn't have them
3. Maps `WHATSAPP_PHONE_ID` → `WHATSAPP_CLOUD_PHONE_ID`
4. Maps `WHATSAPP_ACCESS_TOKEN` → `WHATSAPP_CLOUD_ACCESS_TOKEN`

**⚠️ Wrapper timeout bug (2026-07-24):** The wrapper uses `exec(open(script).read())`
which produces **no stdout** and exits with code 124 (timeout) after 120s.
Root cause TBD. **Do not rely on the wrapper for cron runs.** Use direct export
approach instead — see `references/pickup-reminder-gsheets.md` for the full
export sequence.

**How to run safely (terminal):** Prefer direct export approach over the wrapper.
The wrapper may still be useful as a convenience for interactive use.

**Diagnostic — verify which Phone ID is active:**
```bash
# Check main .env
grep WHATSAPP_PHONE_ID ~/.hermes/.env
# Check bot .env (usually the current one)
grep WHATSAPP_PHONE_ID ~/.hermes/whatsapp-bot/.env
```

**If you get "Object with ID 'XXX' does not exist" (HTTP 400 / code 100 subcode 33):**
1. The Phone ID in main `.env` is stale → wrapper should auto-fix from bot `.env`
2. If even the bot `.env` Phone ID fails → the token itself is expired
3. Check both Phone IDs and both tokens — they must match the same WABA

**Current valid credentials (verified 2026-07-24):**
- Phone ID: `1089032617637482` (from bot `.env`, belongs to +60 11-4956 1698)
- WABA ID: `1558497515847375`
- Bot phone: +60 16-980 8736

**Batch timing (verified 2026-07-24 — first successful full run):**
- 606 messages delivered in ~7 minutes (exit code 0, no 470 blocks)
- Rate: ~1.5 messages/second per sequential HTTP call
- Previous estimate (~230 entries in 120s) confirmed accurate
- The script processes front-to-back — no chunking, no parallel sends
- To avoid cron timeouts (default 180s), run in background or add `MAX_PER_RUN=50` env var

**Mitigations for large batches:**
1. Run `DRY_RUN=1` first to check pending count.
2. If > 100 pending, ask Tuan to clean up old SIAP data (many are from 2022).
3. For background runs, increase terminal timeout (e.g. `timeout=300`) or run in background mode.
4. Long-term: add `MAX_PER_RUN=50` env var so cron auto-chunks.

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
- `references/pickup-reminder-gsheets.md` — Detail pickup reminder GSheet+WA

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
   import os, json, urllib.request
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

## Security SOP (pointer)
Banned patterns + safe alternatives are enforced in the **`hafjet-command-safety`** skill
(software-development). Summary confirmed by Tuan Hafizi this session (denied 3x):
never `curl | python3 -c`, never `python3 << 'EOF'` heredoc, never redirect into dotfiles
(`cat >> ~/.hermes/.env`). Agent SUGGESTS; Tuan edits `.env` manually via `nano`. Schedule
jobs with the `hermes cron` TOOL, not `crontab -e`.

## Live Implementation State (2026-07-18)

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
- **Actual sheet headers (verified 2026-07-14):** `NAMA CUSTOMER`, `NO TELEFON`, `Status`,
  `Repair ID`, `TARIKH AMBIL`, ... Script defaults match these. Only set `COLUMN_NAME_*`
  overrides if headers change.
- **Filter:** `Status == SIAP` (NOT `SIAP DIAMBIL` as previously documented). Set
  `PICKUP_REMINDER_STATUS_VALUE=SIAP`. Variant `SEDIA DI AMBIL` (7 rows) exists but
  single-value filter won't catch it — data cleanup or script enhancement needed.
- **Phone format issues found:** some `NO TELEFON` cells contain two numbers separated
  by `/` (e.g. `601111144636/0104163884`) — `norm_phone()` passes them raw causing send
  failures. Non-MY numbers also present (`917639075994`, `189017751`).
- Route to CUSTOMER `NO TELEFON` (NOT owner). `OWNER_PHONE=60198021500` → summary only.
- **⚠️ Env var gap — KEY VARS NOT IN `.env` (observed Jul 22):** Despite being documented
  here since initial setup (Jul 10), the following env vars are **absent** from
  `~/.hermes/.env`:
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SHEETS_CREDENTIALS`
  - `PICKUP_REMINDER_TAB`
  - `OWNER_PHONE`
  - `PICKUP_REMINDER_STATUS_VALUE`
  Meanwhile, the script reads `WHATSAPP_CLOUD_PHONE_ID` / `WHATSAPP_CLOUD_ACCESS_TOKEN`,
  but `.env` stores `WHATSAPP_PHONE_ID` / `WHATSAPP_ACCESS_TOKEN` (different names).
  **Consequence:** Every cron run of `hafjet-pickup-reminder` (`ebdae9cc10ab`) requires the
  agent to supply these values from session history or fail. The cron prompt says
  "Load from .env" but the vars aren't there. The script exits with
  `❌ Missing env: GOOGLE_SHEET_ID` if not supplied inline.
- **Export before running (terminal or test):**
  ```bash
  export WHATSAPP_CLOUD_PHONE_ID=\\\"$WHATSAPP_PHONE_ID\\\"  # guna $WHATSAPP_CLOUD_PHONE_ID untuk override
  export WHATSAPP_CLOUD_ACCESS_TOKEN=\\\"$WHATSAPP_ACCESS_TOKEN\\\"
  export GOOGLE_SHEET_ID=\\\"1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE\\\"
  export GOOGLE_SHEETS_CREDENTIALS=\\\"/home/hafizi145/.hermes/secrets/gsheet_sa.json\\\"
  export PICKUP_REMINDER_TAB=\\\"REPAIR BARU\\\"
  export OWNER_PHONE=\\\"60198021500\\\"
  export PICKUP_REMINDER_STATUS_VALUE=\\\"SIAP\\\"
  export DRY_RUN=0
  python3 /home/hafizi145/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py
  ```
  **Wrapper script approach:** For terminal runs (not cron), use
  `/home/hafizi145/run_pickup_reminder.py` which reads `.env`, maps the var names, and
  sets hardcoded values. This avoids having to manually export each time. Run with:
  ```bash
  python3 /home/hafizi145/run_pickup_reminder.py
  ```
  **Long-term fix:** Add all vars to `~/.hermes/.env` (Tuan edits via `nano`):
  ```
  GOOGLE_SHEET_ID=1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE
  GOOGLE_SHEETS_CREDENTIALS=/home/hafizi145/.hermes/secrets/gsheet_sa.json
  PICKUP_REMINDER_TAB=REPAIR BARU
  OWNER_PHONE=60198021500
  PICKUP_REMINDER_STATUS_VALUE=SIAP DIAMBIL
  WHATSAPP_CLOUD_PHONE_ID=1089032617637482
  WHATSAPP_CLOUD_ACCESS_TOKEN=EAAdm...  (copy dari WHATSAPP_ACCESS_TOKEN di bot .env)
  ```
  **⚠️ Note:** The Phone ID `107158292462704` previously in `.env` is STALE since ~Jul 2026.
  The current valid ID is `1089032617637482` (from `~/.hermes/whatsapp-bot/.env`).
  The wrapper script now auto-falls-back to the bot's `.env`, but for direct script runs
  the `.env` Phone ID should be updated.
- **Pre-flight check (implemented in script v2):** Script now runs GET `/v21.0/{PHONE_ID}` to
  validate credential before any batch send. Aborts with exit code 1 on code 100/subcode 33.
  No more wasted 621 API calls on dead credentials.
- 24h window: Meta error 470 → log + skip (template message needed later).
  **Real-world finding (Jul 24):** Despite 606 messages sent to customers with old SIAP
  tickets (many from 2022), **zero** 470 blocks occurred. All free-form texts went through.
  Possible reasons: customers may have recently messaged the bot (keeping 24h window open),
  or Meta's enforcement is inconsistent for Malaysian accounts. Long-term still target
  pre-approved templates for reliability.
- `DRY_RUN=1` = read + print, send nothing. Script: `scripts/hafjet_pickup_reminder.py`.

## Files

### Scripts
- `scripts/hafjet_pickup_reminder.py` — Main pickup reminder script. Reads GSheet, filters SIAP, sends WhatsApp.
- External: `~/run_pickup_reminder.py` — Wrapper that bridges env var names and sets hardcoded config for terminal runs (not part of skill directory).

### References
- `references/message-templates.md` — Templates
- `references/status-mapping.md` — Status translations
- `references/cron-jobs.md` — Cron schedules
- `references/pickup-reminder-gsheets.md` — Detailed pickup reminder setup