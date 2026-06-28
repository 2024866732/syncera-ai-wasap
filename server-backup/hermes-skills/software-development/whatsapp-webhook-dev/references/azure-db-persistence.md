# Azure App Service — SQLite DB Persistence

## Problem

`/home/site/wwwroot/` is **ephemeral** on Azure App Service Linux. Each redeploy or container restart may wipe files. SQLite DBs placed there are lost.

## Solution: Use `/home/data/` for Persistent Storage

Azure App Service Linux preserves `/home/` across container restarts and deploys. Use a subdirectory like `/home/data/` for persistent files.

### Code Pattern

```python
# db_logger.py
import os

_is_azure = bool(os.environ.get("WEBSITE_SITE_NAME"))
if _is_azure:
    DB_PATH = "/home/data/bot_data.db"
    os.makedirs("/home/data", exist_ok=True)
else:
    DB_PATH = os.path.expanduser("~/.hermes/whatsapp-bot/bot_data.db")
```

### Key Points

1. **`/home/data/` is persistent** — survives container restarts and redeploys
2. **`/home/site/wwwroot/` is ephemeral** — reset on every Oryx build
3. **Always `os.makedirs()`** — the directory may not exist on first cold start
4. **Set Azure app setting** `DB_PATH=/home/data/bot_data.db` to match (optional, code default is sufficient)
5. **Exclude `bot_data.db` from deploy ZIP** — local stale DB would overwrite production data

### Migration Note

When changing DB paths, the new path starts with an empty DB. Existing data at the old path is NOT automatically migrated. 

**⚠ Data loss is IMMEDIATE on redeploy.** Once you change `DB_PATH` and redeploy, Oryx wipes `/home/site/wwwroot/` (including the old DB). The new DB at `/home/data/` starts empty. There is no window to copy old → new after the deploy.

**To preserve existing data, you MUST migrate BEFORE changing the code:**
1. SSH into the running container (`az webapp ssh`) while old code is still running
2. Use Python ATTACH to copy data: `sqlite3` ATTACH both databases, then `INSERT OR IGNORE INTO new.table SELECT * FROM old.table`
3. Verify row counts match
4. THEN change `DB_PATH` in code and redeploy

**If container is already redeployed with new path** (as in 2026-06-28 session), old data at `/home/site/wwwroot/bot_data.db` is **gone** — Oryx wiped it. Accept fresh start or restore from backup.

Or accept fresh start if data is non-critical (dev/testing).

## Session Evidence (2026-06-28)

- Old path: `/home/site/wwwroot/bot_data.db` — data reset on every redeploy
- New path: `/home/data/bot_data.db` — persistent
- Confirmed: `✅ Database initialized at /home/data/bot_data.db` in startup logs
- Confirmed: `Site startup probe succeeded` after path change
- Confirmed: `HTTP 200` on `/health` after redeploy with new path
