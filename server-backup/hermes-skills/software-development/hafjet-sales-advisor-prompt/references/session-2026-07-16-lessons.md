# Session 2026-07-16 — Sales Advisor prompt integration lessons

## What shipped
- `system_prompt.txt` rewritten to Reply.la Sales Advisor structure (grounded via
  NotebookLM notebook `a7416353` "WhatsApp AI Chatbot Kickstart Webinar Participation Guide").
- `hermes_ai.py`: `build_memory_context(phone)` injects last 8 turns from
  `db_logger._query_customer`; `POWER_QUESTION` auto-appended for cold leads;
  `ask_hermes(message, wa_name, phone=None)` forwards phone.
- `webhook_listener.py`: `generate_reply` passes `sender_number` as 3rd positional
  arg to `ask_hermes` inside `run_in_executor`.

## Pitfalls confirmed
- `system_prompt.txt` / `business_info.txt` gitignored → `git add -f` needed.
- `build_zip.py` disk-walk → junk enters artifact unless excluded (see
  hafjet-command-safety references/deploy-zip-hygiene.md).
- Memory import is lazy + try/except — safe in executor thread, not concurrency-tested.
- Segmented follow-up (Cold/Interested/Hot/Very Hot) is prompt-only; no scheduler exists.
  Future feature, not part of prompt task.

## NotebookLM headless access (verified working)
```
source ~/.venv-notebooklm/bin/activate
notebooklm use a7416353
notebooklm ask --prompt-file /tmp/q.txt
```
Server has valid `~/.notebooklm/profiles/default/storage_state.json`.
