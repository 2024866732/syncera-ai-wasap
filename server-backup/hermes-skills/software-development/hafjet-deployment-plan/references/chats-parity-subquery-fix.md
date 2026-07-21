# Chats Parity — last_message Subquery Fix (Jul 2026)

## Problem
Chats sidebar shows "Tiada mesej" even though messages exist. Frontend `Sidebar.jsx:164`
renders `{customer.last_message || 'Tiada mesej'}` — the field reference is correct, but
the backend query (`_query_customers()` in `db_logger.py:413`) does `SELECT * FROM customers`
which returns NO `last_message` or `last_timestamp` column (they don't exist in the schema).

## Root cause
Not an auth bug (threads load fine). Not a schema migration needed. The `customers` table
has `last_contact` (timestamp) and `total_messages` (count) but NO preview text field.
The `messages` table has `content`, `timestamp`, `customer_phone`, `direction`.

## Fix — correlated subquery (no schema change, no migration)
Add two correlated subqueries to `_query_customers()` and `get_inbox_conversations()`:

```sql
SELECT c.*,
       (SELECT content FROM messages WHERE customer_phone = c.phone
        ORDER BY timestamp DESC LIMIT 1) AS last_message,
       (SELECT timestamp FROM messages WHERE customer_phone = c.phone
        ORDER BY timestamp DESC LIMIT 1) AS last_timestamp
FROM customers c
ORDER BY c.last_contact DESC
```

- `SELECT *` → `SELECT c.* + 2 subqueries` (backwards-compatible, no columns removed)
- Index `idx_messages_customer ON messages(customer_phone)` already exists → subquery is efficient
- No DB migration, no ALTER TABLE, no new column — pure query change

## Files changed (minimal — backend only)
| File | Function | Change |
|------|----------|--------|
| `db_logger.py` | `_query_customers()` (line 413) | `SELECT *` → `SELECT c.* + 2 subqueries` |
| `db_logger.py` | `get_inbox_conversations()` query (line 1859) | Add 2 subquery columns to SELECT |
| `db_logger.py` | `get_inbox_conversations()` keys (line 1879) | Add `"last_message", "last_timestamp"` to keys array |

**Frontend: ZERO changes.** Sidebar.jsx already references `customer.last_message` and
`customer.last_timestamp` correctly. When the API returns these fields, it auto-works.

## Inbox also benefits
`get_inbox_conversations()` gets the same subqueries → Inbox conversations now also show
last message preview (bonus, not breaking — Inbox previously had `total_messages` but no preview).

## Verification
```bash
# After deploy, login + fetch customers:
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"hafizi@hafjet.com","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/customers" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print([c.get('last_message','?')[:30] for c in d[:3]])"
# Expect: actual message previews, not empty
```

## What this enables for Reply.la parity
| Feature | Status after fix |
|---------|-----------------|
| Last message preview per contact | ✅ Done |
| Last message timestamp | ✅ Done |
| Total messages per contact | ✅ Already existed |
| Unread indicator | ⏳ Future (needs `is_read` column) |
