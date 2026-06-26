# Azure Startup Initialization Pattern

## Problem
Code that initializes resources in `if __name__ == "__main__"` does NOT run in Azure App Service, because gunicorn imports the module (skipping the `__main__` block). This causes:
- Database tables not created → `sqlite3.OperationalError: no such table: messages`
- Startup probes succeed but all endpoints return 500
- No visible error in logs (error happens on first request, not at import)

## Solution: FastAPI Lifespan / Startup Event

```python
@app.on_event("startup")
async def startup_event():
    """Initialize database and verify connections at startup."""
    init_db()
    log.info("🚀 HAFJET Bot startup complete — DB initialized")
```

This runs when the FastAPI app starts, regardless of how it's launched (gunicorn, uvicorn, direct).

## Azure-Specific Path Detection

```python
import os

_azure_root = os.environ.get("HOME", "")
if _azure_root == "/home/site/wwwroot":
    DB_PATH = os.path.join(_azure_root, "bot_data.db")
else:
    DB_PATH = os.path.expanduser("~/.hermes/whatsapp-bot/bot_data.db")
```

Azure sets `HOME=/home/site/wwwroot`. Detect this to use the correct writable path.

## Common Startup Failures in Azure

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `sqlite3.OperationalError: no such table` | `init_db()` never ran | Use `@app.on_event("startup")` |
| 500 on all endpoints, no error in logs | DB path wrong in Azure | Detect Azure via `HOME` env var |
| Health shows `configured: false` | `load_dotenv(override=True)` destroyed Azure env vars | Only `load_dotenv()` if `.env` exists locally |
| Site starts but `/health` returns generic error page | Startup takes >20s (cold start) | Wait 30s after deploy before testing |

## Deployment Verification Sequence

After `az webapp deploy`:
1. Wait 15-30 seconds for site to start (first start is slow)
2. Test `curl https://app.azurewebsites.net/health` — should return JSON
3. If 500: check `az webapp log download` → extract `containerStream.log` → grep for "Error" or "Traceback"
4. If "no such table": `init_db()` not running → add `@app.on_event("startup")`
5. If "configured: false": env vars not loaded → check `load_dotenv()` pattern

## WebSocket in Azure

FastAPI WebSocket works in Azure App Service, but requires:
- `from fastapi import WebSocket` (or `from starlette.websockets import WebSocket`)
- Azure App Service must have WebSocket enabled (default: on)
- Free F1 tier supports WebSocket but with connection limits

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket):
    await websocket.accept()
    register_ws(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Process...
    except Exception:
        unregister_ws(websocket)
```
