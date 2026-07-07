# Azure Linux App Service: SQLite + FastAPI + Silent Bot Repair

Collected patterns from production debugging on Azure App Service (Linux, Python 3.11).

## SQLite RETURNING incompatibility

Runtime SQLite on Azure may be older than local dev. Do **not** use `RETURNING` clauses.

```python
# ❌ Bad on Azure
cur.execute("INSERT INTO messages (phone, text) VALUES (?, ?) RETURNING id", ...)

# ✅ Good
cur.execute("INSERT INTO messages (phone, text) VALUES (?, ?)", ...)
conn.commit()
new_id = cur.lastrowid
```

Audit before deploy:
```bash
grep -rn "RETURNING" *.py
```

## FastAPI blocking operations

All blocking DB/HTTP calls must use `run_in_executor`:

```python
loop = asyncio.get_event_loop()
result = await loop.run_in_executor(None, blocking_func, args)
```

WebSocket broadcasts must NOT be called from inside executor threads. Call after `await run_in_executor(...)` completes.

## Silent bot repair checklist

1. `send_whatsapp_message` retry: max 3 retries for 502/503/504/timeout with `backoff = 2 ** attempt`.
2. AI timeout guard: `await asyncio.wait_for(loop.run_in_executor(...), timeout=75)`.
3. Return value check: `sent = await send_whatsapp_message(...)`; if `not sent`, log error and skip outbound log.
4. Pre-AI log: `log.info(f"🤖 Routing to Hermes AI: '{message[:50]}'")`.

## ZIP packaging rule

`build_zip.py` must exclude: `.git`, `__pycache__`, `.venv`, `.env`, `node_modules`, `.db`, `*.zip`, `logs/`.
Always include `repair_db.py` and `dashboard/dist/`.
Verify ZIP before deploy: `python3 -c "import zipfile; print('\n'.join(z.namelist()))" < deploy.zip`

## Verification pattern

Save curl test scripts as `.py` in repo root for repeatable verification:

```python
import json, subprocess
base = "https://hafjet-whatsapp-bot.azurewebsites.net"
# ... login + test filters + assign
```

Run: `python3 s2f5_test.py`

Confirm `/health` returns expected keys before claiming success.
