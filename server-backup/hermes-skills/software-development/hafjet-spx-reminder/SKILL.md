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
- `batch_sync_spx_orders()` ⚠️ **DEPRECATED** — use incremental sync instead
- `count_spx_reminders_sent_today()` → int from `messages` where `routing_path='spx_reminder'`
- `save_spx_cookies(cookies_str)` / `get_spx_cookies()` → DB persistence
- 401 handling: return `{"error":"SPX_SESSION_EXPIRED"}` without logging cookies.

**Endpoints:**

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/spx/session` | POST | Save SPX cookies | Active |
| `/api/spx/session-status` | GET | Test session (lightweight list call, count=1) | Active |
| `/api/spx/sync` | **POST** | **Trigger incremental background sync → returns 202** | ✅ NEW |
| `/api/spx/sync-progress` | **GET** | **Poll current sync state** | ✅ NEW |
| `/api/spx/stats` | GET | Dashboard stats | Active |
| `/api/spx/mark-collected` | POST | Mark order collected | Active |

## Incremental Background Sync Architecture

**Why:** Azure App Service load balancer enforces ~230-240s timeout. Full sync of 2315 orders + phone lookups takes ~20 min — guaranteed timeout with synchronous request.

**Solution:** APScheduler-based incremental sync that processes **50 orders per tick** every **30 seconds**, tracked via in-memory progress state.

### ⚠️ Multi-Worker Split-Brain (Critical)

**`gunicorn -w 2` creates two independent Python processes, each with its own copy of `_sync_progress`.** When the frontend triggers `POST /api/spx/sync`:
- Worker A receives the request → sets `_sync_progress["running"] = True`
- Worker B handles the polling `GET /api/spx/sync-progress` → reads `_sync_progress["running"] = False`
- **Result:** Frontend shows no progress despite sync running on Worker A

**Fixes (pick one — ordered by reliability):**
1. **✅ Proper fix:** Store progress in SQLite `spx_sync_state` table using `load_sync_progress()`/`save_sync_progress()` (DB-backed, survives restarts, consistent across workers)
2. **Quick fix:** Change gunicorn to `-w 1` (loses parallel request handling, but state is consistent)
3. **❌ Not-recommended:** Use in-memory state with multi-worker (frontend polling split-brain)


**Symptoms of this issue:**
- Sync trigger returns `202 Accepted` ✅
- Repeated sync-progress polls show `phase=idle, running=false`
- Dashboard "Syncing..." spinner stays forever
- Check server logs for actual sync activity (only visible if logs from Worker A are captured)

### fetch-phones 504 Gateway Timeout

**`POST /api/spx/fetch-phones` times out with HTTP 504 because Azure's load balancer enforces ~230s limit.** Each phone fetch call to SPX takes ~1.5s + 0.5s delay = ~2s/phone. At batch size 25:
- 25 × 2s = ~50s (within limit)
- But SPX API can be slow (3-5s per call), pushing to 125-150s
- PLUS network latency, DB contention → easily exceeds 230s with `-w 2` adding complexity

**Workarounds:**
1. **Reduce batch size:** Change `_SYNC_PHONE_BATCH` from 25 to 10
2. **Make it async:** Run phone fetch as a background task (APScheduler tick), not a synchronous endpoint
3. **Frontend polling:** Trigger via background sync, poll sync-progress instead of blocking
4. **Current status:** Jul 2026 — `fetch-phones` endpoint exists at `POST /api/spx/fetch-phones` (requires JWT auth), returns 504 on large batches. Use the background sync (`POST /api/spx/sync`) for phone fetching instead.

### State machine

```
idle → fetching_orders → fetching_phones → completed
                        ↘ failed
```

### Shared progress state (`_sync_progress` dict, DB-backed since v2.2.1)

**Storage:** `spx_sync_state` SQLite table (single row `id=1`, JSON blob in `state_json` column). Persisted via `save_sync_progress()` after every tick and every phase change. Loaded on app startup via `load_sync_progress()`.

**Import:**
```python
from db_logger import load_sync_progress, save_sync_progress
```

**DB-layer implementation (db_logger.py):**

```python
SYNC_PROGRESS_DEFAULTS = {
    "running": False,
    "phase": "idle",
    ...
}

def load_sync_progress() -> dict:
    """Load from DB, merge with defaults for missing keys."""
    ...

def save_sync_progress(data: dict) -> None:
    """Save to DB with UPSERT (ON CONFLICT DO UPDATE).
    Cleans non-serialisable types (datetime → str)."""
    ...
```

**Initialization (webhook_listener.py):**
```python
_sync_progress = load_sync_progress()
```

**Persistence points — every code path that modifies `_sync_progress` MUST save:**
1. `_sync_spx_batch()` — `finally: save_sync_progress(prog)` after try/except
2. `api_spx_sync()` — after resetting state for new sync
3. `api_spx_sync_reset()` — after force-resetting to idle

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS spx_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state_json TEXT NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
```

