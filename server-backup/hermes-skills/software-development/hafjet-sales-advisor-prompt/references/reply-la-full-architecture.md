# Reply.la Full Module Architecture — Phase 2 Clone Spec (Jul 2026, UPDATED to 14 modules)

Complete spec for cloning Reply.la functionality into HAFJET's self-hosted system.
Collected by Tuan Hafizi directly from the Reply.la dashboard (his own account data).
This is functionality/behavior cloning — NOT code or UI copying.

## Architecture overview

Reply.la builds the final AI system prompt from **8 modular sections**, each editable
independently via dashboard tabs. The backend auto-compiles all sections into one
system prompt — the user never edits a raw prompt file manually.

Beyond the prompt builder, Reply.la has additional modules for automation, quality control,
external integrations, testing, and global configuration.

```
FINAL SYSTEM PROMPT (auto-compiled):
├── 1. Business Info (structured fields → token-efficient summary)
├── 2. Language & Style (persona, tone, reply rules)
├── 3. Closing Flow (ordered sales funnel steps)
├── 4. FAQs (toggleable Q&A pairs)
├── 5. Constraints (hard rules — what AI must/must not do)
├── 6. Custom Instruction (free-form extra rules)
├── 7. AI Knowledge (RAG retrieval → top-k chunks)
└── 8. AI Memory (structured per-customer profile)

AUTOMATION ENGINE (AI Actions module, 3 sub-modules):
├── 9a. Auto Label (LLM classify → auto-tag contacts)
├── 9b. Auto Follow Up (delayed scheduler + WhatsApp 24h rule)
└── 9c. Human Takeover (AI detect → notify admin + pause bot)

EXTERNAL INTEGRATIONS:
└── 10. AI Tools (function-calling: Google Sheets + HTTP Request)

QUALITY CONTROL:
├── 11. AI Checker (verify-then-send, double LLM call)
└── 12. AI Feedback (uncertain query review system)

TESTING:
└── 13. AI Playground (sandbox test panel)

GLOBAL SETTINGS:
├── 14a. General Settings (reply delay, message limit, welcome message, owner controls)
└── 14b. AI Settings (status, memory length, creativity, training mode, strict mode, media)
```

## HAFJET implementation priority

| Priority | Module | Sebab |
|----------|--------|-------|
| P0 | Prompt builder (1-6) | Core — ganti `system_prompt.txt` manual |
| P0 | Chats parity (subquery fix) | Bug fix, minimal, independent |
| P1 | AI Knowledge (FTS5) | Katalog harga + PDF reference |
| P1 | Customer memory (structured) | Sales profile extraction |
| P1 | AI Playground | Test panel for Phase 2 UX |
| P2 | Auto Follow Up | Sales conversion — needs 24h WhatsApp rule |
| P2 | Human Takeover (AI-detected) | Upgrade from manual escalation |
| P2 | Auto Label | Nice-to-have reporting |
| P3 | AI Tools (function-calling) | Needs model that supports tool use |
| P3 | AI Checker (verify-then-send) | Double cost, needs paid model |
| P3 | AI Feedback | Quality control loop, defer |

---

## HAFJET data model (proposed tables — all modules)

| Table | Purpose | Priority |
|-------|---------|----------|
| `ai_config` | Persona, tone, constraints, custom instruction, creativity, memory length | P0 |
| `ai_business_info` | Structured business fields | P0 |
| `closing_flow_steps` | Ordered sales funnel | P0 |
| `ai_faqs` | Flexible Q&A pairs | P0 |
| `ai_knowledge_items` | RAG knowledge store (FTS5) | P1 |
| `ai_memory_fields` | Memory field definitions (27 fields) | P1 |
| `customer_memory` | Per-customer extracted values | P1 |
| `keyword_rules_v2` | Multi-keyword, multi-step sequence | P1 |
| `auto_label_rules` | LLM classify → auto-tag | P2 |
| `auto_follow_up_flows` + `steps` | Delayed follow-up scheduler | P2 |
| `human_takeover_categories` | AI detect → notify + pause | P2 |
| `ai_feedback_queries` | Uncertain query review | P3 |
| `ai_feedback_settings` | Feedback config (1 row) | P3 |
| `ai_tools` | Function-calling integrations | P3 |
| `ai_checker_config` | Verify-then-send config | P3 |

