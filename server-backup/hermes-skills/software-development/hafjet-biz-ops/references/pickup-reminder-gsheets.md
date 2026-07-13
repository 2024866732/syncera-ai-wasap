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

## Env vars (Tuan sets MANUALLY in ~/.hermes/.env — never via redirection)
```
GOOGLE_SHEET_ID=1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE
GOOGLE_SHEETS_CREDENTIALS=/home/hafizi145/.hermes/secrets/gsheet_sa.json
PICKUP_REMINDER_TAB=REPAIR BARU
OWNER_PHONE=60198021500
# WHATSAPP_CLOUD_PHONE_ID + WHATSAPP_CLOUD_ACCESS_TOKEN already present
# optional override: PICKUP_REMINDER_STATUS_VALUE=SIAP DIAMBIL
```
Column names are env-overridable (`COLUMN_NAME_CUSTOMER` etc.) — defaults match sheet:
`NAMA CUSTOMER`, `NO_PHONE`, `STATUS_REPAIR`, `NO_REPAIR`, `TARIKH_SIAP`.

## Script behavior (`scripts/hafjet_pickup_reminder.py`)
1. Auth via service account, read tab.
2. Filter rows where `STATUS_REPAIR == SIAP DIAMBIL` (case-insensitive).
3. For each: normalize phone (`0xxxx` → `6xxxx`, strip `+`/spaces), compose reminder,
   send free-form WhatsApp text to **customer** phone.
4. On HTTPError 470 → log + skip (24h customer-service window exceeded).
5. If `OWNER_PHONE` set → send a summary (count sent / failed) after the loop.
6. `DRY_RUN=1` → read + print only, NO send (safe first test).

## Test sequence (Tuan runs)
```bash
# 1) reload env (terminal censors, so export explicitly)
export $(grep -E "GOOGLE_SHEET_ID|GOOGLE_SHEETS_CREDENTIALS|PICKUP_REMINDER_TAB|WHATSAPP_CLOUD_PHONE_ID|WHATSAPP_CLOUD_ACCESS_TOKEN|OWNER_PHONE" ~/.hermes/.env | xargs)
# 2) safe dry run
export DRY_RUN=1
python3 ~/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py
# 3) if output looks right, remove DRY_RUN and run for real (or let cron do it)
```

## Cron
- Job `ebdae9cc10ab`, schedule `0 3 * * *` (11:00 AM MYT).
- Prompt runs the script; reports sent/failed/470 blocks concisely.

## Pitfalls
- **Status value mismatch**: sheet uses `SIAP DIAMBIL` (confirmed). If reminders show
  "0 pending" but rows exist, check the actual `STATUS_REPAIR` text vs the filter.
- **470 errors are expected** for customers who haven't messaged in 24h — not a bug.
  Long-term fix = pre-approved WhatsApp template message instead of free-form text.
- **Share permission**: if script throws 403, the sheet isn't shared with the SA email.