### Trigger flow

1. Dashboard user clicks "Sync from SPX Now"
2. `POST /api/spx/sync` resets `_sync_progress`, sets `running=True`, ensures scheduler job exists
3. Returns **HTTP 202 Accepted** immediately
4. APScheduler calls `_sync_spx_batch()` every 30s
5. Each tick processes one page of orders (50/page) or one batch of phone fetches (25/tick)
6. When all pages done → auto-transitions to phone-fetch phase
7. When all phones fetched → marks `phase=completed`

### Scheduler registration

Registered in `startup_event()` alongside existing escalation and reminder jobs:

```python
_scheduler.add_job(
    _sync_spx_batch,
    IntervalTrigger(seconds=_SYNC_INTERVAL_SECONDS),
    id="spx_incremental_sync",
    replace_existing=True,
)
```

Config constants: `_SYNC_BATCH_SIZE=50`, `_SYNC_PHONE_BATCH=25`, `_SYNC_INTERVAL_SECONDS=30`

### Sync speed tuning (Jul 2026 learnings)

The sync configuration constants are tunable based on order volume and SPX API rate limits:

| Constant | Default | Optimised (2315 orders) | Adjustment |
|----------|---------|------------------------|------------|
| `_SYNC_BATCH_SIZE` | 50 | **150** | Orders fetched per SPX API call |
| `_SYNC_INTERVAL_SECONDS` | 30 | **15** | Seconds between scheduler ticks |
| `_SYNC_PHONE_BATCH` | 25 | **10** | Phone fetches per tick (reduced from 25 to avoid 504 Gateway Timeout) |
| `w` (gunicorn workers) | 2 | **1** | Workers when using in-memory state; 2+ OK with DB-backed progress |

**Tuning rule of thumb:** For N orders across P pages at batch size B with interval I seconds:
- Order-sync time ≈ P × I seconds
- Phone-sync time ≈ (missing_phones ÷ phone_batch) × I seconds
- Total ≈ sum of both phases

For 2315 orders at 150/page = 16 pages × 15s = **~4 min** order sync + phone phase.
For 2315 orders at 50/page = 47 pages × 30s = **~23.5 min** order sync + phone phase.

**Don't exceed:** SPX API rate limits (~2 req/s). Batch size 150 with interval 15s = 1 tick/15s, well within safe limits.

### Ticket time estimate

- 2315 orders ÷ 150/page = 16 pages × 15s = **~4 min** for order sync
- Phone lookups: ~2311 missing × 25/tick × 15s interval ≈ **~23 min**
- **Total:** ~27 min (was 40-45 min with default settings)

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
- Sync button triggering `/api/spx/sync` → returns **202 Accepted** (no longer blocking).
- Polls `GET /api/spx/sync-progress` every **3 seconds** until `phase=completed|failed`.
- Progress bar: blue for order-fetching, yellow for phone-fetching.
- Sync results displayed as progress bar + counts; on completion shows ✅ Sync complete.
- Orders table with phone-status badges.
- Nav item in `Layout.jsx` (`id='spx-orders'`).

## WebSocket Handlers — send_json, not send_text

**Critical Pattern (Jul 2026):** The backend WS heartbeat handler must use `send_json({"type": "pong"})`, NOT `send_text("pong")`. The frontend processes all WS messages through `JSON.parse(event.data)` — plain text `"pong"` causes runtime error `Unexpected token p, pong is not valid JSON` which crashes the `onmessage` handler and breaks the entire WS reconnect loop.

### Backend WS handler (webhook_listener.py)

```python
# BROKEN — plain text crashes frontend JSON.parse:
await websocket.send_text("pong")

# FIX — always send JSON:
await websocket.send_json({"type": "pong"})
```

### Frontend WS handler (api.js and useWebSocket.js)

Both `api.js` (`connectWebSocket`) and `useWebSocket.js` (`useWebSocket`) must wrap `JSON.parse(event.data)` in try/catch and **silently ignore non-JSON messages**:

```js
// api.js — connectWebSocket()
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (onMessage) onMessage(data);
  } catch (e) {
    // Ignore non-JSON messages (heartbeat pong, etc.)
  }
};
```

```js
// useWebSocket.js — useWebSocket()
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data?.event) handleWsEvent(data);
  } catch (e) {
    // ignore non-JSON (e.g., "pong")
  }
};
```

Do NOT log parse errors to console — they're expected noise from heartbeats.

### Frontend Sync Polling Pattern