---

## Module 1 — Business Info

Pattern: structured form (5 fields + 1 multi-select tags), NOT one big textarea.
"Summary only" toggle to reduce token cost. Full catalogue goes in AI Knowledge.

### Fields observed (HAFJET data)
- `what_you_offer` — "Kedai jualan telefon bimbit, gaming console, servis repair..."
- `product_service_lists` (textarea, "Summary only" toggle) — phone/repair/accessories/print/bill/SPX
- `contact_method` — WhatsApp admin + wasap.my link + walk-in address
- `applicable_tags` (multi-select) — Customers visit me / I deliver or ship / I take bookings / Customers pay me
- `address_hours` — full address + Google Maps link + operating hours
- `delivery_shipping` — nationwide postage / walk-in / COD
- `bookings_availability` — walk-in + WhatsApp link + ansuran form link
- `payment_methods` — cash, bank transfer, QR, card, ansuran (AEON/SPayLater/Boost PayFlex/RedONE)

Conditional fields: tags control which fields appear.

### HAFJET clone target
```python
ai_business_info table:
  what_you_offer TEXT, product_service_summary TEXT, contact_method TEXT,
  applicable_tags TEXT (JSON), address_hours TEXT, delivery_shipping TEXT,
  bookings_availability TEXT, payment_methods TEXT
```

---

## Module 2 — Language & Style

Pattern: persona config → auto-compile into prompt.

### Fields observed
- `persona_name`: "Sarah"
- `persona_role`: "Khidmat Pelanggan & Pembantu Jualan"
- `business_name`: "HAFJET (Jualan Phone, Repair & Aksesori)"
- `language_mode`: "English and Malay" (dropdown)
- `tone_tags`: ["friendly_casual"] (multi-select: also Empathetic/Professional/Persuasive)
- `reply_structure_flags` (6 checkboxes, all ✅): one_idea_per_line, blank_line_between_paragraphs, use_check_cross_marks, use_emojis, whatsapp_bold_italic, end_with_closing_question
- `custom_instruction`: multi-bubble format, "Sarah dari Team Hafjet", panggilan "Awak/Cik", larang slang Indonesia, larang harga anggaran, rujuk katalog rasmi.

### HAFJET clone target
```python
ai_config table:
  persona_name TEXT, persona_role TEXT, business_name TEXT,
  language_mode TEXT, tone_tags TEXT (JSON), reply_structure_flags TEXT (JSON),
  custom_instruction_text TEXT
```

---

## Module 3 — Closing Flow

Pattern: dynamic funnel builder. Each step = 2 fields (description + example_script).
Steps reorderable (▲▼), deletable, new steps can be added.

### 3 steps observed
| Step | Title | Description | Example script |
|------|-------|-------------|----------------|
| 1 | Greetings & Fact Finding | "Greet warmly, ask what they're looking for" | Salam + intro Sarah + tanya nama + kategori (A: repair, B: beli phone, C: aksesori) |
| 2 | Consultation, Promo & Price Link | Jawab mesra, DILARANG harga anggaran, link katalog, promo, tanya kelayakan ansuran | Link katalog + "nak semak kelayakan ansuran?" |
| 3 | Collect Details & Confirm Order | Kumpul Nama, No Telefon, Model, Alamat | Form → "pass ke team admin" |

Features: `{{variable}}` injection, `[[ai_knowledge_ref]]`, guardrails in step descriptions, handoff to admin at final step.

### HAFJET clone target
```python
closing_flow_steps table:
  id INTEGER PRIMARY KEY, step_order INTEGER, title TEXT,
  description TEXT, example_script TEXT, created_at, updated_at
```

---

## Module 4 — FAQs

Pattern: array of Q&A pairs, richtext answer, per-item enable toggle.

### 5 FAQs observed
1. "Berapa harga?" → Link katalog rasmi
2. "Boleh ansuran? Syarat?" → AEON/SPayLater/Boost/RedONE + syarat sektor kerja
3. "Blacklist / tiada slip gaji?" → RedONE Free Phone
4. "Kedai kat mana / waktu?" → Alamat Raub + Google Maps + jam
5. "Scammer ke / trusted?" → HAFIZI GADJET ENTERPRISE + 1000+ pelanggan + testimoni

