---
name: hafjet-sales-advisor-prompt
description: Use when updating or redesigning the HAFJET WhatsApp bot system prompt / AI persona in hermes_ai.py. Covers the Sales Advisor persona (Reply.la style), AI Memory injection, Power Question, and segmented follow-up integration for the HAFJET ecosystem.
---

# HAFJET Sales Advisor Prompt — Build & Integrate

## When to use
- Tuan Hafizi wants to change the bot's persona / system prompt
- Adding AI Memory (conversation history), Power Question, or segmented follow-up
- Adapting external prompt templates (e.g. Reply.la) into HAFJET's `system_prompt.txt`

## Grounding source (NotebookLM)
Tuan keeps the authoritative Reply.la webinar material in NotebookLM:
notebook **"WhatsApp AI Chatbot Kickstart Webinar Participation Guide"** (ID `a7416353`).
Access from this headless server uses `notebooklm-py` with `storage_state.json` at
`~/.notebooklm/profiles/default/storage_state.json` (cookies minted on Tuan's laptop).
Verify with `notebooklm use a7416353 && notebooklm metadata`, then `notebooklm ask --prompt-file q.txt`.
The verified Reply.la prompt structure is captured in `references/reply-la-structure.md` — reuse it
when rewriting `system_prompt.txt` so the bot stays aligned with the webinar spec.

## Architecture facts (HAFJET)
- System prompt lives in `system_prompt.txt` (read by `hermes_ai.py` at startup via `safe_read_text`)
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
- `_query_customer` is SYNC (wraps `_get_db`) — safe to call from the executor thread inside `ask_hermes`
- Memory block should be EMPTY for brand-new customers so Power Question triggers
- Keep guardrails: no fake promo, no final price without inspection, location = Raub Pahang (never Shah Alam), number = +60 16-980 8736
- Pyright may flag pre-existing `str | None` errors elsewhere — ignore unless on lines you touched
- **Segmented follow-up (Cold/Interested/Hot/Very Hot) is NOT auto-triggered** — the prompt mentions the concept but there is no scheduler/blast worker in the bot. Treat as a separate future feature, not part of the prompt-integration task.

## Verification
- Syntax: `python3 -m py_compile hermes_ai.py webhook_listener.py`
- Dry-run: simulate `ask_hermes("hai", "Boss", "60123456789")` and check logs show `[HISTORY]` or Power Question block
- Deploy only after Tuan approves diff + logs