```jsx
// api.js — new function
export async function fetchSPXSyncProgress() {
  const res = await fetch(`${API_BASE}/api/spx/sync-progress`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get sync progress');
  return data;
}

// SPXOrders.jsx — handleSync with polling
async function handleSync() {
  setSyncLoading(true);
  setSyncResult(null);
  setSyncProgress(null);

  const data = await fetchSPXSync();  // returns 202 immediately
  setSyncResult(data);

  // Poll progress every 3s
  const timer = setInterval(async () => {
    const prog = await fetchSPXSyncProgress();
    setSyncProgress(prog);
    if (prog.phase === 'completed' || prog.phase === 'failed') {
      clearInterval(timer);
      setSyncLoading(false);
      loadOrders();
      loadStats();
    }
  }, 3000);
  setSyncPollTimer(timer);
}
```

### Progress UI Pattern

```jsx
{syncProgress && syncProgress.running && syncProgress.phase === 'fetching_orders' && (
  <>
    <div>⏳ Page {page}/{total} — {synced} synced</div>
    <div style={{background:'#21262d', height:8, borderRadius:4}}>
      <div style={{
        width: `${Math.min(100, (page/total)*100)}%`,
        background: '#1f6feb', height: 8, borderRadius: 4,
        transition: 'width 0.5s ease',
      }} />
    </div>
  </>
)}
{syncProgress && syncProgress.running && syncProgress.phase === 'fetching_phones' && (
  <>
    <div>📞 {fetched}/{total_missing} phones fetched</div>
    <div style={{background:'#21262d', height:8, borderRadius:4}}>
      <div style={{
        width: `${Math.min(100, (fetched/total_missing)*100)}%`,
        background: '#d29922', height: 8, borderRadius: 4,
        transition: 'width 0.5s ease',
      }} />
    </div>
  </>
)}
{syncProgress && !syncProgress.running && syncProgress.phase === 'completed' && (
  <div>✅ Sync complete — {synced} orders, {phones_fetched} phones</div>
)}
```

## SPX Status Display-Name Normalization (Jul 2026 fix)

**Problem:** Frontend dropdown shows display names `"Ready For Collection"` and `"Collection Failed"` but the DB stores `"ReadyForCollection"` and `"CollectionFailed"`. When the user selects a filter in the dropdown, the exact string is sent to the backend — which performs an exact-match filter against DB values. Result: filter returns "No orders found" despite matching records existing.

### Root cause

The SPX API returns integer status codes (1-9). The `normalize_spx_status()` function maps them to PascalCase strings: `ReadyForCollection`, `CollectionFailed`. But the frontend `SPX_STATUSES` array used display names inherited from the SPX portal UI which uses spaces. The DB uses the PascalCase strings from the normalization function.

### Two-pronged fix

**1. Frontend — use DB values in dropdown:**

```jsx
const SPX_STATUSES = [
  'ReadyForCollection', 'Remind1', 'Remind2', 'Remind3', 'Remind4',
  'Collected', 'CollectionFailed', 'Return_Outbound', 'Return_Packing',
];
```

**2. Backend — add alias map for loose matching:**

```python
# webhook_listener.py
_SPX_STATUS_ALIASES = {
    "ready for collection": "ReadyForCollection",
    "readyforcollection": "ReadyForCollection",
    "collection failed": "CollectionFailed",
    "collectionfailed": "CollectionFailed",
    # ... all other statuses
}

# In the filter endpoint:
if status:
    _normalised = _SPX_STATUS_ALIASES.get(status.lower().strip(), status)
    all_orders = [o for o in all_orders if o.get("spx_status") == _normalised]
```

The alias map provides backward compatibility: any client sending display names (from old bundled JS, API scripts, etc.) still matches correctly. The frontend fix prevents the bug at source.

### Where status values live

| Location | Value | Source |
|----------|-------|--------|
| SPX API (raw) | `1` through `9` | `_SPX_STATUS_MAP` |
| After `normalize_spx_status()` | `"ReadyForCollection"` etc. | `webhook_listener.py` |
| DB column `spx_status` | PascalCase strings | `upsert_spx_order()` |
| Frontend dropdown | `'ReadyForCollection'` (fixed) | `SPXOrders.jsx` |
| CSV import default | `'ReadyForCollection'` | `import_spx_csv()` |

### Safe string conversion — `_safe_str`

**Problem:** `upsert_spx_order()` calls `.strip()` on fields from SPX API response. SPX API returns mixed types: `storage_id`, `payment_method`, `transaction_method` can be integers (not strings). Calling `.strip()` on an integer raises `AttributeError: 'int' object has no attribute 'strip'`.

**Solution:** Create a helper function that handles all types:
```python
def _safe_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bytes):
        return value.decode().strip()
    return str(value)
```
Use `_safe_str(data.get("field", ""))` instead of `data.get("field", "").strip()` everywhere in `upsert_spx_order`.
### JSON prefix handling — `_safe_json`

