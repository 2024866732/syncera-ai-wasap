---
name: hafjet-sales-advisor-prompt
description: Use when updating or redesigning the HAFJET WhatsApp bot system prompt / AI persona in hermes_ai.py. Covers the Sales Advisor persona (Reply.la style), AI Memory injection, Power Question, and segmented follow-up integration for the HAFJET ecosystem.
---

# HAFJET Sales Advisor Prompt — Build & Integrate

## When to use
- Tuan Hafizi wants to change the bot's persona / system prompt
- Adding AI Memory (conversation history), Power Question, or segmented follow-up
- Adapting external prompt templates (e.g. Reply.la) into HAFJET's `system_prompt.txt`
- Implementing or extending AI Knowledge items (FTS5 RAG store for product catalog/reference)
- Adding CRUD API or search for catalog data

## Grounding source (NotebookLM)
Tuan keeps the authoritative Reply.la webinar material in NotebookLM:
notebook **"WhatsApp AI Chatbot Kickstart Webinar Participation Guide"** (ID `a7416353`).
Access from this headless server uses `notebooklm-py` with `storage_state.json` at
`~/.notebooklm/profiles/default/storage_state.json` (cookies minted on Tuan's laptop).
Verify with `notebooklm use a7416353 && notebooklm metadata`, then `notebooklm ask --prompt-file q.txt`.
The verified Reply.la prompt structure is captured in `references/reply-la-structure.md` — reuse it
when rewriting `system_prompt.txt` so the bot stays aligned with the webinar spec.

## Phase 2 — Full module architecture (Jul 2026)
Tuan explored ALL 14 Reply.la modules directly from his dashboard. The complete spec —
data models, field structures, gap analysis, and proposed HAFJET clone tables — is in
`references/reply-la-full-architecture.md`. **Load this file before designing Phase 2 AI Training
implementation.** Key shift: HAFJET will move from manual `system_prompt.txt` to an auto-compiled
prompt builder that reads from structured tables.

### 14 modules (spec complete)
**Prompt Builder (8 modules):** Business Info, Language & Style, Closing Flow, FAQs, Constraints,
Custom Instruction, AI Knowledge (RAG — **REVISED Jul 2026: full hybrid RAG via Ubuntu PC Office microservice (16GB RAM, Tailscale), NOT FTS5-only on Azure**, see `references/reply-la-full-architecture.md`), AI Memory
(27 structured customer profile fields vs HAFJET's 8-message rolling chat history).

**Automation Engine (3 sub-modules under AI Actions):** Auto Label (LLM classify → auto-tag),
Auto Follow Up (delayed scheduler + WhatsApp 24h rule — HAFJET must handle template fallback),
Human Takeover (AI detect → notify admin + pause bot — upgrade from HAFJET's manual escalation).

**External Integrations:** AI Tools (function-calling — P3 defer, needs model that supports tool use).

**Quality Control:** AI Checker (verify-then-send, double LLM call — P3 defer, too costly for free tier),
AI Feedback (uncertain query review system — patch plan proposed in `references/reply-la-full-architecture.md`).

**Testing:** AI Playground (sandbox test panel — patch plan proposed, in-memory session isolation pattern).

**Global Settings:** General Settings (reply delay, message limit, welcome message, owner controls),
AI Settings (status, memory length, creativity, training mode, strict mode, media support).

### Functional gaps (priority order, updated Jul 2026)
1. AI Knowledge hybrid RAG (FTS5 ✅ done; FAISS vector upgrade still deferred to Ubuntu PC Office microservice)
2. AI Memory (27 structured profile fields — ✅ **Implemented Jul 2026**, Sprint B Phase 2; see `references/sprint-b-ai-backend-implementation.md`)
3. Keyword Rules v2 (multi-step sequence + labels — ✅ **Implemented Jul 2026**, Sprint B Phase 3; see `references/sprint-b-ai-backend-implementation.md`)
4. Auto Follow Up (HAFJET has SPX reminder scheduler but NOT sales follow-up; needs 24h WhatsApp rule)
5. AI Playground (sandbox test panel)

## Architecture facts (HAFJET)

### Phase 2A — Prompt Builder (Jul 2026, implemented)
HAFJET has moved from manual `system_prompt.txt` to an **auto-compiled prompt builder** that reads from 4 structured SQLite tables. See `references/phase-2a-prompt-builder.md` for full implementation details (schema, seed data, compile function, integration pattern).

### Phase 2B — AI Knowledge + Customer Memory + Keyword v2 (Jul 2026, implemented)
HAFJET now has:
- **FTS5-based RAG store** for product catalog/reference — see `references/sprint-b-ai-backend-implementation.md`
- **Structured customer memory** with ON CONFLICT DO UPDATE — see `references/sprint-b-ai-backend-implementation.md`
- **Multi-step keyword v2** with JSON arrays, sequence tracking, per-customer state — see `references/sprint-b-ai-backend-implementation.md`

All three are lightweight, DB-only, with graceful fallbacks. Hybrid RAG (FTS5 + FAISS) is deferred to Ubuntu PC Office microservice.

### Prompt Builder Architecture (shared by Phase 2A + 2B)
- `build_full_system_prompt()` in `db_logger.py` — compiles from `ai_config`, `ai_business_info`, `closing_flow_steps`, `ai_faqs` into 6 sections + section 7 (ai_knowledge_items FTS5) + section 8 (customer_memory)
- `build_soul_context()` in `hermes_ai.py` — runtime wrapper that calls `build_full_system_prompt()` on each AI call, falls back to static `SOUL_CONTEXT` on DB failure
- `ask_openrouter()` now calls `build_soul_context()` at runtime (not module-level `SOUL_CONTEXT`)
- `system_prompt.txt` is now a **FALLBACK only** — used when DB tables are empty or `build_full_system_prompt()` raises. File is NOT deleted.
- Tables created in `init_db()` with `CREATE TABLE IF NOT EXISTS` + seed-if-empty pattern (non-destructive)

### Legacy architecture (pre-Phase 2A)
- System prompt was read from `system_prompt.txt` at module load time via `safe_read_text`
- `SOUL_CONTEXT` = system_prompt + business_info + extra rules, injected as `role: system`
- `ask_hermes(message, wa_name, phone=None)` → `ask_openrouter(...)` calls OpenRouter (nemotron)
- `webhook_listener.py: generate_reply(message, sender_name, sender_number)` calls `ask_hermes` via `run_in_executor`
- History query: `db_logger._query_customer(phone, limit)` → list of `messages` rows (direction/content)
- Messages table: `customer_phone, direction (inbound/outbound), content, ...`

## Steps to apply a new persona
1. Write the adapted prompt to `system_prompt.txt` (MY casual style, NO Indo slang, ✅❌, one-idea-per-line, CTA wajib).
2. In `hermes_ai.py` add `build_memory_context(phone)` that imports `_query_customer` from db_logger and returns last N turns as `Pelanggan: ... / Bot: ...` text.
3. Add `POWER_QUESTION` constant for cold-lead first touch.
4. In `ask_openrouter`, build `user_content` = name + phone + message + `[HISTORY ...]` block (if memory) + `[SUGGESTION PENUTUP]` Power Question block (only if NO history / cold lead).
5. Change `ask_hermes` signature to accept `phone` and forward it.
6. In `webhook_listener.py` pass `sender_number` as 3rd arg to `ask_hermes` inside `run_in_executor`.
7. `python3 -m py_compile` both files. Do NOT deploy without Tuan's approval.

## Pitfalls
- `run_in_executor` passes positional args — order matters: `(ask_hermes, message, sender_name, sender_number)`
- `run_in_executor` does NOT support `**kwargs`. Use `lambda: func(id, **data)` when the endpoint needs to pass dynamic dict fields to a `**kwargs` function.
- **Alternative for `**kwargs` in run_in_executor:** When the target function uses `**kwargs` (e.g. `update_knowledge_item(rule_id, **data)`), wrap in `lambda: func(id, **data)`. This avoids passing a raw dict as a positional arg, which would fail because the function expects keyword expansions.
- `_query_customer` is SYNC (wraps `_get_db`) — safe to call from the executor thread inside `ask_hermes`
- Memory block should be EMPTY for brand-new customers so Power Question triggers
- Keep guardrails: no fake promo, no final price without inspection, location = Raub Pahang (never Shah Alam), number = +60 16-980 8736
- Pyright may flag pre-existing `str | None` errors elsewhere — ignore unless on lines you touched
- **Segmented follow-up (Cold/Interested/Hot/Very Hot) is NOT auto-triggered** — the prompt mentions the concept but there is no scheduler/blast worker in the bot. Treat as a separate future feature, not part of the prompt-integration task.
- **Phase 2A pitfall — `safe_read_text` accidental deletion:** When patching `hermes_ai.py` to add `build_soul_context()`, the existing `safe_read_text()` function (used by `SYSTEM_PROMPT` and `BUSINESS_INFO` module-level assignments) can be accidentally overwritten. Always verify `safe_read_text` still exists after patching — `SYSTEM_PROMPT = safe_read_text(SYSTEM_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT)` depends on it.
- **Phase 2A pitfall — runtime vs module-level:** `SOUL_CONTEXT` is built at module load time. `build_soul_context()` must be called inside `ask_openrouter()` at runtime (per-message) so prompt edits via DB take effect without app restart. Do NOT replace `SOUL_CONTEXT` with a one-time `build_soul_context()` call at module level.

## Verification
- Syntax: `python3 -m py_compile hermes_ai.py webhook_listener.py`
- Dry-run: simulate `ask_hermes("hai", "Boss", "60123456789")` and check logs show `[HISTORY]` or Power Question block
- Deploy only after Tuan approves diff + logs
