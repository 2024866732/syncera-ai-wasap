# Frontend-Backend Field Name Mapping Diagnostic

## When to Use

The frontend dashboard shows unexpected labels, blank text, or missing data while the API returns complete responses.

**Symptoms:**
- All chat bubbles show "SYSTEM" label regardless of message direction
- Message text renders blank even though content exists in DB
- Counters show 0 despite activity (e.g., "AI/Bot Reply = 0" when bot has 22 replies)
- Loading spinner never stops (fetch never resolves or resolves with unexpected data)

## Root Cause Pattern

The API endpoint returns raw DB column names, but the React component expects different property names.

**Most common mismatches (WhatsApp Bot dashboard):**

| DB Column | API Returns | React Expects | Result |
|-----------|-------------|---------------|--------|
| `content` | `content` | `message.message` | Text renders blank |
| `direction` | `direction` | `message.source` | StatusBadge shows "SYSTEM" (fallback when `source` is undefined) |
| `routing_path` (value = `"ai_query"`) | `routing_path: "ai_query"` | SQL query filters `WHERE routing_path='ai'` | `today_ai_calls = 0`, `fallback_rate = 100%` |

## Diagnostic Steps

### Step 1: Check DB evidence
```sql
SELECT id, direction, content, routing_path FROM messages ORDER BY id DESC LIMIT 5;
```
Confirm data exists with actual content. If content is there, the bug is in the API-to-frontend pipeline, not the DB.

### Step 2: Check API response fields
```bash
curl -s http://localhost:8080/api/messages/{phone} | python3 -m json.tool | head -20
```
Compare the returned JSON keys against what the React component reads.

### Step 3: Check React component expectations
```bash
grep -n 'message\.' dashboard/src/components/MessageBubble.jsx
# Looks for: message.message, message.source, message.timestamp, etc.
```

### Step 4: Check StatusBadge fallback
```javascript
// dashboard/src/components/StatusBadge.jsx
const label = source?.toUpperCase() || 'SYSTEM';
// If 'source' is never set by API, ALL messages show 'SYSTEM'
```

### Step 5: Check SQL query filter strings vs routing values
```bash
grep -n "routing_path" db_logger.py webhook_listener.py
```
Compare the exact string produced by `_detect_routing()` with the string used in `WHERE routing_path='...'`. If they differ, counters silently return zero.

## Fix

### Option A: Transform API response (preferred — no frontend rebuild)
```python
# In each endpoint that returns messages, add a transform layer:
for row in rows:
    row["message"] = row.pop("content", "")
    row["source"] = "bot" if row.get("direction") == "outbound" else "user"
```

### Option B: Align SQL filter strings with downstream consumers
```python
# Option B1: Change _detect_routing to match SQL
def _detect_routing(message: str) -> str:
    ...
    return "ai_query"  # Must match SQL: WHERE routing_path='ai_query'

# Option B2: Change SQL to match _detect_routing output
def _query_stats(date_str):
    ...
    today_ai_calls = "SELECT COUNT(*) FROM messages WHERE routing_path='ai_query' AND ..."
```

## Prevention

When adding new API endpoints or React components:
1. Define a shared field name contract (documentation or TypeScript types)
2. Use response transformation to add aliases rather than changing DB column names
3. Hardcode filter strings as constants referenced by both producer and consumer code
4. **Verify built JS before deploy** — check that `X-API-Key` header has the real key value, not `***` or empty:
   ```bash
   grep -oP 'X-API-Key[^,;)]*' dist/assets/index*.js | head -5
   ```
5. **Beware shell env pollution during Vite build** — if `VITE_API_KEY` exists in the shell environment, it silently overrides `.env.production` during `vite build`. Always rebuild in a clean env or explicitly unset the var:
   ```bash
   VITE_API_KEY="" npx vite build --mode production
   ```
6. **API functions should validate business-logic success** — even if HTTP 200, check response fields (`result.sent`) and throw on falsy values. Let the calling component's catch handler display the error:
   ```javascript
   const result = await res.json();
   if (!result.sent) throw new Error('API rejected the message');
   return result;
   ```
   This ensures the UI shows a red error toast instead of a misleading "success" indicator.
