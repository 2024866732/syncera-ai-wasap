# Routing Path Mismatch — Silent Analytics Failure

## Symptom
- Bot replies to WhatsApp correctly.
- Dashboard Analytics shows `today_ai_calls=0` and `fallback_rate=100%`.
- "Bot Reply" counter stays at 0 even though messages are sent.

## Root Cause
The string stored in `messages.routing_path` by `_detect_routing()` does not match the literal used in SQL analytics queries.

```python
# webhook_listener.py
def _detect_routing(message: str) -> str:
    ...
    return "ai_query"      # <-- producer
```

```sql
-- db_logger.py
SELECT COUNT(*) FROM messages WHERE routing_path='ai' AND date(timestamp)=?
                              -- ^^^ consumer
```

Because `"ai_query" != "ai"`, the query returns 0 rows every time.

## Diagnostic Recipe

```bash
# 1. Find producer constants
grep -n "return \"ai\|return \"static_menu\|return \"job_status" webhook_listener.py

# 2. Find consumer SQL literals
grep -n "routing_path=" db_logger.py

# 3. Inspect actual stored values
sqlite3 bot_data.db "SELECT routing_path, COUNT(*) FROM messages GROUP BY routing_path;"

# 4. Confirm mismatch
```

## Fix
Make producer and consumer use identical strings:

```python
# Option A: Change SQL to match code
SELECT COUNT(*) FROM messages WHERE routing_path='ai_query' ...

# Option B: Change code to match SQL
return "ai"
```

Option A is usually safer because renaming `routing_path` values in production SQL is harmless, whereas changing code constants may affect other consumers.

## Prevention Rule
Whenever you add a new routing path, add it to BOTH:
1. `_detect_routing()` in `webhook_listener.py`
2. All SQL query filters in `db_logger.py` (`_query_stats`, `_query_recent`, etc.)

Treat routing path values as a shared schema contract between Python and SQL.
