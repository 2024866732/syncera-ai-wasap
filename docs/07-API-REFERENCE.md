# 07 · Internal API Reference

> This document describes the internal IPC bridge API exposed by SYNCERA's main process to the renderer. It is intended for developers maintaining or extending SYNCERA, not for third-party integrations.

## IPC Bridge

The preload script exposes a `window.wa` object in the renderer with the following methods. All methods return Promises.

### Connection

#### `wa.connect()`
Initiate WhatsApp Web connection. Triggers QR generation if no auth.
- **Returns:** `Promise<{ ok: boolean; error?: string }>`

#### `wa.disconnect(opts?)`
Logout from WhatsApp.
- **Params:** `{ deleteAuth?: boolean }` — if true, purge auth folder
- **Returns:** `Promise<{ ok: boolean }>`

#### `wa.getState()`
Get current connection state.
- **Returns:** `Promise<{ isConnected: boolean; user?: { id: string; name: string }; qrCode?: string }>`

### Messages

#### `wa.sendMessage(jid, text)`
Send a text message.
- **Params:** `jid: string` (e.g. `601XXXXXXXX@s.whatsapp.net`), `text: string`
- **Returns:** `Promise<{ ok: boolean; error?: string; msgId?: string }>`

#### `wa.sendMedia(opts)`
Send media (image / video / document).
- **Params:**
  ```typescript
  {
    jid: string;
    mediaBase64: string;
    mimeType: string;
    fileName: string;
    caption?: string;
  }
  ```
- **Returns:** `Promise<{ ok: boolean; error?: string; msgId?: string }>`

#### `wa.getMessages(jid, limit?, offset?)`
Retrieve messages from a conversation.
- **Params:** `jid: string`, `limit?: number` (default 60), `offset?: number`
- **Returns:** `Promise<Message[]>`

### Conversations

#### `wa.getConversations()`
List all conversations sorted by last activity.
- **Returns:** `Promise<Conversation[]>`

#### `wa.updateConversation(jid, updates)`
Update conversation fields.
- **Params:** `jid: string`, `updates: Partial<Conversation>`
- **Returns:** `Promise<{ ok: boolean }>`

#### `wa.clearUnread(jid)`
Reset unread counter to 0.
- **Returns:** `Promise<{ ok: boolean }>`

#### `wa.clearAIHistory(jid)`
Delete only AI-generated messages from a conversation.
- **Returns:** `Promise<{ ok: boolean; deleted: number }>`

#### `wa.clearConversation(jid)`
Delete all messages from a conversation (local only — phone unaffected).
- **Returns:** `Promise<{ ok: boolean; deleted: number }>`

### Contacts

#### `wa.getAllContacts()`
List all contacts.
- **Returns:** `Promise<Contact[]>`

#### `wa.updateContact(contactId, updates)`
Update contact fields.
- **Params:** `contactId: string`, `updates: Partial<Contact>`
- **Returns:** `Promise<{ ok: boolean }>`

### Knowledge Base

#### `wa.getKB()`
List all KB entries.
- **Returns:** `Promise<KBEntry[]>`

#### `wa.saveKBEntry(entry)`
Create or update an entry.
- **Params:** `entry: KBEntry` (with `id` for update, without for create)
- **Returns:** `Promise<{ ok: boolean; id: string }>`

#### `wa.deleteKBEntry(id)`
- **Params:** `id: string`
- **Returns:** `Promise<{ ok: boolean }>`

### Templates

#### `wa.getTemplates()`
- **Returns:** `Promise<Template[]>`

#### `wa.saveTemplate(template)`
- **Returns:** `Promise<{ ok: boolean; id: string }>`

#### `wa.deleteTemplate(id)`
- **Returns:** `Promise<{ ok: boolean }>`

#### `wa.useTemplate(id)`
Increment usage counter.
- **Returns:** `Promise<{ ok: boolean }>`

### Settings

#### `wa.getSettings()`
Get all settings as a record.
- **Returns:** `Promise<Record<string, string>>`

#### `wa.setSetting(key, value)`
- **Params:** `key: string`, `value: string`
- **Returns:** `Promise<{ ok: boolean }>`

### AI

#### `wa.detectAI()`
Scan for available AI backends.
- **Returns:** `Promise<AIBackend[]>` where each backend has `{ id, name, url, type, models }`

