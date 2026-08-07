# Frigate 0.17 event DB — alerts & visitor-count recipe (Fasa A, 2026-08-05)

Applies to HAFJET Frigate 0.17.2 (`/home/hafizi145/frigate/config/frigate.db`, office PC). Read-only pattern for building alert pollers and daily analytics without touching the live Frigate config.

## Schema facts (VERIFIED 2026-08-05)
- `event` columns include: `id, label, camera, start_time, end_time, top_score, false_positive, zones, thumbnail, has_clip, has_snapshot, region, box, area, sub_label, ratio, score, model_hash, detector_type, model_type, data`.
- **`score`, `top_score`, `false_positive` are ALL NULL** in 0.17 rows. The actual confidence is inside `data` JSON:
  ```json
  {"box":[...],"region":[...],"score":0.84375,"top_score":0.84375,
   "attributes":[],"type":"object","max_severity":"alert",
   "path_data":[[[0.16,0.99],epoch],...]}
  ```
  So always parse `json_extract(data,'$.top_score')` (or `data` in Python) — never filter on the column.
- Event `id` format: `1785925028.411162-d6zhvo` (epoch.float + random suffix). Sort/order by `start_time`; use `id` as resume cursor.
- `has_snapshot`, `has_clip` are real int columns (1/0). `detector_type='cpu'`, `model_type='ssd'` (Frigate default CPU model).
- SQLite read-only connect: `sqlite3.connect(f"file:{DB}?mode=ro", uri=True)`.

## Event volume reality
- ~450 person events / 24h across 2 cameras with `data.top_score >= 0.55` (2026-08-04→05 measurement).
- Hourly pattern (MYT localtime): 09:00→100, 10:00→51, 11:00→68 … early morning 2–22/hr. Business window 9am–9pm is the busy period.
- Frigate records a segment every ~10s and nearly every one maps to a person event → raw event count is NOT visitor count.

## Visitor counting (batch daily)
1. Window = local MYT day: `datetime.strptime(date,"%Y-%m-%d").replace(tzinfo=MYT)` → `[start_ts, start_ts+86400)`.
2. Query: `SELECT id,camera,start_time,data FROM event WHERE label='person' AND start_time>=? AND start_time<? ORDER BY start_time ASC`.
3. Filter per event: `parse(data).top_score >= 0.55` AND hour in `[9,21)` MYT.
4. **Coalesce:** sort ts per camera; count a new visitor only when `ts - last_ts > 120` (COALESCE_SECONDS). Two minutes = same person still in frame.
5. Upsert to Supabase `visitor_daily(date, entrance, outdoor_shop, total, source, updated_at)` with `Prefer: resolution=merge-duplicates` on `date=eq.<date>`.

Measured result (2026-08-04): `outdoor_shop: 84, entrance: 46` → 130 visitors/day.

## Alert poller pattern (customer-in / suspicious-night)
- Poll Frigate DB every N minutes (NOT Frigate webhook — that would require config change; constraint was no-live-config-change).
- `SELECT ... WHERE label='person' AND start_time >= strftime('%s','now','-24 hours') ORDER BY start_time DESC LIMIT 500` → parse score from `data` → keep `>= 0.55` → sort asc → skip events with `id <= last_event_id` (state file).
- Cooldown: one alert per `COOLDOWN_SECONDS` (300s) to avoid spam at 100 events/hour.
  In the loop, `break` immediately after the FIRST successful send (`sent=True`) — otherwise
  one run fires an alert for every new event in the window (476 new events → 476 WhatsApps).
- Load `.env` on the Office PC WITHOUT python-dotenv (stdlib only):
  ```python
  for line in Path("/home/hafizi145/cctv-analysis/.env").read_text().splitlines():
      if "=" in line and not line.startswith("#"):
          k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
  ```
- Classify: hour 9–21 MYT → `type=customer`; else → `type=suspicious` (Fasa B ready).
- POST JSON to bot `/cctv-alert` with `X-CCTV-Token` header; state persisted to `alert_state.json` (`last_event_id`, `last_alert_ts`) so restarts are idempotent.
- Bot endpoint builds a WhatsApp text message (customer: 🛎️ Kamera + masa; suspicious: ⚠️ AMARAN + confidence) and sends to `CCTV_ALERT_TARGET` via existing `send_whatsapp_message()`.

## Supabase access on VPS
- `~/.hermes/.env` holds `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` (values not printed).
- supabase-py 2.31.0 installed under **`python3.10`** ONLY — `python3` (3.11) gives `ModuleNotFoundError: No module named 'supabase'`. Always run Supabase SDK scripts with `python3.10`.
- PostgREST cannot create tables (DDL) — create `visitor_daily` via Supabase SQL Editor (see session SQL: CREATE TABLE IF NOT EXISTS … ENABLE ROW LEVEL SECURITY … policy select true … GRANT SELECT anon/authenticated).
- Read back for dashboard: `GET {SUPABASE_URL}/rest/v1/visitor_daily?order=date.desc&limit=30` with anon key works once the table + RLS policy exist.
- Dashboard = single self-contained HTML: fetch the REST URL above with `apikey`+`Authorization` headers set to the anon key, render stat cards (last day / 7-day total / max) + table. No backend needed; inject the URL + key at build time (replace placeholders) — never hardcode the service_role key client-side.

## Delivery status
Fasa A components built + unit-tested 2026-08-05; deploy pending Tuan approval:
- `/cctv-alert` endpoint added to `syncera-ai-wasap/bots/hafjet-azure/webhook_listener.py` (needs Azure env: CCTV_ALERT_TOKEN, CCTV_ALERT_TARGET, CCTV_ALERT_ENABLED).
- Poller + visitor scripts drafted in cache (`cctv_alert_poller.py`, `cctv_visitor_count.py`) — deploy to office `~/cctv-analysis/` + cron (`*/2 * * * *` poller, `30 15 * * *` count) after approval.
- Note: bot listener in that repo also has a Flask sibling `whatsapp_webhook_v2.py` (VPS :8080) — confirm which bot is live for the alert target before deploying.
