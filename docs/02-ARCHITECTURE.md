# 02 · System Architecture

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     SYNCERA Desktop App                       │
│                     (Electron 31 process)                     │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────┐         ┌────────────────────────┐ │
│  │   Renderer Process    │  IPC   │   Main Process         │ │
│  │   (React 18 + Vite)   │ ◄────► │   (Node.js)            │ │
│  │                       │         │                        │ │
│  │  • UI Components      │         │  • Baileys (WA)        │ │
│  │  • Zustand store      │         │  • sql.js (DB)         │ │
│  │  • i18n (3 langs)     │         │  • AI bridge           │ │
│  │  • TailwindCSS        │         │  • Drive OAuth         │ │
│  │  • Lucide icons       │         │  • File system         │ │
│  └──────────────────────┘         └────────────────────────┘ │
│                                              │                 │
└──────────────────────────────────────────────┼─────────────────┘
                                               │
                ┌──────────────────────────────┼────────────────────┐
                │                              │                    │
                ▼                              ▼                    ▼
        ┌──────────────┐              ┌──────────────┐    ┌─────────────────┐
        │  WhatsApp    │              │  Local Disk  │    │  AI Backends    │
        │  Web Servers │              │  (userData)  │    │                 │
        │              │              │              │    │  • Ollama       │
        │  (E2E to     │              │  • DB        │    │  • LM Studio    │
        │   linked     │              │  • Auth      │    │  • Pollinations │
        │   phone)     │              │  • Media     │    │  • DuckDuckGo   │
        └──────────────┘              └──────────────┘    └─────────────────┘
                                               │
                                               ▼
                                       ┌──────────────┐
                                       │ Google Drive │
                                       │  (optional)  │
                                       └──────────────┘
```

---

## Process Model

### Main Process (`electron/main.js`)
Responsibilities:
- Window lifecycle (splash, main, settings modal)
- IPC handler registration
- Native theme synchronization
- Custom protocol registration (`syncera-media://`)
- Crash recovery & graceful shutdown

### Renderer Process (`src/`)
Responsibilities:
- React UI rendering
- User input handling
- Local state management via Zustand
- IPC calls to main process via preload bridge
- No direct file/network access (sandboxed)

### Preload Script (`electron/preload.js`)
- Exposes safe subset of main APIs via `window.wa.*` and `window.electron.*`
- Strict context isolation enabled
- No node integration in renderer

---

## Data Flow

### Incoming Message Flow
```
WhatsApp Server
   │
   ▼
Baileys socket (electron/bridge/whatsapp.js)
   │
   ▼
parseMessage() → normalized Message object
   │
   ▼
db.appendMessage() → write to SQLite (sql.js)
   │
   ▼
flush() → debounced disk write
   │
   ├──► IPC event "wa:message" → Renderer updates UI
   │
   └──► If ai_enabled: ai.generateReply()
              │
              ▼
        Build context: KB + history + persona
              │
              ▼
        Call selected backend (Ollama / LMStudio / Pollinations)
              │
              ▼
        Apply disclaimer (if first reply)
              │
              ▼
        baileys.sendMessage() → reply sent to customer
              │
              ▼
        db.appendMessage(is_ai_reply=1)
```

### Outgoing Message Flow
```
User types → Renderer
   │
   ▼
IPC: window.wa.sendMessage(jid, text)
   │
   ▼
Main process: baileys.sendMessage()
   │
   ▼
Optimistic UI update via IPC event
   │
   ▼
Status update events (sent → delivered → read)
```

---

## Storage Architecture

### Database (SQLite via sql.js)
**Path:** `%APPDATA%/syncera/wa-bizai.db` (Windows)
**Engine:** sql.js (pure WASM, no native compilation)
**Persistence:** Debounced flush every 2 seconds to disk

#### Schema (key tables)