**Problem:** The Shopee SPX API (`sp.spx.shopee.com.my`) wraps JSON responses with an anti-hijacking prefix: `)]}'\n` followed by the actual JSON body. Calling `resp.json()` (httpx) or `json.loads(resp.text)` fails because the first character `)` is not valid JSON. The error surface varies:
- `json.JSONDecodeError: Unexpected character ')' at position 0` — if the prefix is the first text
- `json.JSONDecodeError: Extra data: line 1 column 7` — if the parse happens to partially succeed
- `json.JSONDecodeError: Unexpected end of JSON input` — if the body is empty or truncated during sync

**Solution — `_safe_json` that never raises, returns `{}` on any failure:**

```python
def _safe_json(text: str) -> dict:
    """Parse JSON from SPX API response, stripping non-JSON prefix/suffix.
    Returns {} on failure (never raises)."""
    text = (text or "").strip()
    if not text:
        log.warning("🔸 _safe_json: empty body, returning {}")
        return {}
    # Find first '{' or '[' bracket
    start = -1
    for ch in ("{", "["):
        idx = text.find(ch)
        if idx != -1 and (start == -1 or idx < start):
            start = idx
    if start == -1:
        log.warning(f"🔸 _safe_json: no JSON bracket found in {len(text)}b, returning {{}}")
        return {}
    trimmed = text[start:]
    # Track bracket depth to find matching close
    end, depth, in_str, esc = -1, 0, False, False
    for i, ch in enumerate(trimmed):
        if esc: esc = False; continue
        if ch == "\\" and in_str: esc = True; continue
        if ch == '"' and not esc: in_str = not in_str; continue
        if in_str: continue
        if ch == trimmed[0]: depth += 1
        elif (trimmed[0] == "{" and ch == "}") or (trimmed[0] == "[" and ch == "]"):
            depth -= 1
            if depth == 0: end = i + 1; break
    if end == -1:
        log.warning(f"🔸 _safe_json: unmatched bracket in {len(trimmed)}b, returning {{}}")
        return {}
    try:
        return json.loads(trimmed[:end])
    except json.JSONDecodeError as e:
        log.warning(f"🔸 _safe_json: parse failed at pos {e.pos}: {e.msg[:80]}, returning {{}}")
        return {}
```

**Usage pattern in fetch functions — with raw-body debug logging + empty-body guard:**

```python
async with httpx.AsyncClient(timeout=30) as client:
    resp = await client.get(url, params=params, headers=headers)
    body = resp.text or ""
    log.debug("[SPX-DEBUG] GET %s status=%s body(500)=%.500s", url, resp.status_code, body)
    if resp.status_code == 401:
        raise Exception("SPX_SESSION_EXPIRED")
    resp.raise_for_status()
    if not body.strip():
        log.warning("⚠️ SPX order list response body empty — treating as no orders")
        return {}
    try:
        return resp.json()
    except json.JSONDecodeError:
        return _safe_json(body)
```

Apply to both `fetch_spx_order_list()` and `fetch_spx_phone()`. For `fetch_spx_phone()` also log non-200 responses and non-zero `retcode`.
### Universal str() safety for API fields

**Problem (deep):** Even with `_safe_str` and `_parse_sqlite_dt`, a datetime or non-string could still reach `.strip()` if a code path is missed. The UPSERT function in SPX sync had bugs where `datetime.datetime` objects from API timestamps triggered `AttributeError: 'datetime.datetime' object has no attribute 'strip'`.

**Solution — pre-convert all non-primitive values before processing:**
```python
def upsert_spx_order(data: dict) -> dict:
    # SAFETY: convert ALL values to strings upfront
    for _k in list(data.keys()):
        _v = data[_k]
        if _v is not None and not isinstance(_v, (str, int, float)):
            data[_k] = str(_v)
    # ... rest of function
```
This guarantees no `.strip()` call ever receives a non-string regardless of how many helper functions are involved.

### SQLite `RETURNING` clause — not supported on Azure Linux

**Problem:** Azure Linux Web Apps run an older SQLite version (pre-3.35.0) that does not support the `RETURNING` clause (added in SQLite 3.35.0, March 2021). Using `INSERT ... RETURNING *` causes `sqlite3.OperationalError: near "RETURNING": syntax error`.

**Fix — use separate INSERT then SELECT:**
```python
# BROKEN on Azure:
row = conn.execute("INSERT INTO ... VALUES (...) RETURNING *", params).fetchone()

# WORKS on all versions:
conn.execute("INSERT INTO ... VALUES (...)", params)
row = conn.execute("SELECT * FROM ... WHERE id=last_insert_rowid()").fetchone()
# OR by tracking number:
row = conn.execute(
    "SELECT * FROM spx_self_collection_orders WHERE spx_tracking_number = ?",
    (tracking,)
).fetchone()
```

**Test before deploying:**
```python
import sqlite3; print(sqlite3.sqlite_version)
```
If `< 3.35.0`, do not use `RETURNING`.

