# Pickup Reminder — Google Sheets (AppSheet) → WhatsApp Cloud API

## Source of truth
Repair tickets are tracked in a Google Sheet (AppSheet backend), NOT the Azure bot DB.
- Sheet ID: `1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE`
- Tab: `REPAIR BARU`  (range `REPAIR BARU!A1:Z1000`)
- Shared with SA as **Viewer**.

## Service account (already created)
- Project: `neat-ring-502113-c0` (same GCP project as Google Workspace)
- JSON relocated to `/home/hafizi145/.hermes/secrets/gsheet_sa.json` (chmod 600)
- SA email: `hafjet-sheets-sa@neat-ring-502113-c0.iam.gserviceaccount.com`
- Scopes used: `https://www.googleapis.com/auth/spreadsheets.readonly`

## Actual sheet headers (verified 2026-07-14)
```
['Repair ID', 'NO BILL', 'NAMA CUSTOMER', 'NO TELEFON', 'TARIKH HANTAR',
 'TARIKH AMBIL', 'MODEL PHONE', 'WARNA PHONE', 'PASSWORD / PATTERN',
 'CUSTOMER PHONE PROBLEM', 'TOTAL HARGA', 'DEPOSIT', 'BALANCE', 'TECHNICIAN',
 'Status', 'LOKASI PHONE SEKARANG', 'HARGA KOS TECNICIAN', 'GAMBAR PHONE',
 'Catatan Tecnician', 'No Tracking', 'Barcode Pembayaran']
```

**Script defaults match these headers exactly.** No COLUMN_NAME_* overrides needed:
| Env var | Default value | Matches sheet? |
|---------|--------------|----------------|
| COLUMN_NAME_CUSTOMER | `NAMA CUSTOMER` | ✅ |
| COLUMN_NAME_PHONE | `NO TELEFON` | ✅ |
| COLUMN_NAME_STATUS | `Status` | ✅ |
| COLUMN_NAME_TICKET | `Repair ID` | ✅ |
| COLUMN_NAME_READY | `TARIKH AMBIL` | ✅ |

## Status values (actual distribution, 995 rows)
```
SIAP: 621 (ready for pickup)
CANCEL: 71
REJECT: 46
SELESAI & TELAH DIAMBIL: 42
SEDIA DI AMBIL: 7 (typo variant — not caught by single-value filter)
BELUM SIAP: 6
BELUM SIAP / DALAM PROCESS REPAIR: 3
WARRANTY: 2
SUDAH ORDER SPARE PART: 1
(empty): 2
```

## Filter setting
```
PICKUP_REMINDER_STATUS_VALUE=SIAP
```
NOT `SIAP DIAMBIL` — the sheet uses just `SIAP`.
The variant `SEDIA DI AMBIL` (7 rows) is NOT caught — enhance script if needed.

## Env vars needed (not all present in .env — Tuan sets manually)
These are NOT in `~/.hermes/.env` and must be exported manually:
```
GOOGLE_SHEET_ID=1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE
GOOGLE_SHEETS_CREDENTIALS=/home/hafizi145/.hermes/secrets/gsheet_sa.json
PICKUP_REMINDER_TAB=REPAIR BARU
PICKUP_REMINDER_STATUS_VALUE=SIAP
OWNER_PHONE=60198021500
```

## Env var mapping (WhatsApp)
Script reads `WHATSAPP_CLOUD_PHONE_ID` / `WHATSAPP_CLOUD_ACCESS_TOKEN`.
`.env` stores them as `WHATSAPP_PHONE_ID` / `WHATSAPP_ACCESS_TOKEN`.
Export before running:
```bash
export WHATSAPP_CLOUD_PHONE_ID="$WHATSAPP_PHONE_ID"
export WHATSAPP_CLOUD_ACCESS_TOKEN="$WHATSAPP_ACCESS_TOKEN"
```

## Script behavior
1. Auth via service account, read tab.
2. Filter rows where `Status == SIAP` (case-insensitive, configurable).
3. For each: normalize phone, compose reminder, send free-form WhatsApp to customer.
4. On HTTP 400 with error_subcode 33 → phone ID invalid (credential issue).
5. On HTTP 470 → 24h window exceeded, log + skip.
6. If `OWNER_PHONE` set → summary after loop.
7. `DRY_RUN=1` → read + print only, NO send.

## Pre-flight check
Always test WhatsApp API credentials before batch run:
```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_CLOUD_PHONE_ID}/messages" \
  -H "Authorization: Bearer ${WHATSAPP_CLOUD_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"60198021500","type":"text","text":{"preview_url":false,"body":"Test"}}'
```

## Pitfalls
- **Stale env vars:** Setting COLUMN_NAME_* overrides leaves them in terminal session. Always `unset` before real runs.
- **Status value mismatch:** Sheet uses `SIAP`, not `SIAP DIAMBIL`. If 0 pending but rows exist, check actual status values with a probe script.
- **Phone number ID invalid (still stale as of 2026-07-17):** `.env` value `107158292462704` returned "object does not exist" (code 100, subcode 33) on 2026-07-14, 2026-07-15, and 2026-07-17. **This has failed 3 consecutive cron runs.** Tuan must get the correct Phone Number ID from Meta Business (Facebook Business → WhatsApp → API Setup). Until fixed, all batch sends are wasted.
- **Repeated credential failure escalation:** If the SAME credential error fires across ≥2 consecutive cron runs, the cron report should abort early (no batch attempt), flag the credentials as the sole blocker, and give precise recovery steps — not just "still broken".
- **Script timeout with 621 pending:** 621 SIAP tickets cause the script to timeout at ~120s after processing ~230 entries (≈3.5s per message). Full batch would take ~5 min. Mitigation: run `DRY_RUN=1` first, or add `MAX_PER_RUN=50` chunking.
- **Dual phone numbers:** Some cells have two numbers (e.g. `601111144636/0104163884`). These fail send.
- **Very old data:** Most SIAP tickets date from Sept–Nov 2022. May need status cleanup.
- **Share permission:** 403 → sheet not shared with SA email.
- **470 errors are expected** for customers who haven't messaged in 24h — not a bug. Long-term fix = pre-approved WhatsApp template.

## Test sequence (Tuan runs)
```bash
# 1) Load env + map WhatsApp vars
export WHATSAPP_CLOUD_PHONE_ID="$WHATSAPP_PHONE_ID"
export WHATSAPP_CLOUD_ACCESS_TOKEN="$WHATSAPP_ACCESS_TOKEN"
export GOOGLE_SHEET_ID="1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE"
export GOOGLE_SHEETS_CREDENTIALS="/home/hafizi145/.hermes/secrets/gsheet_sa.json"
export PICKUP_REMINDER_TAB="REPAIR BARU"
export PICKUP_REMINDER_STATUS_VALUE="SIAP"
export OWNER_PHONE="60198021500"
# 2) Safe dry run
export DRY_RUN=1
python3 ~/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py
# 3) If output looks right, remove DRY_RUN and rerun (or let cron do it)
```

## Cron
- Job `ebdae9cc10ab`, schedule `0 3 * * *` (11:00 AM MYT).
- Prompt runs the script; reports sent/failed/470/400 blocks concisely.
