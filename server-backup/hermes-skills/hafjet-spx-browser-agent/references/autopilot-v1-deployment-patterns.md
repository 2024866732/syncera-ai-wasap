# Autopilot v1 — Deployment Patterns (CORS, Auth, Timeout)

## CORS Configuration for SPX Origins

Tampermonkey runs on SPX domains (`sp.spx.shopee.com.my`, `spx.co`) but POSTs to HAFJET Azure backend — cross-origin requests get blocked without proper CORS headers.

**Fix:** Add `CORSMiddleware` right after `app = FastAPI()`:

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sp.spx.shopee.com.my",
        "https://sp.spx.shopee.co.id",
        "https://spx.co",
    ],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)
```

**Verification:**
```bash
# OPTIONS preflight must return 200 with Access-Control-Allow-Origin
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X OPTIONS \
  "https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/bulk-map-phones" \
  -H "Origin: https://sp.spx.shopee.com.my" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, X-API-Key"

# POST must return Access-Control-Allow-Origin header
curl -s -D - -o /dev/null -X POST \
  "https://hafjet-whatsapp-bot.azurewebsites.net/api/spx/bulk-map-phones" \
  -H "Origin: https://sp.spx.shopee.com.my" \
  -H "Content-Type: application/json" -H "X-API-Key: ..." \
  -d '[{"tracking":"TEST","phone":"60123456789"}]' | grep -i "access-control"
```

**Pitfall:** CORS errors in the browser console look like network failures. The preflight OPTIONS request silently fails before the actual POST. Always verify with curl first.

## Auth: X-API-Key ONLY for Autopilot Endpoints

The dashboard uses JWT (`Authorization: Bearer ...`) via `Depends(get_current_staff)`. Tampermonkey cannot provide JWT — it only sends `X-API-Key`.

**Critical:** When an endpoint has BOTH middleware (X-API-Key check on `POST /api/spx/*`) AND `Depends(get_current_staff)`, the JWT dependency runs AFTER the middleware and rejects the request.

**Fix — remove JWT dependency for autopilot endpoints:**

```python
# BEFORE (broken for autopilot):
@app.post("/api/spx/bulk-map-phones")
async def api_spx_bulk_map_phones(staff: dict = Depends(get_current_staff)):
    ...

# AFTER (fixed):
@app.post("/api/spx/bulk-map-phones")
async def api_spx_bulk_map_phones(request: Request):
    """Auth: X-API-Key header (DASHBOARD_API_KEY) — validated by middleware.
    No JWT required (autopilot runs from browser, not dashboard)."""
    ...
```

**Response when auth fails:** 401 `{"detail":"Missing or invalid Authorization header"}` → Tampermonkey stops autopilot timer.

**If the endpoint still returns 401 after the code fix:** the gunicorn worker loaded the old file. Do a full stop+start (NOT `az webapp restart`):
```bash
az webapp stop --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
sleep 8
az webapp start --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```

## DASHBOARD_API_KEY Location

The API key is in **Azure App Settings**, NOT in `.env`. Retrieve with:
```bash
az webapp config appsettings list --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg \
  --query "[?name=='DASHBOARD_API_KEY'].value | [0]" -o tsv
```

The same key is used for ALL `X-API-Key` auth: dashboard, Tampermonkey autopilot, autopilot summary plugin.

## PUSH_TIMEOUT_MS Tuning

**Backend latency (measured):** 0.1s for 1 record, 0.9s for 5 records (SQLite WAL, no lock contention).

**Default 15000ms (15s) is too aggressive** for Azure cold-start or transient network stalls. The autopilot `AbortController` kills the fetch before the backend responds on a cold worker.

**Recommendation:** `PUSH_TIMEOUT_MS: 45000` (45s) for rollout. Can drop to 30000 after confirming <1s typical.

**Symptom:** `[AUTOPILOT] Push failed: signal is aborted without reason` + batch enters retry queue.

## Retry Queue Behavior

- In-memory `_retryQueue[]` in Tampermonkey
- Items with `attempt < RETRY_MAX` get retried on next cycle
- Items at `RETRY_MAX` get dropped with `[AUTOPILOT] CRITICAL` log
- Backend idempotent (UPDATE on same tracking is no-op) — safe to retry

## Admin Summary Cron (Backend)

The `_send_autopilot_summary()` runs as an APScheduler job every 60 minutes. It logs `[SPX-SUMMARY]` with metrics.

**Telegram delivery:** A separate Hermes cron job (no_agent=true, script-based) reads Azure logs for `[SPX-SUMMARY]` and forwards to Telegram. Job ID: `938acee3db9b`, script: `~/.hermes/scripts/spx_autopilot_summary.sh`.

**To pause the summary:** `hermes cron pause 938acee3db9b` or via `cronjob action=pause job_id=938acee3db9b`.

## Rollout-Safe Upgrade Checklist

1. Disable v3.2 in Tampermonkey
2. Import v4.0 rollout-safe (`ENABLED: false`, `BATCH_LIMIT: 5`)
3. Replace `API_KEY` placeholder with actual DASHBOARD_API_KEY
4. Reload SPX page → verify `🤖 HAFJET SPX Autopilot v1` in console
5. `__spx_start_autopilot()` → observe Cycle #1
6. Verify push: `[AUTOPILOT] Push: updated=X skipped=Y`
7. Check dashboard: Missing Phones counter decreases
8. After 2-3 successful cycles: edit `ENABLED: true`, increase `BATCH_LIMIT`
9. **Never run v3.2 and v4.0 simultaneously** — both would POST to same endpoint