### SPX endpoint status mapping (reference)
`1=ReadyForCollection|2=Remind1|3=Remind2|4=Remind3|5=Remind4|6=Collected|7=CollectionFailed|8=Return_Outbound|9=Return_Packing`

### Datetime handling — `_parse_sqlite_dt`

**Problem:** `batch_sync_spx_orders()` converts SPX Unix timestamps to `datetime.datetime` objects via `datetime.fromtimestamp()`, then passes them to `_parse_sqlite_dt()` which calls `.strip()` on them — `datetime` has no `.strip()`.

**Solution — dual-type handling in `_parse_sqlite_dt`:**
```python
def _parse_sqlite_dt(value):
    if value is None:
        return None
    if isinstance(value, datetime):           # datetime object from API
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, str):                 # string from CSV import
        s = value.strip()
        if not s:
            return None
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(s, fmt).strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
        return s
    return None
```

**Alternative approach — convert to string early:**
In `batch_sync_spx_orders()`, convert timestamps to strings immediately instead of datetime objects:
```python
inbound = datetime.fromtimestamp(order["inbound_time"]).strftime("%Y-%m-%d %H:%M:%S") if order.get("inbound_time") else None
```
This bypasses the need for `_parse_sqlite_dt` to handle datetime objects, but the dual-type fix in `_parse_sqlite_dt` is more defensive.

## Frontend Auth Pattern (Critical — Fix Before First Use)

**Bug discovered Jul 2026:** All SPX API functions in `api.js` (lines 391-475) hardcode `X-API-Key` header:
```js
headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || '' },
```

But backend SPX endpoints use `Depends(get_current_staff)` which requires `Authorization: Bearer <token>`. A function `getAuthHeaders()` already exists at line 148 that correctly handles both:
```js
function getAuthHeaders() {
  const token = localStorage.getItem('staff_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-API-Key'] = import.meta.env.VITE_API_KEY || '';
  }
  return headers;
}
```

**Fix:** Every SPX function in `api.js` must use `getAuthHeaders()` instead of hardcoded `X-API-Key`:
```js
// BEFORE (broken — always 401):
headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || '' }

// AFTER (uses Bearer token when logged in):
headers: getAuthHeaders()
```

**Affected functions (8 total):** `fetchSPXOrders`, `importSPXCSV`, `updateSPXOrder`, `markSPXCollected`, `fetchSPXStats`, `saveSPXSession`, `fetchSPXSessionStatus`, `fetchSPXSync`.

**Note for `importSPXCSV`:** Uses `FormData` — do NOT set `Content-Type` (browser sets it with boundary). `getAuthHeaders()` returns `Content-Type: application/json` which must be omitted for FormData. Either strip it:
```js
const h = getAuthHeaders();
delete h['Content-Type'];
const res = await fetch(url, { method: 'POST', headers: h, body: form });
```

**Note for `updateSPXOrder` and `saveSPXSession`:** Use `Content-Type: application/json` — `getAuthHeaders()` already includes it, so it works directly.

**Cookies format & debugging:** The backend stores whatever string is sent as `{"cookies": "<string>"}` in `spx_session` and uses it directly as the `Cookie:` header when calling SPX API. Users must paste the **full Cookie header from DevTools → Network tab → Request Headers** (NOT from Application tab which may miss HttpOnly cookies like CSRF tokens).  

For a complete session debugging protocol including CSRF hypothesis and step-by-step 401 diagnosis, see `references/spx-session-debug.md`.

**Error messaging pitfall:** When the backend returns HTTP 401, the response body uses the `detail` key (`{"detail": "Missing or invalid Authorization header"}`). But `saveSPXSession` only reads `data.error`:
```js
if (!res.ok) throw new Error(data.error || data.detail || 'Failed to save session');
//                                                        ^^^^^^^^^^^^^^^^^^^^^^^^ fallback shown to user
```
Since `data.error` is `undefined` (the key is `detail`), the user sees a generic "Failed to save session" instead of the actual auth error. Fix: also check `data.detail`.
```js
if (!res.ok) throw new Error(data.error || data.detail || 'Failed to save session');
```

**After fixing api.js, rebuild dashboard:**
```bash
cd dashboard && npm run build
```
Then rebuild ZIP and redeploy. No backend changes needed.

## Subagent Patch Discipline
When multiple subagents or parallel tool calls may edit the same file:
- **Never overwrite a file with `write_file`** if another agent/session also patched it in the same context. Use `patch(action='replace'` with unique `old_string` instead.
- If `patch` reports "modified by sibling subagent", re-read the file first to capture the current state, then apply your change as a fresh patch.
- This prevents clobbering concurrent edits to `webhook_listener.py`, `db_logger.py`, or dashboard files.

