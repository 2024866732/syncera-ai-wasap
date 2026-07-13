# Operational Health Checks & Bot Code Location

## Bot Code Location (Common Confusion)

The **production bot code** lives at:
```
/home/hafizi145/.hermes/whatsapp-bot/
```

This is a standalone git repo (branch: `main`), NOT inside `syncera-ai-wasap/`. The `syncera-ai-wasap/bots/hafjet-azure/` directory contains an older copy that may be stale.

Key files in production:
| File | Purpose |
|------|---------|
| `webhook_listener.py` | Main FastAPI app (131KB, v2.0 hybrid AI + static menu) |
| `db_logger.py` | SQLite logging layer (75KB) |
| `hermes_ai.py` | Hermes Agent AI integration |
| `repair_db.py` | Repair job tracking |
| `bot_data.db` | Production database (120KB) |
| `dashboard/dist/` | Vite-built SPA (index.html + JS/CSS bundles) |

## Health Check Response Format

`GET /health` returns:
```json
{
  "status": "ok",
  "service": "HAFJET WhatsApp Bot v2.0",
  "timestamp": "2026-07-12T17:33:51+08:00",
  "configured": true,
  "features": ["hybrid_ai", "repair_tracking", "static_menu", "dashboard", "db_logging"],
  "stats": {
    "total_inbound": 67, "total_outbound": 67,
    "today_inbound": 0, "today_outbound": 0,
    "total_customers": 2,
    "avg_latency": 14862.77,
    "fallback_count": 10, "date": "2026-07-12"
  }
}
```

## Dashboard Routing

- **SPA**: `GET /dashboard/` → serves `dist/index.html` (Vite build)
- **API**: `GET /api/stats` → JSON stats (NOT `/dashboard/api/stats`)
- **Logs**: `GET /api/logs` may return HTML if no matching route — use `/api/stats` instead

The dashboard SPA loads assets from `/dashboard/assets/index-<hash>.js` and `/dashboard/assets/index-DrejfP5x.css`.

## Safe Restart Pattern (Azure)

Use `az webapp stop` + `az webapp start` (NOT `az webapp restart`):
```bash
az webapp stop --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
sleep 3
az webapp start --name hafjet-whatsapp-bot --resource-group hafjet-bot-rg
```

Wait 10-15s for cold start before health check:
```bash
curl -s https://hafjet-whatsapp-bot.azurewebsites.net/health | python3 -m json.tool
```

## Local DB Cleanup Pattern

Test/scratch databases accumulate in `~/.hermes/whatsapp-bot/`:
```
monitor_db.db        1012K   ← monitoring scratch
test_db.db           1012K   ← test run
test_db2.db          1012K   ← test run
prod_check_session.db 1008K  ← debug session
prod_db_check.db     1008K   ← debug session
prod_db_check2.db    1008K   ← debug session
prod_db_check3.db    1008K   ← debug session
verify_db.db         1012K   ← verification scratch
```

**Only `bot_data.db` (120KB) is the production DB.** The rest are safe to remove — but always get explicit approval first.