```sql
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,    -- JID (e.g. 601XXXXXXXX@s.whatsapp.net)
  contact_id      TEXT NOT NULL,
  name            TEXT,
  phone           TEXT,
  last_message    TEXT,
  last_msg_time   TEXT,
  unread_count    INTEGER DEFAULT 0,
  ai_enabled      INTEGER DEFAULT 0,
  ai_model        TEXT,
  ai_persona      TEXT,
  label           TEXT DEFAULT 'none',
  is_pinned       INTEGER DEFAULT 0,
  is_archived     INTEGER DEFAULT 0,
  tags            TEXT,
  notes           TEXT
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  wa_msg_id       TEXT,
  content         TEXT,
  type            TEXT,                -- text/image/video/audio/document/sticker
  is_from_me      INTEGER DEFAULT 0,
  is_ai_reply     INTEGER DEFAULT 0,
  status          TEXT,                -- sending/sent/delivered/read
  timestamp       TEXT,
  media_url       TEXT,
  mime_type       TEXT,
  caption         TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE contacts (
  id              TEXT PRIMARY KEY,
  phone           TEXT,
  name            TEXT,
  push_name       TEXT,
  label           TEXT DEFAULT 'none',
  tags            TEXT,
  notes           TEXT
);

CREATE TABLE knowledge_base (
  id              TEXT PRIMARY KEY,
  category        TEXT,
  title           TEXT,
  content         TEXT,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT,
  updated_at      TEXT
);

CREATE TABLE settings (
  key             TEXT PRIMARY KEY,
  value           TEXT
);

CREATE TABLE templates (
  id              TEXT PRIMARY KEY,
  category        TEXT,
  title           TEXT,
  body            TEXT,
  use_count       INTEGER DEFAULT 0
);

CREATE TABLE orders (
  id              TEXT PRIMARY KEY,
  contact_id      TEXT,
  title           TEXT,
  amount          REAL,
  status          TEXT,                -- new/processing/shipped/completed/cancelled
  paid            INTEGER DEFAULT 0,
  notes           TEXT,
  created_at      TEXT
);

CREATE TABLE reminders (
  id              TEXT PRIMARY KEY,
  contact_id      TEXT,
  title           TEXT,
  message         TEXT,
  due_at          TEXT,
  repeat_rule     TEXT,                -- none/daily/weekly/monthly
  is_done         INTEGER DEFAULT 0
);

CREATE TABLE broadcasts (
  id              TEXT PRIMARY KEY,
  title           TEXT,
  message         TEXT,
  contact_ids     TEXT,                -- JSON array
  label_filter    TEXT,
  status          TEXT,                -- draft/sent
  sent_count      INTEGER DEFAULT 0,
  fail_count      INTEGER DEFAULT 0,
  created_at      TEXT
);
```

### File Storage
```
%APPDATA%/syncera/
├── wa-bizai.db                  ← SQLite database
├── wa-auth/                     ← Baileys session keys (E2E protocol)
│   ├── creds.json
│   ├── pre-key-*.json
│   ├── sender-key-*.json
│   └── session-*.json
├── media/                       ← Downloaded attachments
│   ├── img_<msgid>.jpg
│   ├── vid_<msgid>.mp4
│   ├── doc_<msgid>.pdf
│   └── aud_<msgid>.ogg
└── logs/                        ← Application logs (rotating)
    └── syncera-YYYY-MM-DD.log
```

---

## AI Subsystem

### Backend Detection
On startup, `ai.detectBackends()` probes:
1. `http://localhost:11434/api/tags` — Ollama
2. `http://localhost:1234/v1/models` — LM Studio
3. Always available: Pollinations.ai (cloud, free)

Returns list of available backends with model lists.

### Prompt Construction
```
SYSTEM:
  You are {business_name}'s customer service AI.
  Persona: {ai_default_persona OR per-conversation override}

  Knowledge Base:
  {top-K relevant KB entries via scoring}

  Rules:
  1. Reply in customer's language (detect from last 3 messages)
  2. Use "Encik" / "Cik" for formal address
  3. Never invent prices not in KB
  4. ...

CONVERSATION HISTORY:
  Customer: {msg1}
  Owner: {msg2}
  ...

CURRENT MESSAGE:
  Customer: {latest_msg}

OUTPUT:
  Reply (max {ai_max_tokens} tokens, plain text)
```

### KB Matching Algorithm
Scoring formula per entry:
```
score = (title_match_count × 3)
      + (content_match_count × 1)
      + (synonym_expansion_bonus × 2)
      + (basic_entry_boost × 8)        ← "standard/13A/basic"
      - (niche_penalty)                ← if query is generic but entry is niche
```

Top-5 entries injected into prompt. Synonyms are Malay↔English bidirectional (e.g. "point" ↔ "soket" ↔ "socket").

