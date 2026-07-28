# Kudu ZIP Deploy Safety — Critical Lessons (2026-07-28)

## The Incident
**Date:** 2026-07-28  
**Action:** `curl -X PUT "https://hafjet-whatsapp-bot.scm.azurewebsites.net/api/zip/site/wwwroot/dashboard/dist/" --data-binary @dashboard.zip`  
**Result:** Entire `/site/wwwroot/` **wiped** — backend files (`webhook_listener.py`, `db_logger.py`, `hermes_ai.py`, `start.sh`, `requirements.txt`, `spx_followup.py`) gone → app returned **503 Application Error**  
**Root cause:** Kudu ZIP API at `/api/zip/site/wwwroot/<subdir>/` **extracts to root**, not subdirectory. All files in zip end up at `/site/wwwroot/`, overwriting everything.

---

## Safe Deployment Patterns

| Target | Method | Command Template |
|--------|--------|------------------|
| **Frontend assets** (`dashboard/dist/`) | VFS per-file | `curl -X PUT "https://.../api/vfs/site/wwwroot/dashboard/dist/<file>" --data-binary @<local>` |
| **Frontend assets** (bulk) | ZIP to subdir | `curl -X PUT "https://.../api/zip/site/wwwroot/dashboard/dist/" --data-binary @dist.zip` |
| **Single backend file** | VFS | `curl -X PUT "https://.../api/vfs/site/wwwroot/hermes_ai.py" --data-binary @hermes_ai.py` |
| **Multiple backend files** | ZIP to root (with ONLY backend files) | `curl -X PUT "https://.../api/zip/site/wwwroot/" --data-binary @backend-only.zip` |
| **Mixed frontend + backend** | **NEVER** — deploy separately | 1. Deploy backend via VFS or backend-only ZIP<br>2. Deploy frontend via subdir ZIP |

---

## Why VFS for Backend Files
- Atomic per-file
- No risk of wiping other files
- 412 (If-Match) failure means file locked — stop app first: `az webapp stop` then upload

---

## Recovery Checklist (when ZIP wipes root)
1. `az webapp stop --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg`
2. Upload each critical backend file via VFS:
   - `webhook_listener.py`
   - `db_logger.py`
   - `hermes_ai.py`
   - `requirements.txt`
   - `start.sh`
   - `spx_followup.py`
   - `spx_sync.py` (if exists)
   - `hermes_ai.py`
3. Re-upload frontend via subdir ZIP: `PUT /api/zip/site/wwwroot/dashboard/dist/`
4. `az webapp start --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg`
5. Verify `/health` → 200

---

## Key Files That Must Exist in `/site/wwwroot/`
| File | Purpose |
|------|---------|
| `start.sh` | Azure startup script (runs pip install + gunicorn) |
| `requirements.txt` | Python deps |
| `webhook_listener.py` | FastAPI app entrypoint |
| `db_logger.py` | SQLite CRUD |
| `hermes_ai.py` | AI routing (now with Sarah) |
| `spx_followup.py` | SPX reminder logic |
| `bot_data.db` | **NOT in wwwroot** — lives in `/home/data/bot_data.db` (persistent volume) |

---

## Prevention Rule
> **Never use Kudu ZIP API targeting root (`/api/zip/site/wwwroot/`) with mixed content.**  
> If you must use ZIP for backend, zip ONLY backend files. Better: use VFS per-file for backend.

---

## Reference
- Session: 2026-07-28 Sarah deployment
- Skill: `hafjet-sales-advisor-prompt` (software-development)
- Related: `hafjet-deployment-procedure` skill