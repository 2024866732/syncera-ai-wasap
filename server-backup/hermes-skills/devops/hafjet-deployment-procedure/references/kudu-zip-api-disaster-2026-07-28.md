# Kudu ZIP API Root Overwrite Incident — 2026-07-28

## Summary
Deploying `dashboard/dist/` via Kudu ZIP API `PUT /api/zip/site/wwwroot/dashboard/dist/` **wiped the entire `/site/wwwroot/` directory**, deleting all backend files and `start.sh`, causing immediate 503 Application Error.

## Root Cause
The Kudu ZIP API at `/api/zip/site/wwwroot/<any-path>/` treats the target as the **extraction root**, not a subdirectory. It deletes everything in `/site/wwwroot/` before extracting the ZIP. Even though the ZIP contained only `dashboard/dist/` assets, the API first clears the parent directory.

## Timeline
1. **14:32** — Attempted to deploy dashboard via `curl -X PUT .../api/zip/site/wwwroot/dashboard/dist/ --data-binary @dashboard.zip`
2. **14:33** — `/health` returned 503; Kudu VFS showed `webhook_listener.py`, `db_logger.py`, `requirements.txt`, `start.sh` all 404
3. **14:35** — Confirmed via `az webapp show` state=Running but no backend files
4. **14:36-14:40** — Manual VFS PUT restore of 7 backend files + `start.sh` creation + app restart
4. **14:42** — `/health` 200 restored; dashboard verified

## Files Lost & Restored
| File | Size | Restored Via |
|------|------|--------------|
| webhook_listener.py | 152,949 B | VFS PUT |
| db_logger.py | 146,865 B | VFS PUT |
| hermes_ai.py | ~11 KB | VFS PUT |
| repair_db.py | ~8 KB | VFS PUT |
| spx_followup.py | ~8 KB | VFS PUT |
| requirements.txt | ~500 B | VFS PUT |
| start.sh | 364 B | Created fresh (was missing) |
| bot_data.db | N/A | Safe at `/home/data/` (outside wwwroot) |

## Safe Deployment Pattern for Dashboard
```bash
# WRONG — wipes wwwroot
curl -X PUT "https://APP.scm.azurewebsites.net/api/zip/site/wwwroot/dashboard/dist/" --data-binary @dist.zip

# RIGHT — file-by-file VFS PUT (atomic index.html last)
for f in dist/index.html dist/assets/*; do
  rel=${f#dist/}
  curl -X PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: *" \
    --data-binary @"$f" "https://APP.scm.azurewebsites.net/api/vfs/site/wwwroot/dashboard/dist/$rel"
done
```

## Lessons
1. **ZIP API is for full-site deploys only** — never target a subdirectory
2. **Dashboard assets ≠ full deploy** — treat them as static files, not a site
3. **Keep `start.sh` in git** — it was recreated from memory during recovery
4. **DB at `/home/data/` is safe** — ZIP deploy never reaches it
5. **VFS PUT with `If-Match: *`** is the reliable single-file method