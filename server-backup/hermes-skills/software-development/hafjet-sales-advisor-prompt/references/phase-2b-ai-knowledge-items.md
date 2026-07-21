# Phase 2B — ai_knowledge_items (FTS5 RAG, Jul 2026)

Implemented as Sprint B Fasa 1 after v2.2.0 analytics dashboard release.

## Schema

```sql
CREATE TABLE ai_knowledge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    content_type TEXT DEFAULT 'text',    -- text/pdf/url
    file_path TEXT,                       -- path to uploaded file (future)
    content TEXT,                         -- full extracted text for FTS5
    status TEXT DEFAULT 'not_indexed',   -- not_indexed / indexed / failed
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT (datetime('now')),
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
```

## FTS5 Virtual Table

```sql
CREATE VIRTUAL TABLE ai_knowledge_fts USING fts5(
    name, description, content,
    content=ai_knowledge_items,   -- external content table
    content_rowid=id,
    tokenize='porter unicode61'
);
```

### Sync Triggers
- `ai_knowledge_ai` — AFTER INSERT → insert into FTS5
- `ai_knowledge_ad` — AFTER DELETE → delete from FTS5 ('delete' command)
- `ai_knowledge_au` — AFTER UPDATE → delete old + insert new

### FTS5 Graceful Fallback
FTS5 creation is wrapped in try/except in `init_db()`. If the Python build lacks FTS5 support, a `LIKE` query on `name`, `description`, and `content` columns is used instead.

## Database Layer (`db_logger.py`)

### 7 CRUD Functions

| Function | Purpose |
|----------|---------|
| `add_knowledge_item(name, desc, content_type, content, file_path, status)` | INSERT → returns id or 0 |
| `get_knowledge_item(item_id)` | SELECT by id → dict or None |
| `list_knowledge_items(enabled_only)` | SELECT all (or enabled only), ordered by updated_at DESC |
| `update_knowledge_item(id, **kwargs)` | UPDATE allowed fields (name, desc, content_type, content, file_path, status, enabled) → bool |
| `delete_knowledge_item(id)` | DELETE by id → bool |
| `search_knowledge_items(query, limit)` | FTS5 MATCH → JOIN ai_knowledge_items → sorted by rank; fallback to LIKE if FTS5 fails |
| `build_full_system_prompt()` | Section 7 added: top-3 FTS5 matches injected as "AI KNOWLEDGE" section |

### Prompt Builder Integration
`build_full_system_prompt()` now has **7 sections**:
```
1. Business Info
2. Language & Style
3. Closing Flow
4. FAQs
5. Constraints
6. Custom Instruction
7. AI Knowledge (FTS5 retrieval → top-3 chunks, 300 chars each)
```

The knowledge section queries FTS5 with broad terms: `"harga katalog repair ansuran servis phone"`.
If FTS5 query fails, falls back to LIKE on `enabled=1 AND status='indexed'` items.
If both fail, section is omitted entirely (graceful degradation — prompt still compiles from sections 1–6).

## API Layer (`webhook_listener.py`)

6 JWT-protected endpoints:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/knowledge` | GET | `Depends(get_current_staff)` | List (optional `?enabled_only=true`) |
| `/api/knowledge` | POST | `Depends(get_current_staff)` | Create `{name, description, content_type, content, file_path}` |
| `/api/knowledge/search?q=...&limit=5` | GET | `Depends(get_current_staff)` | FTS5 search (LIKE fallback) |
| `/api/knowledge/{id}` | GET | `Depends(get_current_staff)` | Get single item |
| `/api/knowledge/{id}` | PUT | `Depends(get_current_staff)` | Partial update (sends `**data` via lambda to executor) |
| `/api/knowledge/{id}` | DELETE | `Depends(get_current_staff)` | Delete |

All endpoints use `loop.run_in_executor(None, ...)` pattern for sync DB calls.

## Seed Data (4 items)

Run once on first `init_db()` if table is empty:

1. **Katalog Harga Phone (Cash & Ansuran)** — Google Drive link, brand list, payment options
2. **Harga Servis Repair (LCD, Bateri & Lain)** — bit.ly price list link, service types, brands
3. **Cara Pesanan & Penghantaran** — Walk-in/online/COD/postage + payment methods
4. **Syarat Kelayakan Ansuran** — AEON/SPayLater/Boost/RedONE + document requirements

## Pre-commit Rules (this session)

- Show full diff before commit
- `python3 -m py_compile` both modified files before accepting
- No frontend changes unless explicitly required by API
- No deploy without Tuan's explicit approval
- Commit message format: `sprint(v2.2.1): ai-knowledge-items FTS5 RAG` (or similar)

## Pitfalls

- `run_in_executor` does NOT support `**kwargs` expansion. Use `lambda: func(id, **data)` wrapper when passing dict fields.
- FTS5 MATCH query requires sanitized input — non-alphanumeric characters stripped via `re.sub(r'[^\w\s]', ' ', query)` to prevent FTS5 syntax errors.
- `conn.rollback()` is called in the LIKE fallback path after a failed FTS5 query to reset the connection state.
- Seed data uses 5-tuple unpacking `(name, desc, ctype, content, status)` — changing the seed tuple shape requires updating the INSERT statement and the unpack pattern.
- If `init_db()` runs before the ai_knowledge_items table patch is applied, the seed won't fire (table already exists, COUNT > 0). To backfill: run a manual INSERT in a one-off script.
- FTS5 external content tables need triggers to stay in sync — if you INSERT/UPDATE/DELETE outside the trigger (e.g., via raw SQL during migration), you must manually rebuild the FTS index: `INSERT INTO ai_knowledge_fts(ai_knowledge_fts) VALUES('rebuild')`.

## Future Upgrade Path

- **Hybrid RAG**: When ready, add `sentence-transformers/all-MiniLM-L6-v2` + FAISS on the Ubuntu PC Office (16GB RAM) as a microservice. Azure app POSTs queries to `<Ubuntu_IP>:8100/retrieve`. Current `ai_knowledge_items` schema already has `faiss_id` slot ready.
- **File upload**: Content-type `pdf` and `url` paths exist in schema but no file-handling endpoint yet. Add `POST /api/knowledge/upload` with pymupdf extraction.