#### `wa.testAI(backendId, url, type)`
Test connectivity to a backend.
- **Returns:** `Promise<{ ok: boolean; latencyMs?: number; error?: string }>`

#### `wa.diagnoseAI()`
Get overall AI system health.
- **Returns:** `Promise<{ ok: boolean; aiEnabledCount: number; totalConvs: number; reason?: string }>`

#### `wa.enableAIForAll()`
Bulk-enable AI on every conversation.
- **Returns:** `Promise<{ ok: boolean; updated: number }>`

### Orders, Reminders, Broadcasts

Standard CRUD methods following the same pattern:
- `wa.getOrders()`, `wa.saveOrder(o)`, `wa.deleteOrder(id)`
- `wa.getReminders()`, `wa.saveReminder(r)`, `wa.deleteReminder(id)`
- `wa.getBroadcasts()`, `wa.saveBroadcast(b)`, `wa.deleteBroadcast(id)`, `wa.sendBroadcast(id)`

### Analytics & Reports

#### `wa.getAnalytics()`
Returns dashboard analytics object:
```typescript
{
  msgs_today_in: number;
  msgs_today_out: number;
  ai_replies_today: number;
  unread_total: number;
  total_contacts: number;
  total_convs: number;
  ai_active: number;
  revenue_total: number;
  revenue_pending: number;
  orders_pending: number;
  msgs_week: { d: string; c: number }[];
  top_contacts: { name: string; phone: string; msg_count: number }[];
}
```

#### `wa.getReportStats({ startDate, endDate })`
Detailed stats for PDF report.
- **Returns:** `ReportStats` object

#### `wa.saveReportPDF({ html, defaultFileName })`
Render HTML to PDF and save.
- **Returns:** `Promise<{ ok: boolean; path?: string; error?: string; canceled?: boolean }>`

### Drive

#### `wa.driveStatus()`
- **Returns:** `Promise<DriveStatus>` — connection state, last backup time

#### `wa.driveConnect()`
Initiate OAuth flow.
- **Returns:** `Promise<{ ok: boolean; error?: string }>`

#### `wa.driveDisconnect()`
- **Returns:** `Promise<{ ok: boolean }>`

#### `wa.driveBackupNow()`
- **Returns:** `Promise<{ ok: boolean; fileId?: string; error?: string }>`

#### `wa.driveList()`
- **Returns:** `Promise<DriveBackup[]>`

#### `wa.driveRestore(fileId)`
- **Returns:** `Promise<{ ok: boolean; error?: string }>`

### Search

#### `wa.searchMessages(query)`
Full-text search across all messages.
- **Returns:** `Promise<SearchResult[]>`

### Presence

#### `wa.subscribePresence(jid)`
Subscribe to typing/online events for a contact.

---

## IPC Events (Main → Renderer)

Subscribe with `wa.on(eventName, handler)`:

| Event | Payload | Description |
|---|---|---|
| `wa:qr` | `string` (data URL) | New QR code generated |
| `wa:connected` | `{ user: { id, name } }` | WA connection established |
| `wa:disconnected` | `{ loggedOut: boolean }` | Connection lost |
| `wa:message` | `Message + extras` | New incoming/outgoing message |
| `wa:status_update` | `{ msgId, status }` | Message delivery status changed |
| `wa:typing` | `{ jid, typing }` | Contact typing state |
| `wa:presence` | `{ jid, presence }` | Contact online/offline |
| `wa:reminder_due` | `{ title, message }` | Reminder fired |
| `wa:history_sync_start` | `{}` | History sync began |
| `wa:history_sync_progress` | `{ totalSaved, progress }` | Sync progress update |
| `wa:history_sync_done` | `{ totalSaved }` | Sync completed |

---

## Database API (Internal)

`electron/bridge/database.js` exposes:

### Lifecycle
- `initDB()` — Initialize sql.js, load DB from disk
- `reload()` — Reload DB after restore
- `flush(force?)` — Persist to disk (debounced)
- `close()` — Graceful shutdown

### Query Helpers
- `run(sql, params?)` — Execute statement
- `get(sql, params?)` — Single row
- `all(sql, params?)` — Multiple rows
- `exec(sql)` — Multi-statement raw

All queries use parameterized binding via sql.js's `bind()` to prevent SQL injection.

---

## AI Bridge API (Internal)

