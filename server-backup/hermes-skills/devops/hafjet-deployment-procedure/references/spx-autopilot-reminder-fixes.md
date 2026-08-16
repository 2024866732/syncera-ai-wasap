# SPX Autopilot v5.0 & Reminder Fixes — Reference

## Autopilot v5.0 (Fire-and-Forget)

**Location:** `~/.hermes/whatsapp-bot/spx_autopilot_v1_rollout_safe.user.js` (updated to v5.0)

### Key Features
- **Auto-scrape on page load** — runs immediately when SPX page loads
- **Auto-push to backend** — `POST /api/spx/bulk-map-phones` with scraped phones
- **15-min interval** — continuous cycles
- **ENABLED: true by default** — starts automatically
- **Dedupe ON** — `window.__spx_poc_results` cache prevents duplicate pushes
- **Toggle commands:** `__spx_on()`, `__spx_off()`, `__spx_state()`

### Config (in userscript)
```javascript
AUTOPILOT: {
  ENABLED: true,
  INTERVAL_MINUTES: 15,
  STATUS_FILTER: '',  // all statuses including Return_Outbound
  MAX_ROWS_PER_CYCLE: 10,
}
```

### Known Issue: Dedupe blocks phone updates
If tracking exists in local cache, autopilot skips push even if DB has `NULL` phone.
**Workaround:** Manual DB update or clear `window.__spx_poc_results` in console.

---

## Reminder Flow Fixes (2026-08-14)

### 1. Collected orders still getting reminders
**Root cause:** `get_spx_due_orders()` only filtered by `hafjet_reminder_state` and `is_paused`, not by `spx_status`.

**Fix in `db_logger.py`:**
```sql
-- Added to WHERE clause:
AND spx_status NOT IN ('Collected', 'Returned', 'Cancelled', 'Collection Failed')
```

### 2. Auto-complete on terminal status
**Fix in `upsert_spx_order()` (`db_logger.py`):**
```python
_TERMINAL = {"Collected", "Returned", "Cancelled", "Collection Failed"}
if new_status in _TERMINAL and reminder_state not in ("Completed", "CollectionFailed"):
    reminder_state = "Completed"
    log.info(f"[SPX-SYNC] 🔒 Terminal status '{new_status}' → auto-set reminder_state=Completed")
```

### 3. Bulk fix existing data
```sql
UPDATE spx_self_collection_orders
SET hafjet_reminder_state = 'Completed'
WHERE spx_status IN ('Collected', 'Returned', 'Cancelled', 'Collection Failed')
  AND hafjet_reminder_state NOT IN ('Completed', 'CollectionFailed');
-- Result: 3,670 orders updated
```

---

## Dashboard 401 Fix (Dual Auth)

**Root cause:** Frontend `getAuthHeaders()` sent EITHER `X-API-Key` OR `Authorization: Bearer`, never both. Backend middleware checks `X-API-Key`, endpoint checks JWT.

**Fix in `dashboard/src/api/api.js`:**
```javascript
function getAuthHeaders() {
  const token = localStorage.getItem('staff_token');
  const headers = { 'Content-Type': 'application/json' };
  // ALWAYS send BOTH
  headers['X-API-Key'] = import.meta.env.VITE_API_KEY || '';
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
```

**Deploy:** VFS file-by-file (assets first, then atomic `index.html` swap).

---

## Duplicate Reply Fix

**Root causes:**
1. Gunicorn `-w 2` → in-memory dedup per-worker, Meta retry hits different worker
2. AI timeout 75s → webhook blocks, Meta retries after ~10-20s → 2-3 deliveries

**Fixes:**
1. `start.sh`: `-w 2` → `-w 1`
2. `webhook_listener.py`: Return 200 immediately, process in background:
```python
asyncio.create_task(_process_webhook_payload(data))
return JSONResponse(content={"status": "ok"})
```

---

## Waktu Operasi Update

**All 5 locations updated to "9:00 AM - 7:00 PM setiap hari":**
| File/Location | Method |
|---|---|
| `webhook_listener.py` (static menu) | Direct edit |
| `hermes_ai.py` | Direct edit |
| `hermes_ai_new.py` | Direct edit |
| `sarah_prompt.py` | Direct edit |
| `db_logger.py` (ai_faqs seed + ai_business_info) | Direct edit + SQL update |

---

## Last Day Collect Reminder Test

**2 orders with collect_by = 14 Aug 2026:**
| Tracking | Customer | Phone | Result |
|---|---|---|---|
| SPXMY062541661738 | JEEVA THARSHINI | +60109261497 | ❌ 131026 (not WhatsApp) |
| SPXMY060901777088 | najihahamid | +601169574770 | ❌ 131026 (not WhatsApp) |

**Note:** Template `spx_ready_pickup` accepted by Meta but delivery failed — phones not on WhatsApp. Manual contact needed.

---

## Deployment Method (Current Rule)

**NO Kudu ZIP API.** Use VFS file-by-file:
```bash
# 1. Get ETag for existing file
ETAG=$(curl -sI -H "Authorization: Bearer $TOKEN" "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/file.py" | grep -i etag | sed 's/.*"\(.*\)".*/\1/')

# 2. PUT with If-Match
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: \"$ETAG\"" --data-binary @file.py "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/file.py"

# Dashboard dist: upload assets (JS/CSS/SVG) first, then atomic index.html swap
```
HTTP 204 = success. HTTP 412 = ETag mismatch (read fresh ETag).