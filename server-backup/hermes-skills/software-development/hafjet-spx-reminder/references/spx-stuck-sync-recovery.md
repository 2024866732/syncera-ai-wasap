# SPX Stuck Sync — Empty/Stale Cookies Diagnosis & Recovery

## Symptom
Sync shows `phase=fetching_phones`, `running=True`, but `phones_fetched` stays at **0** for hundreds of batches (offset climbs to 900+, errors empty). "⚠️ Phone fetch stuck" warning appears in dashboard.

## Root Cause (confirmed Jul 2026)
The running sync copy of cookies is **stale/empty**, NOT the session table.

- `spx_session.cookies` → ✅ has `x-sap-ri=` / `x-sap-sec=` (user pasted correctly)
- `spx_sync_state.state_json → cookies` → ❌ **length 0 / EMPTY**

When a sync triggers, `api_spx_sync()` does:
```python
cookies = get_spx_cookies()   # reads spx_session NOW
_sync_progress = { ..., "cookies": cookies, ... }
```
If the user pasted `x-sap-ri`/`x-sap-sec` into the dashboard **AFTER** the sync started, the in-flight sync keeps the OLD (pre-paste) cookies. `fetch_spx_phone()` then calls `show_secret` with empty/stale cookies → 401 → returns `None` silently → `phones_fetched` never increments. The offset keeps advancing through all orders, burning the whole table with 0 success.

## Direct DB Diagnosis (production)
**DB path on Azure:** `/home/data/bot_data.db` (NOT `/site/wwwroot/bot_data.db`).
Download via Kudu VFS, then run SQL locally:

```python
# download: Kudu VFS GET /api/vfs/data/bot_data.db  (Bearer AAD token from az account get-access-token)
import sqlite3, re
conn = sqlite3.connect("prod_db_check.db")
cur = conn.cursor()

# 1. Session table — does it have SAP headers?
cur.execute("SELECT cookies FROM spx_session WHERE id=1")
sess = cur.fetchone()[0] or ""
print("spx_session has x-sap-ri=:", "x-sap-ri=" in sess)
print("spx_session has x-sap-sec=:", "x-sap-sec=" in sess)

# 2. RUNNING sync state — does IT have cookies?
cur.execute("SELECT state_json FROM spx_sync_state WHERE id=1")
state = json.loads(cur.fetchone()[0])
print("sync_state cookies length:", len(state.get("cookies", "") or ""))
print("sync phase/running:", state.get("phase"), state.get("running"))
print("phones_fetched:", state.get("phones_fetched"))
conn.close()
```

**Key insight:** `spx_session` being correct is NOT enough. If `spx_sync_state.cookies` is empty while the sync is `running`, phone fetch will silently fail. Always check BOTH.

## Recovery (pick one)

### Option A — Reset + Re-trigger (re-reads fresh cookies)
```
POST /api/spx/sync-reset     # force idle
POST /api/spx/sync           # re-reads get_spx_cookies() → now has SAP headers
```
Frontend: click **Sync from SPX Now** (it auto-resets + reads fresh cookies).

### Option B — Fetch Phones only (lighter, reads fresh cookies)
```
POST /api/spx/fetch-phones
```
This endpoint calls `get_spx_cookies()` **directly** (not `_sync_progress["cookies"]`), so it always uses the latest `spx_session` value. Use when orders are already synced and only phones are missing. ⚠️ Synchronous + 0.5s/phone delay → can hit Azure 230s LB timeout on large batches (~600+ phones). Prefer the background sync for 2000+ missing.

## Prevention
- Paste `x-sap-ri`/`x-sap-sec` into the dashboard **BEFORE** clicking Sync.
- If you paste mid-sync, the running sync won't see them — reset + re-trigger.
- After paste, verify with the SQL above: `spx_session` AND `spx_sync_state` should both carry the headers once a fresh sync starts.

## Quick SQL one-liner (what the user asked for)
```sql
SELECT length(cookies), substr(cookies, -200) FROM spx_session;
```
⚠️ Caveat: `substr(cookies, -200)` only shows the tail. `x-sap-ri`/`x-sap-sec` may sit MID-string (not at the very end). Always do a full `INSTR(cookies, 'x-sap-ri=')` / `LIKE '%x-sap-ri=%'` scan, not just tail inspection.
