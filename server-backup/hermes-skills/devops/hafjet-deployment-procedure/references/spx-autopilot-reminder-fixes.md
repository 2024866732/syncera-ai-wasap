# SPX Autopilot v5.0 & Reminder Flow Fixes (2026-08-08 to 2026-08-17)

## Overview
This reference documents the complete SPX Self-Collection reminder system fixes across multiple sessions, including the Fire-and-Forget autopilot, phone scraping, reminder delivery, and customer pickup flow.

---

## 1. SPX Autopilot v5.0 — Fire-and-Forget

### Architecture
- **Userscript**: `spx_autopilot_v5_fire_and_forget.user.js` (1,274 lines)
- **Config**: `ENABLED: true`, `INTERVAL_MINUTES: 15`, `STATUS_FILTER: ''` (all statuses)
- **Backend endpoint**: `POST https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/bulk-map-phones`
- **Auth**: `X-API-Key` (DASHBOARD_API_KEY) — middleware validates, no JWT required

### Key Features
- Auto-scrape on page load
- Auto-push to backend via `POST /api/spx/bulk-map-phones`
- Dedupe ON (local `window.__spx_poc_results` cache)
- Toggle commands: `__spx_on()`, `__spx_off()`, `__spx_state()`

### Cycle #16 Results
```
Scanned: 10, Clear: 10, Masked: 0, Revealed: 0, Push: updated=0 skipped=10
```
**Issue**: Dedupe skipped push because tracking existed in local cache, but DB had NULL phones. Required manual DB update.

### Cycle #2 Results (Post-fix)
```
Scanned: 10, Clear: 1, Masked: 9, Revealed: 9, Push: updated=10 skipped=0 errors=0
```

### Phone Scraping Success
- **10/10 real phones confirmed** from SPX portal (not dummy/sequential)
- HEX decode confirmed SPX API returns dummy sequential placeholders
- Browser agent (Tampermonkey) is the ONLY reliable source for real phones

---

## 2. Reminder Delivery Fixes

### Root Cause of 0 Delivery (Pre-fix)
1. `is_paused=1` on eligible orders excluded from cron
2. Phone numbers from SPX API were dummy/sequential (not real)
3. `reminder_status` column name bug → should be `hafjet_reminder_state`
4. Missing `_SPX_TEMPLATES` keys (`remind1`-`remind4`)
5. `collection_failed` mapped to inactive template `spx_ready_collection3` → fixed to `spx_ready_pickup`

### Fixes Applied
| Bug | Fix |
|-----|-----|
| `reminder_status` column | → `hafjet_reminder_state` in `_check_spx_reminders()` |
| Missing template keys | Added `remind1`-`remind4` to `_SPX_TEMPLATES` |
| `collection_failed` template | → `spx_ready_pickup` (active in Meta) |
| Default toggle | `spx_reminders_enabled: false` (safe deploy) |

### Template Parameters Fix
```python
# WRONG (single param with full text)
template_params=[text]

# CORRECT (2 params: name + tracking)
template_params=[
    str(order.get("recipient_name", "Customer")),
    str(order.get("spx_tracking_number", "?"))
]
```

### Delivery Verification
- **Manual test**: `spx_ready_pickup` → HTTP 200, accepted, wamid returned ✅
- **Cron cycle**: 4/5 ReadyForCollection delivered, 2 read by customer ✅
- **Error 131047**: 0 new occurrences after fix ✅

---

## 3. Dashboard 401 Fix (Dual Auth Bug)

### Problem
Frontend `getAuthHeaders()` sent EITHER `X-API-Key` OR `Authorization: Bearer` — never both.
Backend had DUAL auth:
- Middleware: checks `X-API-Key` for `/api/customers/*` POST
- Endpoint: `Depends(get_current_staff)` checks JWT

### Fix (`dashboard/src/api/api.js`)
```javascript
function getAuthHeaders() {
  const token = localStorage.getItem('staff_token');
  const headers = { 'Content-Type': 'application/json' };
  // ALWAYS send BOTH so either auth path works
  headers['X-API-Key'] = import.meta.env.VITE_API_KEY || '';
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
```

---

## 4. Duplicate Reply Fix

### Root Causes
1. **Gunicorn `-w 2`**: Two workers with separate in-memory `_processed_messages` dedup cache. Meta webhook retry hit different worker → dedup miss.
2. **AI 75s timeout**: `await _process_message()` blocked webhook handler. Meta webhook timeout ~10-20s → Meta retried → 2-3 duplicate deliveries.

### Fixes
| Fix | File | Change |
|-----|------|--------|
| Single worker | `start.sh` | `-w 2` → `-w 1` |
| Background webhook | `webhook_listener.py` | Return 200 immediately + `asyncio.create_task(_process_webhook_payload(data))` |

### Flow Comparison
**Before**:
```
Webhook → Worker A → AI 75s → fallback → outbound 1
       → Meta retry → Worker B → dedup miss → AI success → outbound 2
       → Meta retry → Worker A → duplicate → outbound 3
```