### HAFJET clone target
```python
ai_faqs table:
  id, question TEXT, answer TEXT (richtext), enabled INTEGER DEFAULT 1, created_at, updated_at
```

---

## Module 5 — Constraints (8 rules)
Single plaintext block. 8 hard rules: no reka harga, no diagnose, no out-scope, no slang Indo, multi-bubble, no harga anggaran, no repeat greeting, rujuk admin bila tak pasti.

### HAFJET clone target
```python
ai_config.constraints_text TEXT
```

---

## Module 6 — Custom Instruction (2 rules)
Single plaintext block. Chat merepek handling: 1 bubble jawab sopan, tarik semula. Beri link admin dan berhenti bila persist.

### HAFJET clone target
```python
ai_config.custom_instruction_text TEXT
```

---

## Module 7 — AI Knowledge Base (RAG)

### 24 items observed (HAFJET BOT)
OPPO/XIAOMI/VIVO/TECNO/SAMSUNG/ROG/REALME/NUBIA/IPHONE/INFINIX/HONOR catalogs (CASH + ANSURAN), "Harga Repair Phone", "HAFJET Training Data & Pricelist".

### Data model per item
name (required), description (text, has "Auto-Generate with AI" button), content_type (PDF/text/URL), file (max 10MB), status (Live/Not Indexed/Disabled), updated_at.

### HAFJET approach (REVISED Jul 2026 — hardware constraint changed)

**Previous recommendation was Option B (FTS5 only) for 1GB Azure RAM. HARDWARE UPDATE: Tuan Hafizi has `hafjet-pc-office` (Ubuntu 24.04, 16GB RAM, i3 CPU) connected via Tailscale, running Hermes Agent. This changes everything.**

**DECISION: Option A (Full RAG) — but as a SEPARATE MICROSERVICE on the Ubuntu PC, NOT on Azure.**

#### Revised architecture — Hybrid RAG microservice
```
Azure Web App (1GB RAM):
  - Main backend (FastAPI + webhook_listener)
  - NO sentence-transformers installed
  - When AI needs knowledge retrieval: HTTP POST to Ubuntu RAG service
  - Fallback: if Ubuntu service down, skip section 7 (graceful degradation, prompt still compiles from sections 1-6 + 8-9)

Ubuntu PC Office (16GB RAM, Tailscale):
  - Hermes Agent (existing)
  - NEW: RAG microservice (FastAPI, port 8100 or similar)
  - sentence-transformers/all-MiniLM-L6-v2 (384-dim, ~90MB model, ~4GB RAM peak)
  - FAISS vector store (in-memory, persist to .faiss file)
  - SQLite FTS5 virtual table (keyword/BM25 search)
  - pymupdf for PDF extraction
  - Chunking: 200 tokens, 50 token overlap
  - Hybrid retrieval: FTS5 (keyword) + FAISS (semantic) → merge with RRF (Reciprocal Rank Fusion)
```

#### RAG microservice endpoints:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/index` | POST | Receive PDF/file → extract → chunk → embed → store (async, return job_id) |
| `/index/status/{job_id}` | GET | Check indexing progress |
| `/retrieve` | POST | Receive query text → embed → hybrid search (FTS5 + FAISS) → return top-5 chunks |
| `/reindex/{item_id}` | POST | Re-embed single item after edit |

#### Azure backend integration:
- `build_full_system_prompt()` section 7: `http POST <Ubuntu_IP>:8100/retrieve {"query": customer_message}` → inject returned chunks
- Indexing trigger: admin upload/edit knowledge item via dashboard → forward file to Ubuntu `/index`
- Fallback: if Ubuntu service unreachable, skip section 7 (log warning, prompt still compiles)

#### Updated `ai_knowledge_items` table:
```sql
CREATE TABLE IF NOT EXISTS ai_knowledge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    content_type TEXT DEFAULT 'pdf',     -- pdf/text/url
    file_path TEXT,
    content TEXT,                         -- full extracted text (for FTS5 + display)
    faiss_id INTEGER,                     -- reference to FAISS index position
    index_status TEXT DEFAULT 'pending',  -- pending → indexing → live | failed
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT (datetime('now')),
    updated_at TIMESTAMP DEFAULT (datetime('now'))
);
```

