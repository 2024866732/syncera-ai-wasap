# SPX Autopilot v1 — Architecture Reference

## Build Date: 2026-07-27 | Option B (Balanced)

## Components

### 1. Tampermonkey v4.0 (`spx_autopilot_v1_rollout_safe.user.js`)
- **Source**: Evolved from PoC v3.2 (all extraction/reveal/dedupe logic preserved)
- **Auto-timer**: `setInterval` every 15 min (configurable `AUTOPILOT.INTERVAL_MINUTES`)
- **Session guard**: `isSessionValid()` checks for table header existence + login prompt detection
- **Retry queue**: `_retryQueue` array — failed pushes retried next cycle (max 3 attempts)
- **Start/stop**: `__spx_start_autopilot()`, `__spx_stop_autopilot()`, `__spx_autopilot_state()`
- **Config**: `AUTOPILOT` block with `ENABLED`, `BATCH_LIMIT`, `STATUS_FILTER`, `BACKEND_URL`, `API_KEY`
- **Rollout-safe defaults**: `ENABLED=false`, `BATCH_LIMIT=5` — operator must manually start first cycle

### 2. Backend: Bulk-Map Endpoint (`POST /api/spx/bulk-map-phones`)
- Accepts `[{tracking, phone}]` from Tampermonkey
- Uses `update_spx_phone_by_tracking()` (in `db_logger.py`)
- Staff auth via JWT (`Depends(get_current_staff)`)
- Idempotent — safe for retry
- Response: `{updated, skipped, errors, total, details}`

### 3. Backend: Admin Summary Cron
- APScheduler job `spx_autopilot_summary` (60 min interval)
- Function: `_send_autopilot_summary()` — logs `[SPX-SUMMARY]` with phones_mapped, missing, coverage%
- Hermes cron `938acee3db9b` (65 min) reads Azure logs via `spx_autopilot_summary.sh`, formats, delivers to Telegram

### 4. Reminder Engine (unchanged from v1.1)
- `_check_spx_reminders()` — 15 min interval
- `determine_followup()` from `spx_followup.py` — status-based, collect_by_date fallback
- Anti-duplicate, anti-downgrade, daily cap 60, send window 08-21 MYT
- Lazy import: `from spx_followup import determine_followup` inside function with try/except

## Flow
```
SPX Tab (logged in) → Tampermonkey timer → extract+reveal → POST /bulk-map-phones
                                                                    ↓
DB phone updated → reminder scheduler → WhatsApp send (if stage triggered)
                                                                    ↓
Admin summary cron → log [SPX-SUMMARY] → Hermes reads → Telegram to Tuan
```

## Key Constraints
- SPX login still manual (session-dependent)
- Tab must remain open (foreground or background)
- Batch capped at 500 per request (backend), 30 default (frontend)
- API key must be configured before first use

## Rollout Steps
1. Import `spx_autopilot_v1_rollout_safe.user.js` (ENABLED=false, BATCH=5)
2. Edit `API_KEY` placeholder
3. `__spx_start_autopilot()` — observe first cycle
4. Smoke test: verify push response, dashboard missing phones decrease
5. After stable: set `ENABLED=true`, increase `BATCH_LIMIT` to 20-30
