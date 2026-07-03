# Dashboard Feature Development Workflow (Sprint Pattern)

## Pattern: DB → Backend → Frontend → Build → Deploy

Every new dashboard feature follows this exact order. Do not skip steps or reorder.

```
1. DB schema        → db_logger.py (init_db + new table / migration)
2. DB functions     → db_logger.py (sync helpers: create_X, get_X, update_X)
3. Import in main   → webhook_listener.py (add imports from db_logger)
4. API endpoints    → webhook_listener.py (async def with loop.run_in_executor)
5. API helpers      → dashboard/src/api/api.js (fetch/export functions with X-API-Key)
6. Page component   → dashboard/src/components/<Name>.jsx
7. Wire into layout → Layout.jsx (import + NAV_ITEMS + render branch)
7b. **Add SPA catch-all route** → webhook_listener.py (if the new page is a standalone route, not a /dashboard subpath):
    ```python
    # Must be LAST route, AFTER all /api/* routes
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(full_path: str):
        # Guard: do NOT intercept API routes
        if full_path.startswith("api/") or full_path.startswith("dashboard") or full_path == "":
            raise HTTPException(status_code=404)
        index_file = os.path.join(DASHBOARD_PATH, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse({"error": "Dashboard not built"})
    ```
    **Why:** React SPA routes like /contacts, /blast, /analytics must resolve to index.html for client-side routing. Without this, direct navigation to or refresh on these paths returns 404.
    **Guard detail:** `startswith("api/")` prevents catching API routes (they 404 naturally). `startswith("dashboard")` lets the explicit `/dashboard` route handle dashboard access.
    **Pitfall:** Route ORDER matters in FastAPI — `/{full_path:path}` must be registered LAST, after ALL /api/* routes, or it swallows them. Always place it at the file bottom just above `if __name__ == "__main__":`.

8. Build bundle     → npm run build (verify modules count increments)
9. Build ZIP        → python3 build_zip.py
10. Deploy          → az webapp deploy --type zip --timeout 300
11. Verify          → health check + test new API endpoint(s)
```

## Current Nav Sidebar Items (Reply.la style)

Layout.jsx defines NAV_ITEMS in order. Add new items between existing ones where they logically fit:

```
[💬] Chats       → Sidebar + ChatView + CustomerInfo (3-panel)
[👥] Contacts    → Contacts.jsx (search, filter, detail, CSV import/export)
[📊] Analytics   → Analytics.jsx (stats + charts)
[📢] Blast       → Blast.jsx (compose, preview, schedule, history)
[⚙️] Settings    → Settings.jsx
```

## UI Constants (Reply.la dark theme)

```jsx
// Backgrounds
bg-[#0f1117]      // page background
bg-[#1a1d27]      // card/surface background
bg-gray-800       // elevated surface / input
bg-gray-700       // hover / border

// Accent
text-[#00d563]    // primary green accent
bg-[#00d563]      // button/indicator
bg-[#00d563]/10   // active nav item background
// Secondary accent: text-blue-400 / bg-blue-600

// Sidebar nav
// Collapsed: 56px, expands to 180px on hover
// Icon-only → show label on hover (opacity transition)
// Nav items: rounded-lg px-2.5 py-2.5, active=bg-[#00d563]/10 text-[#00d563]
```

## Feature Implementation Notes

### Feature: Blast/Broadcast

**Backend:**
- `blast_logs` table: id, message, recipients, total_recipients, sent_count, failed_count, status (pending/sending/sent/failed), schedule_at, created_at, sent_at
- `POST /api/blast` — accepts `{ message, recipients: "all" | [phones], schedule_at }`, returns blast_id
- `_process_blast()` — background asyncio task with 2s rate limit per message, sends via WhatsApp Graph API
- `GET /api/blast/history` — list of all blasts, most recent first
- When no WhatsApp token configured, logs messages without sending (useful for testing)

**Frontend:**
- Compose textarea with 4096 char limit + counter
- Preview panel showing message as chat bubble
- Recipient mode: "Semua contacts" (radio) / "Pilih manually" (disabled — coming soon)
- Schedule: "Hantar sekarang" / datetime-local picker
- Confirm dialog with message preview before sending
- History table: Tarikh, Message, Recipients, Sent, Failed, Status (colored badges)

### Feature: Contacts/Pelanggan

**Backend:**
- `tags` column on customers table (comma-separated, migration via ALTER TABLE ADD COLUMN)
- Auto-tagging: `_compute_auto_tags()` — "Baru" (<7d), "Ulangan" (>1 msg), "Escalated" (has escalated_at)
- `GET /api/contacts?tag=...&search=...&page=1&limit=20` — paginated with filter
- `PATCH /api/contacts/{phone}` — update name, tags, note
- `POST /api/contacts/export` — CSV download
- `POST /api/contacts/import` — CSV upload/import, returns { imported, updated, errors }

**Frontend:**
- Left panel (340px): search bar + filter tab row + scrollable contact cards
- Each card shows: avatar, name, phone, time ago, tag badges, message count
- Right panel: inline editing of name, tags (comma-separated), notes, save button
- Conversation history below the edit fields (pulled from `/api/messages/{phone}`)
- Export CSV button → triggers browser download
- Import CSV via file upload or paste in dialog

## Sprint Order Rule

When the user provides a spec with explicit sprint ordering (Sprint 1 → 2 → 3) and says "Buat ikut urutan. Jangan skip step.", implement in the EXACT order given. Deploy each sprint for verification before proceeding to the next. This is a hard rule — do not skip ahead even if a later feature seems simpler.
