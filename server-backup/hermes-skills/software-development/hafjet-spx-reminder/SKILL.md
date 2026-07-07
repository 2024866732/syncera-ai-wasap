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

## SPX API Code Patterns (Jul 2026 learnings)

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

**Solution — `_safe_json` function that locates brackets and extracts clean JSON:**
```python
def _safe_json(text: str) -> dict:
    """Parse JSON from SPX API response, stripping non-JSON prefix/suffix."""
    # Find first '{' or '['
    start = -1
    for ch in ("{", "["):
        idx = text.find(ch)
        if idx != -1 and (start == -1 or idx < start):
            start = idx
    if start == -1:
        raise json.JSONDecodeError(f"No JSON object/array found", text, 0)
    text = text[start:]
    # Track bracket depth to find matching close
    depth = 0
    in_str = False
    esc = False
    for i, ch in enumerate(text):
        if esc: esc = False; continue
        if ch == "\\" and in_str: esc = True; continue
        if ch == '"' and not esc: in_str = not in_str; continue
        if in_str: continue
        if ch == text[0]: depth += 1
        elif (text[0] == "{" and ch == "}") or (text[0] == "[" and ch == "]"):
            depth -= 1
            if depth == 0:
                return json.loads(text[:i+1])
    raise json.JSONDecodeError(f"Unmatched bracket", text, 0)
```

**Usage pattern in fetch functions:**
```python
async with httpx.AsyncClient(timeout=30) as client:
    resp = await client.get(url, params=params, headers=headers)
    resp.raise_for_status()
    try:
        return resp.json()        # Fast path — works when no prefix
    except json.JSONDecodeError:
        return _safe_json(resp.text)  # Fallback — strips prefix
```

Apply this to both `fetch_spx_order_list()` and `fetch_spx_phone()`.

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
- `references/spx-endpoints.md` — confirmed endpoint details, field mappings, thresholds.
- `references/spx-session-debug.md` — SPX session debugging protocol: diagnosis steps, CSRF hypothesis, cookie capture guide.