### Smart Fallback (No AI)
If all backends fail or `ai_enabled=0`:
1. Check if greeting → return formal "Ye, Encik/Cik. Boleh saya bantu?"
2. Run KB matcher → if top result score > threshold, return KB content verbatim
3. Otherwise return null (no auto-reply)

---

## WhatsApp Bridge (Baileys)

### Connection Lifecycle
```
init()
  ↓
loadAuthState() — reads %APPDATA%/syncera/wa-auth/
  ↓
makeWASocket()
  ↓
EVENT: connection.update
  ├── qr → emit to renderer
  ├── open → emit "wa:connected", begin history sync
  ├── close → check reason
  │     ├── loggedOut → purge auth, show new QR
  │     ├── badSession → reload only
  │     └── timeout/network → reconnect with backoff
  └── ...
  ↓
EVENT: messages.upsert → handleIncoming()
EVENT: messages.update → handleStatusUpdate()
EVENT: presence.update → emit "wa:presence"
EVENT: contacts.upsert → upsert contacts table
```

### Anti-Ban Measures
- Random typing delay before sending (1-3s)
- Configurable inter-message delay (default 1200ms)
- Bulk send rate limiting
- Mark-as-read humanization
- Persistent session reuse (single QR scan)

---

## Build & Distribution

### Build Pipeline
```
Source code (TypeScript + React)
   │
   ▼
vite build → dist/index.html + dist/assets/
   │
   ▼
electron-builder
   │
   ├── Pack ASAR (compressed)
   ├── Unpack native modules (sql.js wasm, baileys)
   ├── Embed Electron binaries
   ├── Apply icons
   ├── Include LICENSE.txt
   └── NSIS compiler → SYNCERA-Setup-1.0.0-x64.exe
```

### Installer Behavior
- NSIS-based, multilingual capable (currently EN only)
- User chooses install path (default: `C:\Users\X\AppData\Local\Programs\SYNCERA\`)
- Creates Desktop + Start Menu shortcuts
- Registers uninstaller in Control Panel
- `perMachine: false` — no admin elevation required
- `deleteAppDataOnUninstall: false` — user data preserved between reinstalls

---

## Security Boundaries

| Boundary | Mechanism | Threat Mitigated |
|---|---|---|
| Renderer ↔ Main | IPC + contextIsolation | XSS, code injection |
| App ↔ WhatsApp | TLS + Signal Protocol (Baileys) | MITM, eavesdropping |
| App ↔ Google Drive | OAuth 2.0 PKCE + HTTPS | Credential theft |
| App ↔ AI backends | localhost-only by default | External AI exfiltration |
| User data | Filesystem permissions (per-user) | Cross-user access |
| Code signing | Optional EV cert | Tampering, malware impersonation |

---

## Performance Characteristics

| Metric | Typical | Tested Maximum |
|---|---|---|
| Cold start time | 6-10 sec | 14 sec (older PC) |
| Memory footprint | 280-420 MB | 600 MB (with 10k messages loaded) |
| DB size | 5-50 MB | 500 MB (50k messages + KB) |
| Message send latency | 200-600 ms | 1.2 sec (over slow LTE) |
| AI reply latency | 1.5-4 sec (Ollama) | 8 sec (cloud + complex KB) |
| Concurrent conversations | Unlimited | 500+ tested |
| Bulk send throughput | 0.5-4 msg/sec | depends on delay setting |

---

## Dependency Inventory (Production)

| Package | Version | Purpose | License |
|---|---|---|---|
| electron | 31.7.7 | Desktop runtime | MIT |
| react / react-dom | 18.3.1 | UI framework | MIT |
| @whiskeysockets/baileys | 6.7.9 | WhatsApp protocol | MIT |
| sql.js | 1.12.0 | Embedded SQLite | MIT |
| zustand | 4.5.4 | State management | MIT |
| tailwindcss | 3.4.4 | CSS framework | MIT |
| axios | 1.7.2 | HTTP client | MIT |
| qrcode | 1.5.4 | QR generation | MIT |
| pino | 9.3.2 | Structured logging | MIT |
| @hapi/boom | 10.0.1 | Error wrapping | BSD-3 |
| uuid | 10.0.0 | ID generation | MIT |
| lucide-react | 0.395.0 | Icons | ISC |

All dependencies are permissively licensed and safe for commercial redistribution.