## Reference
- `references/spx-endpoints.md` — confirmed endpoint details, field mappings, thresholds, show_secret behaviours.
- `references/spx-session-debug.md` — SPX session debugging protocol: diagnosis steps, cookie capture guide.
- `references/spx-show-secret-sap-headers.md` — **NEW (Jul 2026):** SAP headers discovery, show_secret payload format, entity_id mapping, troubleshooting.
- `references/status-filter-mismatch.md` — SPX status display-name vs DB value mismatch fix.
- `references/websocket-pong-format.md` — WS heartbeat format fix.

## Deployment Pattern (Jul 2026)

**`az webapp deploy --type zip` is unreliable for this app.** It reports RuntimeSuccessful without actually updating files in `/home/site/wwwroot/`. Use Kudu VFS API PUT to update files directly, then STOP + START the app:

1. Upload changed files via Kudu VFS:
   - **Python files:** `PUT /api/vfs/site/wwwroot/webhook_listener.py` with AAD Bearer token + `If-Match: *`
   - **Dashboard files:** `PUT /api/vfs/site/wwwroot/dashboard/dist/index.html` and `PUT /api/vfs/site/wwwroot/dashboard/dist/assets/<hash>.js`
   - **Use `az rest` for reliability** with `--headers "If-Match=*" --resource https://management.azure.com`
   - Or `curl` with `Authorization: Bearer <token>` where token from `az account get-access-token --resource https://management.azure.com -o tsv`
2. **Stop:** `az webapp stop -n hafjet-whatsapp-bot -g hafjet-bot-rg`
3. Wait 15s (allow container to fully stop)
4. **Start:** `az webapp start -n hafjet-whatsapp-bot -g hafjet-bot-rg`

Do NOT use `az webapp restart` — it may not clear in-memory bytecode cache.

### Dashboard rebuild + upload sequence

```bash
cd dashboard && npm run build

# Read the new JS hash from the built index.html
NEW_HASH=*** -o index.html | grep -oP 'index-\K[A-Za-z0-9]+(?=\.js)')
echo "New hash: $NEW_HASH"

# Upload files via Kudu VFS
for f in "dashboard/dist/index.html" "dashboard/dist/assets/index-$NEW_HASH.js" "dashboard/dist/assets/index-DrejfP5x.css"; do
  az rest --method put \
    --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/$f" \
    --body @"$HOME/.hermes/whatsapp-bot/$f" \
    --headers "Content-Type=application/octet-stream" \
    --headers "If-Match=*" \
    --resource https://management.azure.com
done

# ⚠️ Delete old JS files from VFS — they accumulate and waste space
# List current assets first:
az rest --method get \
  --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/" \
  --resource https://management.azure.com --output json 2>/dev/null

# Delete every JS except the current hash and any CSS:
for old_js in <each-old-hash>; do
  az rest --method delete \
    --url "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/assets/$old_js" \
    --headers "If-Match=*" \
    --resource https://management.azure.com
done

az webapp stop -n hafjet-whatsapp-bot -g hafjet-bot-rg
sleep 15
az webapp start -n hafjet-whatsapp-bot -g hafjet-bot-rg
```

**Important:** Vite generates unique hashes per build (e.g., `index-C2adAMRn.js`, `index-CaF-MTI0.js`, `index-BP7iRMYu.js`, `index-C1NVCYYa.js`). Each build adds ~650KB to the server. Old hashes accumulate and must be manually deleted from VFS after each deploy.

**Browser cache-busting:** After deploying a new JS hash, users must do a **hard refresh (Ctrl+F5 / Cmd+Shift+R)** to load the new bundle. Standard page refresh often serves the old JS from browser cache (`index-<old-hash>.js` still works because the filename is different but the HTML links the old one). The `index.html` changes to reference the new hash, but browsers cache HTML too — use version marker in API responses to confirm the deployment is live.

### Verification pattern

```python
# Save as verify_deploy.py in repo root
import json, urllib.request
req = urllib.request.Request("https://hafjet-whatsapp-bot.azurewebsites.net/api/auth/login",
    data=json.dumps({"email":"hafizi@hafjet.com","password":"admin123"}).encode(),
    headers={"Content-Type":"application/json"})
jwt = json.loads(urllib.request.urlopen(req, timeout=10).read())["access_token"]

req2 = urllib.request.Request("https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/session-status",
    headers={"Authorization": f"Bearer {jwt}"})
data = json.loads(urllib.request.urlopen(req2, timeout=15).read())
assert data["deploy_version"] == "<expected-version>", f"Version mismatch: {data.get('deploy_version')}"

req3 = urllib.request.Request("https://hafjet-whatsapp-bot.azurewebsites.net/dashboard/",
    headers={"Authorization": f"Bearer {jwt}"})
html = urllib.request.urlopen(req3, timeout=10).read().decode()
assert "<new-js-filename>.js" in html, "Dashboard not serving updated JS"
```

