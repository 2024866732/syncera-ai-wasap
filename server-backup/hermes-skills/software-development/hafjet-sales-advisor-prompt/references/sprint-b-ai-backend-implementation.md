# Sprint B — AI Backend Implementation (July 2026)

What was actually built, not the design spec from Reply.la.

## Phase 1: ai_knowledge_items (FTS5 + LIKE fallback)

**Table** (`init_db()`):
```sql
CREATE TABLE IF NOT EXISTS ai_knowledge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    content_type TEXT DEFAULT 'text',
    file_path TEXT,
    content TEXT,                -- full extracted text
    status TEXT DEFAULT 'not_indexed',  -- not_indexed | indexed | failed
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT (datetime('now')),
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
```

**FTS5 virtual table with external content + auto-sync triggers:**
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS ai_knowledge_fts USING fts5(
    name, description, content,
    content=ai_knowledge_items,
    content_rowid=id,
    tokenize='porter unicode61'
);

-- Triggers for auto-sync:
CREATE TRIGGER ai_knowledge_ai AFTER INSERT ...  -- insert into fts
CREATE TRIGGER ai_knowledge_ad AFTER DELETE ...  -- delete from fts
CREATE TRIGGER ai_knowledge_au AFTER UPDATE ...  -- delete old + insert new
```

**Graceful fallback in `search_knowledge_items()`:**
```python
try:
    # FTS5 search
    rows = conn.execute(
        "SELECT ki.id, ki.name, ki.description, substr(ki.content, 1, 300) as excerpt "
        "FROM ai_knowledge_fts fts "
        "JOIN ai_knowledge_items ki ON ki.id = fts.rowid "
        "WHERE ai_knowledge_fts MATCH ? AND ki.enabled=1 ORDER BY rank LIMIT ?",
        (safe_q, limit)
    ).fetchall()
except Exception:
    # FTS5 fallback → LIKE search on name/description/content
    conn.rollback()
    rows = conn.execute(
        "SELECT id, name, description, substr(content, 1, 300) as excerpt "
        "FROM ai_knowledge_items "
        "WHERE enabled=1 AND (name LIKE ? OR description LIKE ? OR content LIKE ?) "
        "ORDER BY updated_at DESC LIMIT ?",
        (like_q, like_q, like_q, limit)
    ).fetchall()
```

**Prompt integration** — Section 7 in `build_full_system_prompt()`:
- Queries FTS5 with fallback keywords ("harga katalog repair ansuran servis phone")
- Falls back to LIKE if FTS5 unavailable
- Returns empty section if no matches → graceful degradation

**API endpoints** (JWT-protected):
- `GET /api/knowledge` (list)
- `POST /api/knowledge` (create)
- `GET /api/knowledge/search?q=...` (FTS5 search)
- `GET /api/knowledge/{id}` (get one)
- `PUT /api/knowledge/{id}` (update)
- `DELETE /api/knowledge/{id}` (delete)

**Seed data** — 4 items: Katalog Harga, Harga Servis, Cara Pesanan, Syarat Ansuran.

---

## Phase 2: customer_memory (ON CONFLICT DO UPDATE)

**Table**:
```sql
CREATE TABLE IF NOT EXISTS customer_memory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone   TEXT NOT NULL,
    field_name       TEXT NOT NULL,
    field_value      TEXT NOT NULL,       -- plain string default, JSON allowed for complex
    confidence       REAL DEFAULT 1.0,
    source_message_id TEXT,
    extracted_at     TIMESTAMP DEFAULT (datetime('now')),
    updated_at       TIMESTAMP DEFAULT (datetime('now')),
    UNIQUE(customer_phone, field_name)
);
```

**UPSERT pattern** (NOT INSERT OR REPLACE):
```python
INSERT INTO customer_memory (...) VALUES (..., datetime('now'))
ON CONFLICT(customer_phone, field_name) DO UPDATE SET
    field_value = excluded.field_value,
    confidence = excluded.confidence,
    source_message_id = excluded.source_message_id,
    updated_at = excluded.updated_at
