# Dashboard API Field Mapping

## The Problem: DB Columns vs Frontend Expectations

The `/api/messages/{phone}` endpoint returns raw SQLite `Row` dicts from `SELECT * FROM messages`.
The `messages` table has `content` (TEXT) but the React frontend reads `message.message`.
The table has `direction` (inbound/outbound) but StatusBadge reads `message.source`.

**Result:** All chat bubbles show "SYSTEM" label with blank text.

## Affected Endpoints

| Endpoint | Backend Function | Raw DB Columns | Frontend Expects |
|----------|-----------------|---------------|------------------|
| GET /api/messages/{phone} | get_customer_messages | id, customer_phone, direction, content, msg_type, routing_path, latency_ms, fallback_used, timestamp, wamid | message, source, direction |
| GET /api/messages | get_recent_messages | Same as above | Same as above |
| WS /ws (history batch) | get_recent_messages | Same as above | Same as above |

## Discovery Query

```sql
SELECT id, direction, content, routing_path FROM messages ORDER BY id DESC LIMIT 5;
```

## Fix: Response Transformation Layer

Add after the DB query in `webhook_listener.py`:

```python
@app.get("/api/messages/{phone}")
async def api_customer_messages(phone: str, limit: int = 50):
    rows = await get_customer_messages(phone, limit)
    for row in rows:
        row["message"] = row.get("content", "")     # alias, keep original content
        row["source"] = row.get("direction", "unknown")  # alias, keep original direction
    return rows
```

Also fix the `/api/messages` GET endpoint and WS history broadcast with the same transform.

## Related Analytics Mismatch

The `_query_stats()` function filters `routing_path='ai'` but `_detect_routing()` returns `"ai_query"`.
This causes `today_ai_calls = 0` and `today_fallback_rate = 100%` regardless of actual AI activity.

See `references/routing-path-mismatch.md` for the detailed diagnosis.

## See Also

- `SKILL.md` pitfalls 17ai (field name mismatch) and 17aa (routing_path mismatch)
- `references/routing-path-mismatch.md`
