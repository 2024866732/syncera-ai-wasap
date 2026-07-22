# Phase 2B — Customer Memory (Sprint B Phase 2)

**Implemented:** 2026-07-21 | **Status:** Committed (`release/v2.2.0`)

## Schema

```sql
CREATE TABLE customer_memory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone   TEXT NOT NULL,
    field_name       TEXT NOT NULL,       -- e.g. preferred_brand, budget_range, last_device
    field_value      TEXT NOT NULL,       -- plain string (primary); JSON allowed for complex data only
    confidence       REAL DEFAULT 1.0,     -- 0.0–1.0 for multi-source weighting
    source_message_id TEXT,               -- trace from which message this was extracted
    extracted_at     TIMESTAMP DEFAULT (datetime('now')),
    updated_at       TIMESTAMP DEFAULT (datetime('now')),
    UNIQUE(customer_phone, field_name)
);
```

## Helper Functions (all in `db_logger.py`)

| Function | Signature | Tested |
|----------|-----------|--------|
| `upsert_memory` | `(phone, field_name, field_value, confidence=1.0, source="") → bool` | ✅ SQLite `ON CONFLICT ... DO UPDATE` |
| `get_customer_memory_as_dict` | `(phone) → dict` | ✅ `{field_name: field_value}` |
| `get_memory_field` | `(phone, field_name) → str | None` | ✅ Single field retrieval |
| `list_memory_fields` | `(phone) → list[dict]` | ✅ Full rows with timestamps |
| `delete_customer_memory` | `(phone) → bool` | ✅ Clear all |
| `delete_memory_field` | `(phone, field_name) → bool` | ✅ Single field removal |
| `count_memory_fields` | `(phone) → int` | ✅ Count check |

## Test Results (2026-07-21)

```
Upsert 3 fields → True
get_customer_memory_as_dict → {budget_range, last_device, preferred_brand}
get_memory_field(budget_range) → "RM500-RM1000"
list_memory_fields → 3 rows with confidence + timestamp metadata
delete_memory_field → 2 remaining
delete_customer_memory → 0 after clear
```

## Prompt Integration

- **Section 8 (Customer Memory)** added in `build_full_system_prompt()` after Section 7 (AI Knowledge)
- Section is **empty by default** — only populates when `customer_phone` variable is in scope
- Format: `═══ CUSTOMER MEMORY ═══\n• field_name: field_value`
- Limit: top 10 most recent fields per `updated_at DESC`
- Graceful fallback: empty string if no phone context, no memory rows, or DB error

## Future Integration (next step)

The `build_full_system_prompt()` needs to accept `customer_phone` as a parameter so the chat flow can inject it at runtime. Current signature is `() -> str`; proposed upgrade:

```python
def build_full_system_prompt(customer_phone: str = "") -> str:
```

Then in `hermes_ai.py`, call `build_full_system_prompt(sender_number)` to activate Section 8.

## Design Decisions

1. **Plain string storage by default** — `field_value` is TEXT. JSON strings allowed only for complex multi-field data, not as primary pattern.
2. **ON CONFLICT upsert** — single atomic SQL statement, no read-then-write race.
3. **No API endpoints yet** — Sprint B Phase 1 (ai_knowledge_items) got the CRUD API. customer_memory API endpoints are deferred to avoid churn until the integration point in `hermes_ai.py` is stable.
4. **Section 8 inactive until phone injection** — avoids leaking another customer's memory during prompt compilation.

## Related Skills

- `hafjet-sales-advisor-prompt` — umbrella skill for prompt builder, AI Knowledge, and AI Memory
- See `references/phase-2b-ai-knowledge-items.md` for the companion FTS5 knowledge store
