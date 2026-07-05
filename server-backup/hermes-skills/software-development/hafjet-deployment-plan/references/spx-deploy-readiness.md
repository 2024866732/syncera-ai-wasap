# SPX Self-Collection Deploy Readiness

Use this checklist when deploying the SPX reminder integration for HAFJET WhatsApp Bot.

## Business/Timezone Rules

- Server timezone stays UTC.
- Send-window and all business time checks use `ZoneInfo("Asia/Kuala_Lumpur")`.
- Send window: 08:00–21:00 MYT.
- Daily cap: 60 sends/day.
- No Sunday guard.

## Data Source Constraints

- SPX list CSV export likely masks `recipient_phone`.
- Phone source must be `POST /sp-api/order/show_secret` with valid session cookies.
- `entity_id` comes from order list integer `id` field, NOT `co_num`.

## Rate Limits

- 0.3s between list page fetches.
- 0.5s between phone reveal calls.

## Security

- Session cookies stored only in `spx_session` table.
- Never log full cookies.
- 401 from SPX API must return `{"error":"SPX_SESSION_EXPIRED"}`.

## Build Verification

```bash
# Confirm latest SPXOrders.jsx changes are in bundle
stat -c '%y' dashboard/src/components/SPXOrders.jsx dashboard/dist/assets/index-*.js
# src mtime must be <= dist mtime
```

## Pre-Deploy Verification

| Check | Expected |
|---|---|
| `python3 -m py_compile db_logger.py webhook_listener.py` | OK |
| `/dashboard` serves `index.html` | 200 |
| `/dashboard/assets/*.js` | 200 |
| `GET /api/spx/session-status` | JSON, no cookie leak |
| `POST /api/spx/sync` with expired session | `SPX_SESSION_EXPIRED` |
| Timezone guard logs show MYT + UTC | `Outside Malaysia send window: HH:MM MYT (server UTC HH:MM)` |

**Pitfall:** If `/api/spx/session-status` returns **404** in production while `/health` and `/dashboard` return 200, this means the route is missing from the deployed runtime — not an auth failure (which would return **401**). Use this quick diagnostic:

| Status | Meaning | Action |
|--------|---------|--------|
| **200** | Route live + public | ✅ OK |
| **401** | Route live, auth required | ✅ Verify auth headers |
| **404** | Route NOT registered | ❌ Stale artifact / partial deploy |
| **503/timeout** | App not ready | Check startup logs |

Likely causes of 404: stale ZIP / Oryx cache, or import error during startup that prevents the route module from loading. Rebuild ZIP and redeploy with `SCM_DO_BUILD_DURING_DEPLOYMENT=true`. Verify source line exists in deployed file via Kudu if needed.

## Cookie Lifecycle

- Staff paste cookies in dashboard textarea.
- Click Save & Test → POST `/api/spx/session`.
- Expired → UI shows `SPX_SESSION_EXPIRED`.
- Sync does not expose cookies in UI beyond the input textarea.