**After**:
```
Webhook → return 200 immediately → background task → 1 reply only
```

---

## 5. Operating Hours Fix

**Updated 5 files** to "9:00 AM - 7:00 PM daily":
- `webhook_listener.py` (static menu + SARAH)
- `hermes_ai.py` (business info)
- `hermes_ai_new.py` (business info)
- `sarah_prompt.py` (SARAH system prompt)
- `db_logger.py` (catalog seed + AI FAQ)

---

## 6. Collected Orders Still Getting Reminders

### Problem
3,670 Collected orders had `hafjet_reminder_state` = `remind1`/`Pending` (not `Completed`).

### Root Causes
1. `get_spx_due_orders()` didn't filter by `spx_status`
2. `upsert_spx_order()` didn't auto-set `Completed` when `spx_status` became terminal

### Fixes
**db_logger.py — `get_spx_due_orders()`**:
```sql
AND spx_status NOT IN ('Collected', 'Returned', 'Cancelled', 'Collection Failed')
```

**db_logger.py — `upsert_spx_order()` auto-complete**:
```python
_TERMINAL = {"Collected", "Returned", "Cancelled", "Collection Failed"}
if new_status in _TERMINAL and reminder_state not in ("Completed", "CollectionFailed"):
    reminder_state = "Completed"
```

**Bulk fix**: 3,670 orders → `Completed` in single UPDATE.

---

## 7. "Saya di Sini" Kiosk Pickup Reply

### Detection Logic
Added `_check_spx_pickup_context()` in `webhook_listener.py`, called FIRST in `_static_menu_handler()`.

**Trigger phrases**: "saya di sini", "saya sampai", "dah sampai", "sudah sampai", "saya tiba", "tiba dah", "dah tiba", "saya dah tiba"

**SPX Context Check**: Customer has `ReadyForCollection` order with reminder sent in last 24h.

### Reply Template
```
✅ Welcome! Dah sampai ke?
Untuk ambil parcel, sila ikut langkah ni:
1️⃣ Pergi ke kiosk layan diri
2️⃣ Masukkan 6-digit PIN Shopee (dari WhatsApp/Shopee)
3️⃣ Cari bungkusan di rak (ikut huruf nama)
4️⃣ Imbas barcode/QR pada bungkusan
Sistem akan sahkan automatik — terus boleh bawa balik 😊
Tracking: *SPXMYxxxxxxxxx*  # if known
Ada masalah di kiosk? Boleh reply sini atau jumpa staff kaunter.
```

---

## 8. Deployment Method — VFS File-by-File (No Kudu ZIP)

### Dashboard Deploy Rule
**Tuan Hafizi explicit rule**: NO Kudu ZIP API. Use VFS file-by-file to `/site/wwwroot/dashboard/dist/`. Atomic `index.html` swap only.

### Procedure
```bash
# 1. Upload assets (JS, CSS, SVG) — can be 204 or 412
# 2. Read ETag for existing files
ETAG=$(curl -sI -H "Authorization: Bearer $TOKEN" "URL" | grep -i etag | sed 's/.*"\(.*\)".*/\1/')
# 3. PUT with If-Match
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: \"$ETAG\"" --data-binary @file "URL"
# 4. index.html LAST (atomic switch)
```

---

## 9. Key Commands Reference

```bash
# Health check
curl -fsS "https://hafjet-whatsapp-bot.azurewebsites.net/health"

# Deploy backend file (VFS with ETag)
TOKEN=$(az account get-access-token --resource "https://management.azure.com" --query "accessToken" -o tsv | tr -d '\n')
ETAG=$(curl -sI -H "Authorization: Bearer $TOKEN" "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/file.py" | grep -i etag | sed 's/.*"\(.*\)".*/\1/')
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: \"$ETAG\"" --data-binary @file.py "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/file.py"

# Restart cleanly
az webapp stop -g hafjet-bot-rg -n hafjet-whatsapp-bot
sleep 5
az webapp start -g hafjet-bot-rg -n hafjet-whatsapp-bot
sleep 120
curl -fsS "https://APP.azurewebsites.net/health"

# DB inspection (read-only)
python3 -c "
import sqlite3
conn = sqlite3.connect('file:/home/data/bot_data.db?mode=ro', uri=True)
rows = conn.execute('SELECT ...').fetchall()
for r in rows: print(r)
conn.close()
"
```

---

## 10. Related Files
- `webhook_listener.py` — main FastAPI app, SPX reminder cron, pickup handler
- `db_logger.py` — SQLite CRUD, `get_spx_due_orders`, `upsert_spx_order`, `bulk_map_phones`
- `spx_followup.py` — `determine_followup`, `_is_terminal`, template mapping
- `spx_autopilot_v5_fire_and_forget.user.js` — Tampermonkey autopilot
- `dashboard/src/api/api.js` — frontend auth headers fix
- `start.sh` — gunicorn `-w 1`