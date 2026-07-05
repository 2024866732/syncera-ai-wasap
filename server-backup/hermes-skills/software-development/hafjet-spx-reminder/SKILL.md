---
title: HAFJET SPX WhatsApp Reminder Integration
name: hafjet-spx-reminder
description: Class-level skill for building and operating the SPX self-collection WhatsApp reminder system. Covers pilot rollout, external API sync, SQLite schema migration, state machine design, 24h WhatsApp policy, and scheduler architecture for HAFJET projects.
---

# HAFJET SPX WhatsApp Reminder Integration

## Design Principles
- **CSV first** for data import (stable, no scraping).
- **Session API second** for unknown fields: `list` gives masked phone → call `show_secret` per order.
- **Pilot before scale**: daily cap + status filter before rolling out to all orders.
- **No hardcoded secrets**: cookies live in `spx_session` DB table, never code or `.env`.
- **Cooldown aware**: per-order 12h gap between reminders; daily cap via `messages` table.
- **24h policy**: free-form within 24h of last inbound, template if outside window. (Template activation is ON HOLD until WhatsApp templates are approved.)

## Database
- `spx_self_collection_orders` — orders with `entity_id`, nullable `recipient_phone`, `spx_status` (string), `hafjet_reminder_state`.
- `spx_session` — single row (`id=1 CHECK`) storing portal cookies.
- Migrate by PRAGMA detection: if `entity_id` missing, DROP+RECREATE table + indexes.

## Status Mapping
`1=ReadyForCollection|2=Remind1|3=Remind2|4=Remind3|5=Remind4|6=Collected|7=CollectionFailed|8=Return_Outbound|9=Return_Packing`

## API (webhook_listener.py)
- `normalize_spx_status(int)` → string
- `fetch_spx_order_list(cookies, pageno, count)` → list.json (401 → SPX_SESSION_EXPIRED)
- `fetch_spx_phone(cookies, entity_id, tracking)` → `real_message`
- `batch_sync_spx_orders()` → upsert all then reveal missing phones (0.3s / 0.5s)
- `count_spx_reminders_sent_today()` → int from `messages` where `routing_path='spx_reminder'`
- `save_spx_cookies(cookies_str)` / `get_spx_cookies()` → DB persistence
- Endpoints: `POST /api/spx/session`, `GET /api/spx/session-status`, `POST /api/spx/sync`
- 401 handling: return `{"error":"SPX_SESSION_EXPIRED"}` without logging cookies.

## Scheduler + Pilot
- `_check_spx_reminders()` runs every 15 min.
- Pilot cap: `count_spx_reminders_sent_today() >= 60`.
- Send window: **08:00–21:00 Malaysia time (`Asia/Kuala_Lumpur`)** via `zoneinfo`. Skip outside window with log `[SPX] Outside Malaysia send window: HH:MM MYT (server UTC HH:MM)`.
- Eligibility filter: `spx_status=ReadyForCollection` AND `inbound_time` within 7 days.
- `_resolve_next_reminder_state(order)` computes next template based on time thresholds.
- Templates (BM): `Remind1/2/3/4`, `CollectionFailed`.
- Live send via `send_whatsapp_message()` (free-form). Each successful send logs `[SPX-PILOT] sent tracking=... phone=... template=... time=...`.
- Daily cap log: `[SPX-LIMIT] daily cap 60 reached at <UTC timestamp>`.

## Guards (must keep)
- `recipient_phone IS NULL` → skip
- `is_paused = 1` → skip
- `spx_status IN (Collected, Return_Outbound, Return_Packing)` → skip
- `hafjet_reminder_state IN (Completed, CollectionFailed)` → skip
- `last_reminder_sent_at` within 12h → skip
- Daily cap `>= 60` → STOP with `[SPX-LIMIT] daily cap 60 reached at <timestamp utc>`
- Send window: 08:00–21:00 MYT via `ZoneInfo("Asia/Kuala_Lumpur")`; outside → log and return

## Frontend (`dashboard/src/components/SPXOrders.jsx`)
- Session banner + save/test.
- Sync button triggering `/api/spx/sync`.
- Orders table with phone-status badges.
- Nav item in `Layout.jsx` (`id='spx-orders'`).

## Subagent Patch Discipline
When multiple subagents or parallel tool calls may edit the same file:
- **Never overwrite a file with `write_file`** if another agent/session also patched it in the same context. Use `patch(action='replace'` with unique `old_string` instead.
- If `patch` reports "modified by sibling subagent", re-read the file first to capture the current state, then apply your change as a fresh patch.
- This prevents clobbering concurrent edits to `webhook_listener.py`, `db_logger.py`, or dashboard files.

## Reference
- `references/spx-endpoints.md` — confirmed endpoint details, field mappings, thresholds.
- `references/spx-shopee-integration.md` is superseded; detailed notes moved here.
