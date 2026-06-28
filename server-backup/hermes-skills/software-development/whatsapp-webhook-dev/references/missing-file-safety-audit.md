# Missing-File Safety Audit — HAFJET WhatsApp Bot

## Audit Date: 2026-06-28

## Question

Does the bot crash (500) if expected files like `knowledge.txt`, `business_info.py`, `system_prompt.txt`, or `.env` are missing?

## Method

Searched all 4 Python modules for file I/O patterns:
```bash
grep -n "knowledge\|business_info\|system_prompt\|\.env\|open(\|read(\|load(" *.py
```

## Findings

### Files Referenced in Code

| File | Referenced? | Guarded? |
|------|-------------|----------|
| `.env` | Yes (line 32) | ✅ `os.path.exists()` check before `load_dotenv()` |
| `knowledge.txt` | ❌ No | N/A |
| `business_info.py` | ❌ No | N/A |
| `system_prompt.txt` | ❌ No | N/A |
| `bot_data.db` | Yes (repair_db) | ✅ `os.path.exists()` + try/except with default fallback |

### All File I/O Locations

1. **`webhook_listener.py:32-34`** — `.env` loading:
   ```python
   _env_path = os.path.expanduser("~/.hermes/whatsapp-bot/.env")
   if os.path.exists(_env_path):
       load_dotenv(_env_path, override=False)
   ```
   Safe: only loads if exists, never crashes if missing.

2. **`repair_db.py:103-112`** — JSON DB load:
   ```python
   if os.path.exists(DB_PATH):
       try:
           with open(DB_PATH, encoding="utf-8") as f:
               return json.load(f)
       except (json.JSONDecodeError, IOError):
           log.warning("⚠ DB file corrupted, resetting to defaults")
   return dict(DEFAULT_JOBS)
   ```
   Safe: returns default dict if missing or corrupted.

3. **`repair_db.py:115-119`** — JSON DB save:
   ```python
   os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
   with open(DB_PATH, "w", encoding="utf-8") as f:
       json.dump(db, f, indent=2, ensure_ascii=False)
   ```
   Safe: creates directory if needed.

4. **`db_logger.py`** — SQLite operations only, no file reads.

5. **`hermes_ai.py`** — NO file I/O at all. All business knowledge is hardcoded in `SOUL_CONTEXT` string.

## Conclusion

**No missing-file crash risk.** The bot:
- Has ZERO references to external knowledge/prompt files
- All business knowledge is inline in `SOUL_CONTEXT` constant
- All file I/O is guarded with `os.path.exists()` or try/except
- Free chat depends ONLY on OpenRouter HTTP API (`openrouter/owl-alpha` model)
- Graceful degradation: OpenRouter fails → Hermes CLI (local only) → `None` → caller uses `CANONICAL_FALLBACK`

## Free Chat Pipeline

```
User message
  → should_use_ai() — static pattern check (no files)
  → ask_hermes()
      → _ask_openrouter() — HTTP API call (env vars only, no files)
      → _ask_hermes_cli() — subprocess (local dev only, caught FileNotFoundError)
      → return None
  → caller uses CANONICAL_FALLBACK constant
```

No file dependencies in the entire AI pipeline.
