# Pickup Reminder — Operational Notes

## Run History

### 26 Jul 2026 (this session)
- Tab: REPAIR BARU | Filter: SIAP
- Pending: 621 | Sent: 606 | Failed: 15
- Owner summary: sent to 60198021500
- 470 blocks: 0 (consistent with Jul 24)
- Pre-flight: credential OK (+60 11-4956 1698)
- Run time: ~7 min, exit 0
- Consistency confirmed with Jul 24 run (identical volume/timing/results)

### 24 Jul 2026 (first successful full run)
- 606 messages delivered in ~7 min, exit 0
- Zero 470 blocks despite many old 2022 tickets

## Known Failure Patterns (confirmed live)

| Pattern | Count (Jul 26) | Impact |
|---|---|---|
| No phone number in sheet | 11 entries | Skipped silently |
| Two phones separated by `/` | 2 entries (ID-677, ID-693) | HTTP 400 |
| Non-MY numbers (917..., 189..., 168...) | 3 entries | Sent without API error, but customer likely never receives |

## How to Run (safe sequence)

```bash
# 1. Export all required env vars
export GOOGLE_SHEET_ID="1T0FzNhkOTgyORFvllsc0pXz2xsZV2nkrwBBvzNYs9KE"
export GOOGLE_SHEETS_CREDENTIALS="/home/hafizi145/.hermes/secrets/gsheet_sa.json"
export PICKUP_REMINDER_TAB="REPAIR BARU"
export WHATSAPP_CLOUD_PHONE_ID="1089032617637482"
export WHATSAPP_CLOUD_ACCESS_TOKEN="<token-from-bot-.env>"
export OWNER_PHONE="60198021500"
export PICKUP_REMINDER_STATUS_VALUE="SIAP"

# 2. Dry run first
export DRY_RUN=1
python3 ~/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py

# 3. If dry run looks right, live send (background recommended)
export DRY_RUN=0
python3 ~/.hermes/skills/software-development/hafjet-biz-ops/scripts/hafjet_pickup_reminder.py
```

## Future Enhancement Ideas
- norm_phone(): split on `/` and use first number only
- norm_phone(): reject numbers not starting with `60` or < 11 digits
- Pre-filter old SIAP entries (> 1 year) to reduce batch size
- Add MAX_PER_RUN=50 env var for cron auto-chunking