### Auto-timeout mechanism (Jul 2026)

**Problem:** If a sync job crashes, hangs, or gets stuck mid-batch (e.g., SPX API timeout, DB lock), the in-memory `running=True` flag persists forever — the frontend shows "Syncing..." with no way to recover.

**Solution — add `last_progress_at` timestamp + auto-terminate check:**

```python
# In _sync_progress dict:
{
    ...
    "last_progress_at": None,  # set on every meaningful progress
}
_SYNC_MAX_IDLE_SECONDS = 900   # 15 minutes
```

At start of every `_sync_spx_batch()` tick, before acquiring lock:

```python
if prog["last_progress_at"] and prog["phase"] in ("fetching_orders", "fetching_phones"):
    elapsed = time.time() - prog["last_progress_at"]
    if elapsed > _SYNC_MAX_IDLE_SECONDS:
        log.warning("[SPX-SYNC] ⏰ Auto-terminate — no progress for %.0fs")
        prog["running"] = False
        prog["phase"] = "failed"
        return
```

Set `last_progress_at` at every meaningful update: after each page of orders, after each phone batch, and on initial sync trigger.

### Force-reset endpoint (Jul 2026)

Add `POST /api/spx/sync-reset` for manual stuck recovery:

```python
@app.post("/api/spx/sync-reset")
async def api_spx_sync_reset(staff: dict = Depends(get_current_staff)):
    global _sync_progress
    _sync_progress = { ... default idle state ... }
    return {"status": "ok", "message": "Sync state reset"}
```

### Orders list returning 0 — `get_all_spx_orders` fix (Jul 2026)

**Problem:** `/api/spx/orders` uses `get_spx_due_orders()` which filters `recipient_phone IS NOT NULL`. Most orders have no phone yet, so dashboard shows "0 orders" despite 2300+ records.

**Fix:** Create `get_all_spx_orders()` with no phone/status filter:

```python
def get_all_spx_orders(limit: int = 1000, offset: int = 0) -> list:
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM spx_self_collection_orders ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
```

Switch the endpoint: `run_in_executor(None, get_all_spx_orders, 10000, 0)`.

### Frontend polling — handle `idle` phase (Jul 2026)

**Problem:** After server restart, `_sync_progress` resets to `phase=idle`. The polling only checks `completed || failed` — `idle` never matches, so `syncLoading` stays true forever.

**Fix — add `idle` as terminal phase:**

```jsx
if (prog.phase === 'completed' || prog.phase === 'failed' || prog.phase === 'idle') {
  clearInterval(timer);
  setSyncPollTimer(null);
  setSyncLoading(false);
  loadOrders();
  loadStats();
}
```

### SQLite `database is locked` awareness (Jul 2026)

Azure SQLite gets `database is locked` when sync `upsert_spx_order()` writes at the same time as login `update_staff_status()` or other writes. WAL mode helps reads but writes still contend. **Mitigations:** retry loop on locked (3 attempts, 0.5s backoff), separate read vs write connections, acceptable on Free tier (upgrade if constant).

### Phone fetch failures — possible causes (Jul 2026)

Phone fetch via `show_secret` can fail for several reasons:

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| HTTP 401 (session expired) | SPX session cookies expired | Re-login to SPX portal, re-paste cookies |
| HTTP 401 + valid session | Missing SAP headers (`x-sap-ri`, `x-sap-sec`) | These are JS-generated, NOT in cookies. Try Pilihan A (cookies-only) or C (manual paste). See `references/spx-show-secret-sap-headers.md`. |
| `retcode=0, real_message=null` | SPX limitation — phone not revealable via API | This affects ~80-90% of orders. CSV import is the only reliable way to populate phones for these. |
| `retcode != 0` | Invalid entity_id, expired tracking, or payload format | Verify entity_id is stored as string, check payload matches confirmed format |
| Connection timeout | SPX API slow or rate-limited | Check `_SYNC_PHONE_BATCH` (reduce to 10), verify rate limiting (0.5s between calls), check server logs for SPX response times |

### SAP Security Headers for `show_secret` (Jul 2026 — Cookie Hypothesis WRONG)

**Critical finding (Jul 2026):** The SPX `show_secret` endpoint does NOT use `X-CSRF-Token`. Network tab analysis from the SPX portal revealed it uses **custom SAP security headers**. However, **these headers are NOT stored in cookies** (initial assumption was wrong) — they are **dynamically generated by JavaScript** in the portal's client-side code.

| Header | Value | Source |
|--------|-------|--------|
| `x-sap-ri` | 36-char hex (UUID-like) | ⚠️ **NOT in cookies** — JS-generated per request |
| `x-sap-sec` | ~500+ chars base64-like (signed/encrypted) | ⚠️ **NOT in cookies** — JS-generated per request |
| `device-id` | `v2-MmYeRgaFMgI2X-ZbOc_fC` | Hardcoded (static per SPX portal build) |
| `app` | `SP Portal` | Hardcoded |
| `version` | `@servicepoint/vue-project:1.0.0-231130` | Hardcoded (static per SPX deployment) |
| `Content-Type` | `application/json;charset=UTF-8` | Must include charset |