`electron/bridge/ai.js` exposes:

### `ai.detectBackends()` → `Promise<AIBackend[]>`
Probe localhost ports for Ollama, LM Studio. Always includes Pollinations.

### `ai.generateReply(opts)` → `Promise<string>`
Core reply generation.
```typescript
{
  conversationId: string;
  customerMessage: string;
  history: Message[];        // Recent messages
  kbContext: string;          // Pre-built KB snippet
  persona: string;            // Effective persona
  backend: AIBackend;
  model: string;
  maxTokens: number;
}
```

### `ai.smartFallback(opts)` → `Promise<string | null>`
KB-only matcher (no LLM). Used when AI is unavailable.

---

## Adding a New Feature

Example: Adding a "Tags" CRUD endpoint.

1. **Schema** — add table in `database.js → initSchema()`:
   ```sql
   CREATE TABLE IF NOT EXISTS tags (
     id TEXT PRIMARY KEY,
     name TEXT,
     color TEXT
   );
   ```

2. **Bridge** — add functions in `database.js`:
   ```js
   exports.getTags = () => all('SELECT * FROM tags')
   exports.saveTag = (tag) => { /* upsert */ }
   exports.deleteTag = (id) => run('DELETE FROM tags WHERE id=?', [id])
   ```

3. **IPC** — register in `main.js`:
   ```js
   ipcMain.handle('tags:get', () => db.getTags())
   ipcMain.handle('tags:save', (_e, tag) => db.saveTag(tag))
   ipcMain.handle('tags:delete', (_e, id) => db.deleteTag(id))
   ```

4. **Preload** — expose in `preload.js`:
   ```js
   contextBridge.exposeInMainWorld('wa', {
     // ...existing
     getTags: () => ipcRenderer.invoke('tags:get'),
     saveTag: (tag) => ipcRenderer.invoke('tags:save', tag),
     deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
   })
   ```

5. **Renderer** — use in React:
   ```typescript
   const tags = await window.wa.getTags()
   ```

6. **Store** — add Zustand slice if state is shared across components.

---

## Build & Test

### Type Checking
```bash
npx tsc --noEmit
```

### Dev Mode
```bash
npm run dev
```
Vite hot-reloads on TS/CSS changes. Electron main process requires manual restart.

### Production Build
```bash
npm run build           # NSIS installer
npm run build:portable  # Portable .exe
npm run pack            # Unpacked folder (for testing without installer)
```

### Manual Smoke Tests
1. QR connect → scan → conversations load
2. Send text message → status progresses sent → delivered → read
3. Toggle AI on → incoming customer message triggers AI reply
4. Drive Connect → Backup Now → list shows backup
5. Generate Report PDF → opens correctly
6. Language switch EN ↔ MS → instant translation

---

## File Structure Reference

```
wa-bizai/
├── electron/
│   ├── main.js                ← Main process entry
│   ├── preload.js             ← IPC bridge
│   ├── splash.html            ← Splash screen
│   └── bridge/
│       ├── whatsapp.js        ← Baileys integration
│       ├── database.js        ← SQLite (sql.js)
│       ├── ai.js              ← AI backends + matcher
│       └── drive.js           ← Google Drive OAuth
├── src/
│   ├── App.tsx                ← Root component
│   ├── store/                 ← Zustand state
│   ├── i18n/                  ← Translation dict
│   ├── hooks/                 ← React hooks
│   ├── types.ts               ← Shared TypeScript types
│   └── components/
│       ├── TitleBar.tsx
│       ├── LeftNav.tsx
│       ├── Sidebar.tsx        ← Inbox list
│       ├── ChatView.tsx
│       ├── RightPanel.tsx
│       ├── Settings.tsx
│       ├── Dashboard.tsx
│       ├── Pipeline.tsx
│       ├── Broadcast.tsx
│       ├── Templates.tsx
│       ├── Orders.tsx
│       ├── Reminders.tsx
│       ├── Analytics.tsx
│       ├── Insights.tsx
│       ├── Reports.tsx
│       ├── QuickSend.tsx
│       ├── QRLogin.tsx
│       └── AIOutreach.tsx
├── public/
│   ├── icon.ico
│   └── icon.png
├── build/
│   └── LICENSE.txt            ← EULA shown in installer
├── docs/                      ← This documentation
├── package.json
└── vite.config.ts
```