#### Previous approach (deprecated, kept for reference):
- **Option A (full RAG):** sentence-transformers + FAISS — 🔴 WAS High RAM risk on 1GB Azure → NOW VIABLE on 16GB Ubuntu
- **Option B (lightweight):** SQLite FTS5 + pymupdf extraction — 🟢 Was recommended for 1GB → NOW UPGRADED to hybrid
- **Option C (hybrid):** Start FTS5, upgrade to embedding when RAM upgrades → NOW IMPLEMENTING THIS

### HAFJET clone target (UPDATED)
```python
ai_knowledge_items table:
  id, name TEXT, description TEXT, content_type TEXT, file_path TEXT,
  content TEXT (extracted for FTS5), status TEXT DEFAULT 'not_indexed', updated_at
```

Indexing: async via APScheduler, explicit "Retrain" button, status (pending/live/failed).

---

## Module 8 — AI Memory (27 fields)

### Data model
```
ai_memory_fields (config): field_name, description
customer_memory (data): customer_phone, field_name, field_value, extracted_at, updated_at
```

### 27 memory fields observed
Service Interest, Target Device Model, Budget & Plan Signal, Ansuran Eligibility Docs, Key Objection, Decision Stage, Fulfillment Preference, Preferred Brand, Must-have Specs, Trade-in Interest, Repair Symptom Details, Warranty Expectation, Communication Preference, Promo Trigger, Repeat Customer History, IC Name Match, Pickup/Drop Method, Repair Data Backup, Part Preference, Accessory Add-ons, Telco/Plan Interest, Proof of Payment, Nearest Landmark, Timing & Urgency, Customer Name & Contact, Issue Description (Repair), Blacklist/Special Status.

### Danger Zone
- "Clear All Context" — erase chat history, keep profiles
- "Clear All Working Memory" — erase profiles, keep chat history

### HAFJET vs Reply.la gap
| Aspect | HAFJET now | Reply.la |
|--------|-----------|---------|
| What remembered | 8 last messages (rolling) | 27 structured fields per customer (forever) |
| How obtained | `build_memory_context(phone)` query messages | LLM extraction after each turn |
| Persistence | Trim when new messages arrive | Never trimmed |
| Structure | Raw message text | Key-value |
| Clear | None | 2 separate: chat vs profile |

---

## Module 9 — AI Actions (3 sub-modules)

### 9a. Auto Label
- LLM classifier call after each AI turn → auto-tag contact
- `auto_label_rules` table: `id, label_name, trigger_description, enabled`
- Deal outcomes: CLOSED labels (Ready-To-Buy, Ansuran-Lulus, Deposit-Paid, Walk-In-Completed) vs CANNOT CLOSED (not-interested, Ansuran-Gagal, Cancel-Booking, No-Response)
- 11 sample rules observed (interested, not-interested, pricing-requested, Repair-Lead, etc.)

### 9b. Auto Follow Up
- Visual flowchart/node-based automation — delayed follow-up when lead stops replying
- `auto_follow_up_flows` + `auto_follow_up_steps` tables
- Each step: `send_after_value, send_after_unit, message_type (template|ai_generated), ai_instruction`
- **⚠️ WhatsApp 24-Hour Rule**: free-form messages within 24h of customer's last message; after that MUST use pre-approved Template messages. HAFJET currently does NOT handle this — `send_whatsapp_message()` always sends free-form `type: "text"`.
- Activities tab: Pending/Sent/Failed/Cancelled counters + search + date filter

### 9c. Human Takeover
- 3-node flow: WHEN (detect) → DISTRIBUTION (all admins) → NOTIFY (Telegram)
- `human_takeover_categories` table: `category_name, trigger_description`
- 4 categories observed: explicit-request, negative-sentiment, unresolved-intent, document-submitted
- HAFJET has manual escalation (S2F5) but NOT AI-detected — this is an upgrade path

---

## Module 10 — AI Tools (P3 defer)
- Function-calling integrations: Google Sheets (OAuth2) + HTTP Request (generic webhook)
- 4-step setup wizard: Connect → Configure → Test → Finalize
- Reusable OAuth connections across multiple tools
- **HAFJET verdict: P3 defer** — nemotron (OpenRouter free) doesn't confirm function-calling support

---