**Previous hypotheses (BOTH WRONG):**
1. ❌ `X-CSRF-Token` double-submit cookie pattern — wrong
2. ❌ `sap_ri`/`sap_sec` in browser cookies — wrong (no `sap_ri` or `sap_sec` exist in document.cookie)

**What actually works:** The main SPX order list API (`fetch_spx_order_list()`) works with **cookies only** (no SAP headers at all). The `show_secret` endpoint is more restrictive. Current code tries SAP headers if manually embedded in the cookie string by the user, but otherwise falls back to cookies-only. See `references/spx-show-secret-sap-headers.md` for the Pilihan A/B/C approach and full discovery protocol.

**Confirmed parameters for `show_secret`:**
- `entity_id`: Internal SPX ID (long integer, e.g. `2607444116193438`) — from `order["id"]` in SPX order list API
- `query_id`: SPX tracking number (e.g. `SPXMY061509414257`)
- `entity_type: 2` — entity type ("order")
- `info_type: 2` — info type ("phone number")
- `view_channel: 2` — channel ("web portal")
- Response: `data.real_message` — full unmasked phone number (e.g. `601133114781`)
- Without SAP headers → may return HTTP 401 even with valid session cookies

### Phone-fetch-only endpoint (Jul 2026)

Add `POST /api/spx/fetch-phones` for Phase-2-only sync — retry phone reveal without re-syncing orders:

```python
@app.post("/api/spx/fetch-phones")
async def api_spx_fetch_phones(staff: dict = Depends(get_current_staff)):
    """Fetch missing phones only — no order sync."""
    if _sync_progress["running"]:
        return {"status": "error", "message": "Sync already running"}
    
    cookies = get_spx_cookies()
    if not cookies:
        return {"status": "error", "message": "No SPX session configured"}
    
    missing = get_orders_missing_phone()
    if not missing:
        return {"status": "ok", "message": "No missing phones"}
    
    # Start background task
    _sync_progress.update({
        "running": True, "phase": "phone_fetch",
        "total_missing_phones": len(missing), "phones_fetched": 0,
        "phone_fetch_offset": 0, "last_error": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_progress_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(_fetch_phones_batch(cookies, missing))
    
    return {"status": "accepted", "message": f"Fetching {len(missing)} missing phones"}
```

The background task iterates orders, calls `fetch_spx_phone()` (with CSRF header), updates DB on success, and respects rate limiting (0.5s between calls per `spx-endpoints.md`). On `SPX_SESSION_EXPIRED` it stops and sets `last_error`.

### Sync Phase 2 — auto-transition to phone fetch (Jul 2026)

When `_sync_spx_batch()` detects all pages are done (`page >= total_pages` or empty list returned), it should auto-transition to phone-fetch phase instead of marking complete:

```python
if page >= total_pages or not orders:
    _sync_progress["phase"] = "phone_fetch"
    _sync_progress["current_page"] = 0
    missing = get_orders_missing_phone()
    _sync_progress["total_missing_phones"] = len(missing)
    if missing:
        await _fetch_phones_batch(cookies, missing)
    else:
        _sync_progress["running"] = False
        _sync_progress["phase"] = "idle"
        _sync_progress["completed_at"] = now_dt.isoformat()
    return
```

This ensures phone fetch runs automatically after order sync without manual intervention.

### Auto-timeout mechanism (Jul 2026)

Add to `_sync_progress`:
```python
_sync_progress = {
    ...
    "last_progress_at": None,  # ISO timestamp, set on every meaningful update
}
```

At start of `_sync_spx_batch()`:
```python
# 15 minutes without progress → auto-terminate
if _sync_progress["last_progress_at"]:
    elapsed = (datetime.now(timezone.utc) - 
               datetime.fromisoformat(_sync_progress["last_progress_at"])).total_seconds()
    if elapsed > 900:  # 15 min
        _sync_progress["running"] = False
        _sync_progress["phase"] = "idle"
        _sync_progress["last_error"] = "TIMEOUT_15MIN"
        return

# 60 minutes total runtime → auto-terminate
if _sync_progress["started_at"]:
    elapsed = (datetime.now(timezone.utc) - 
               datetime.fromisoformat(_sync_progress["started_at"])).total_seconds()
    if elapsed > 3600:  # 60 min
        _sync_progress["running"] = False
        _sync_progress["phase"] = "idle"
        _sync_progress["last_error"] = "TIMEOUT_60MIN"
        return
```

Also add `POST /api/spx/sync-reset` for manual stuck recovery.