```

**7 helper functions** (all return safe defaults on failure):
- `upsert_memory(phone, field_name, field_value, confidence=1.0, source="")` → bool
- `get_customer_memory_as_dict(phone)` → `{field: value}` dict
- `get_memory_field(phone, field_name)` → str | None
- `list_memory_fields(phone)` → list of dicts with timestamps/confidence
- `delete_customer_memory(phone)` → bool (clear ALL)
- `delete_memory_field(phone, field_name)` → bool
- `count_memory_fields(phone)` → int

**Prompt integration** — Section 8 in `build_full_system_prompt()`:
- Queries memory by phone if `customer_phone` is in scope
- Empty section if no phone or no memory (graceful fallback)
- Ready for LTM integration (caller passes phone explicitly)

---

## Phase 3: keyword_rules_v2 (multi-step sequence with tracking)

**2 tables**:
```sql
-- Rule definition
CREATE TABLE IF NOT EXISTS keyword_rules_v2 (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    active           INTEGER DEFAULT 1,
    keywords         TEXT NOT NULL,            -- JSON array: ["hello","hi","hey"]
    match_type       TEXT DEFAULT 'contains',  -- exact | contains | starts_with
    sequence         TEXT DEFAULT '[]',        -- JSON: [{"msg":"...","delay":0}, ...]
    next_actions     TEXT DEFAULT '{}',        -- JSON: {"label":"promo","route":"agent"}
    cooldown_seconds INTEGER DEFAULT 0,
    created_at       TIMESTAMP DEFAULT (datetime('now')),
    updated_at       TIMESTAMP DEFAULT (datetime('now'))
);

-- Per-customer step tracker
CREATE TABLE IF NOT EXISTS keyword_sequence_state (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone  TEXT NOT NULL,
    rule_id         INTEGER NOT NULL,
    current_step    INTEGER DEFAULT 0,
    started_at      TIMESTAMP DEFAULT (datetime('now')),
    updated_at      TIMESTAMP DEFAULT (datetime('now')),
    UNIQUE(customer_phone, rule_id)
);
```

**JSON storage pattern**: `keywords`, `sequence`, `next_actions` stored as TEXT (JSON).
- Auto-serialized on create (`json.dumps()`)
- Auto-parsed on read (`json.loads()`)
- `list_keyword_rules_v2()` and `get_keyword_rule_v2()` parse JSON fields automatically

**11 helper functions**:
- CRUD: `create_keyword_v2`, `update_keyword_v2`, `delete_keyword_v2` (soft), `hard_delete_keyword_v2`
- List/get: `list_keyword_rules_v2`, `get_keyword_rule_v2`
- Match: `match_keyword_v2(message)` → `{rule, matched_keyword}` or None (scans JSON keywords array)
- Sequence: `get_or_create_sequence_state`, `advance_sequence`, `reset_sequence`

**Sequence execution flow** (`_check_keyword_rules_v2()`):
```
inbound message →
  match_keyword_v2(msg) → find matching rule
  get_or_create_sequence_state(phone, rule_id) → get current step
  return sequence[current_step].msg
  advance_sequence(phone, rule_id, max_steps) → next step (auto-wrap to 0)
```

**Migration**: Old `keyword_rules` table and `_check_keyword_rules()` UNCHANGED.
v2 rules checked only when old system returns no match.

**API endpoints** (JWT-protected, under `/api/keywords/v2/`):
- `GET /api/keywords/v2` — list (filter `active_only`)
- `POST /api/keywords/v2` — create
- `GET /api/keywords/v2/{id}` — get single
- `PUT /api/keywords/v2/{id}` — update
- `DELETE /api/keywords/v2/{id}` — soft delete
- `POST /api/keywords/v2/test` — test match

---

## Key patterns used across all 3 phases

| Pattern | Where used |
|---------|-----------|
| `ON CONFLICT DO UPDATE` (not INSERT OR REPLACE) | customer_memory upsert |
| JSON array/object in SQLite TEXT column | keyword_rules_v2.keywords/sequence/next_actions |
| Auto-parse JSON on read | `list_keyword_rules_v2`, `get_keyword_rule_v2` |
| FTS5 external content table + auto-sync triggers | ai_knowledge_fts |
| Graceful fallback chain (FTS5 → LIKE → empty) | `search_knowledge_items`, `build_full_system_prompt` Section 7 |
| Per-customer state tracking | keyword_sequence_state |
| Safe defaults on all functions | All return `[]`, `{}`, `0`, `False`, `None` on error |
| run_in_executor for sync→async bridge | All API endpoints |
| try/except with log.warning on every function | All DB functions |