## Module 11 — AI Checker (P3 defer)
- Second LLM call verifies response accuracy before sending
- Config: `accuracy_level` (0.0-1.0, default 0.7 Balanced), `max_correction_attempts` (1-5, default 1)
- 5-node flow: Customer Asks → AI Responds → Checker → Passed (send) OR Failed (regenerate, loop up to max)
- **HAFJET verdict: P3 defer** — double token cost + 16s+ latency on free tier

---

## Module 12 — AI Feedback (patch plan proposed)
- Uncertain query review system — AI flags low-confidence answers for human review
- Config: `alert_on_unsure`, `handoff_to_human_when_unsure`, `confidence_sensitivity` (0.0-1.0, default 0.5)
- List page: "Questions to Review" table (USER_QUERY, REASON, DATE, STATUS, Review button)
- Detail page: Customer bubble + AI Response bubble + "Is this answer correct?" (Yes/No/Skip)
- Proposed tables: `ai_feedback_queries`, `ai_feedback_settings`
- Proposed endpoints: `GET/PUT /api/feedback/settings`, `GET /api/feedback/queries`, `POST /api/feedback/queries/{id}/verify`

---

## Module 13 — AI Playground (patch plan proposed)
- Sandbox test panel — real AI processing, NO production side-effects
- In-memory session store (ephemeral, 1hr TTL)
- Calls `ask_openrouter()` DIRECTLY (not `ask_hermes()`) to skip `build_memory_context()` and `send_whatsapp_message()`
- Config summary sidebar: read-only aggregate from all config tables
- Playground tools: Clear Context, Clear Memory, Test Actions (simulated, no real notification)
- **⚠️ Isolation requirement**: playground MUST NOT call `log_inbound()`, `log_outbound()`, or `send_whatsapp_message()`

### Playground isolation pattern (critical)
```python
# SAFE — playground calls OpenRouter directly, no production side-effects:
from hermes_ai import SOUL_CONTEXT, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_URL
messages = [{"role": "system", "content": SOUL_CONTEXT}, {"role": "user", "content": user_content}]
resp = await loop.run_in_executor(None, _call_ai)  # direct OpenRouter call
session["history"].append({"role": "user", "content": message})
session["history"].append({"role": "assistant", "content": ai_reply})

# DANGEROUS — do NOT do this in playground:
# await log_inbound(phone, message, ...)      # pollutes production messages table
# await send_whatsapp_message(phone, reply)   # sends to real WhatsApp
# ask_hermes(message, name, phone)             # calls build_memory_context → reads production DB
```

---

## Module 14 — Global Settings

### 14a. General Settings
- Chatbot name ("HAFJET BOT"), description, connected device (WhatsApp Official)
- Labels/tags (Sales, Support, Customer Service, Repair Phone)
- Reply delay: 3s (max 25s); Message limit: 30 per 60s
- Working hours checkbox (unchecked); Typing effect (duration + type)
- Welcome message: enabled, Malay greeting as "Sarah", 14-day re-trigger
- Owner controls: /stop /start /status, customizable reply text
- Danger Zone: "Delete This Chatbot" (irreversible)

### 14b. AI Settings
- Status: On/Off; Provider: "Using Platform AI" (org token, no API key)
- Memory length: 12 (max 128); Creativity: 0.6 (0.1-1)
- Training mode: "Guided" (link to Custom mode)
- Extra features: Friendly Tone ✅, Strict Mode ✅, Send Images ✅, Understand Images ✅, Understand Voice ✅, Privacy Mode ☐

---

## Prompt builder flow (proposed backend)

```python
def build_system_prompt(phone: str) -> str:
    config = get_ai_config()           # Module 1+2+5+6
    biz = get_ai_business_info()       # Module 1
    flow = get_closing_flow_steps()    # Module 3
    faqs = get_active_faqs()           # Module 4 (enabled only)
    knowledge = fts5_search(customer_message, top_k=3)  # Module 7
    memory = get_customer_memory(phone) # Module 8
    chat_history = build_memory_context(phone)  # existing

    prompt = f"""
    {config.persona_role} ({config.persona_name}) for {config.business_name}
    ...
    """
    return prompt
```

This replaces the current `system_prompt.txt` (manual 42-line block) with an auto-compiled prompt.
