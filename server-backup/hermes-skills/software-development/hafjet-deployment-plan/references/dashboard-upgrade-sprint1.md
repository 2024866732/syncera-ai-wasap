# Dashboard Upgrade — Sprint 1 (Reply.la-style)

## UI/UX Standards

| Property | Value |
|----------|-------|
| Background | `#0f1117` |
| Card bg | `#1a1d27` |
| Primary accent | `#00d563` (green) |
| Secondary accent | `#3b82f6` (blue) |
| Sidebar | Icon-only collapsed (56px), expand on hover (180px) |
| Font | Inter, system-ui sans-serif |

## Sidebar Nav Pattern

The icon nav sidebar replaces the old top tab bar. Structure:

```
<nav>              <!-- Fixed left, bg #1a1d27, border-r -->
  Logo (H)         <!-- 36px, bg #00d563 -->
  Nav items        <!-- Icon + label, expand on hover -->
    - Chats        <!-- Message bubble icon -->
    - Analytics    <!-- Bar chart icon -->
    - Blast        <!-- Megaphone icon -->
    - Settings     <!-- Gear icon -->
  Status footer    <!-- WS live dot + today count -->
</nav>
```

Implementation pattern (React + Tailwind):
```jsx
const [navExpanded, setNavExpanded] = useState(false);

<nav
  style={{ width: navExpanded ? '180px' : '56px' }}
  onMouseEnter={() => setNavExpanded(true)}
  onMouseLeave={() => setNavExpanded(false)}
  className="bg-[#1a1d27] border-r border-gray-800 flex flex-col items-center py-3 transition-all duration-200"
>
  {NAV_ITEMS.map(item => (
    <button className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg ${
      active === item.id ? 'bg-[#00d563]/10 text-[#00d563]' : 'text-gray-400'
    }`}>
      {item.icon(active === item.id)}
      <span className={`text-xs font-medium ${navExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
        {item.label}
      </span>
    </button>
  ))}
</nav>
```

## Adding New Pages

### Pattern (same as existing tab system):
1. Create `dashboard/src/components/<PageName>.jsx` — standalone component
2. Add `fetch<PageName>()` / helper functions to `api.js`
3. Import in `Layout.jsx`, add nav item to `NAV_ITEMS`, add route to the switch block

### Auth header pattern for all POST endpoints:
```js
headers: { 'Content-Type': 'application/json', 'X-API-Key': import.meta.env.VITE_API_KEY || '' }
```
Must be present on every fetch to a protected endpoint (under `/api/customers/`, `/api/settings`, `/api/blast`, etc.)

## Feature 1: Blast / Broadcast

### Backend (webhook_listener.py)

**POST /api/blast**
- Body: `{ message, recipients: "all" | [phone list], schedule_at: null | ISO datetime }`
- Fetches all customer phones via `get_all_customer_phones()` if recipients="all"
- Creates blast record in DB with `blast_id = create_blast(...)`
- If no schedule_at: spawns `asyncio.create_task(_process_blast(blast_id, message, phones))`
- Returns `{ blast_id, total_recipients, scheduled }`

**Background sender (_process_blast)**
- Uses `asyncio.get_event_loop().run_in_executor(None, ...)` for DB writes
- Sends via Meta Graph API (same pattern as webhook reply) with `httpx.AsyncClient`
- Rate limit: `await asyncio.sleep(2)` between each message
- Tracks sent/failed counts
- Updates blast status to "sent" or "failed" on completion
- Logs each blast message as outbound message via `log_outbound()`

### Backend (db_logger.py)

**New table: blast_logs**
```sql
CREATE TABLE IF NOT EXISTS blast_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT,
    recipients TEXT,  -- 'all' OR comma-separated phones
    total_recipients INT,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',  -- pending/sending/sent/failed
    schedule_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT (datetime('now')),
    sent_at TIMESTAMP
);
```

**New functions:** `create_blast()`, `update_blast_status()`, `get_blast_history()`, `get_all_customer_phones()`

### Frontend (Blast.jsx)

Layout: 2-column grid (compose + preview) + history table below

**Compose panel:**
- Textarea (max 4096 chars, character counter)
- Recipient radio: "Semua contacts" / "Pilih manually" (disabled)
- Schedule radio: "Hantar sekarang" / "Schedule" (datetime picker)
- "Hantar Blast" button → confirm popup → handleSend

**Preview panel:**
- Live preview of message in WhatsApp-style bubble
- Shows recipient count + schedule summary

**History table:**
- Columns: Tarikh, Message, Recipients, Sent, Failed, Status
- Color-coded status badges (pending/yellow, sending/blue, sent/green, failed/red)

### GET /api/blast/history
- Returns list of all blast_logs ordered by created_at DESC
- Protected (requires X-API-Key)

## Recurring Constraints (1GB RAM Server)

- All SQLite DB writes in async endpoints MUST use `loop.run_in_executor(None, func, args...)`
- Never call sync DB functions directly in `async def` route handlers
- Background tasks must be created with `asyncio.create_task()`, never blocking
- Background senders should include `await asyncio.sleep(1)` or similar to avoid CPU starvation
