# WebSocket Debugging — FastAPI Type Annotation Bug

## The 403 Problem

When `@app.websocket("/ws")` returns HTTP 403 with empty body on Azure (or locally), the root cause is **NOT** an Azure tier limitation — it's a **missing type annotation** on the FastAPI handler parameter.

## Root Cause

When using `@app.websocket("/ws")`, the handler parameter **MUST** have a `WebSocket` type annotation:

```python
# ❌ BROKEN — triggers 403:
@app.websocket("/ws")
async def websocket_endpoint(websocket):
    await websocket.accept()

# ✅ FIXED — works:
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
```

**Why it happens:** Without the type annotation, FastAPI treats `websocket` as a **query parameter** (not the ASGI WebSocket object). Pydantic validation fails with "Field required" for the missing `?websocket=` query param. FastAPI then sends `websocket.close` with code 1008, which uvicorn logs as HTTP 403.

**Evidence from middleware logging:**
```
{'type': 'websocket.close', 'code': 1008, 'reason': [{'type': 'missing', 'loc': ['query', 'websocket'], 'msg': 'Field required', 'input': None}]}
```

## Diagnostic Steps

### 1. Confirm it's not platform-specific
```bash
# Test locally — if it fails here too, it's NOT Azure
python3 -c "
import uvicorn, threading
from fastapi import FastAPI, WebSocket
app = FastAPI()
@app.websocket('/ws')
async def ws(websocket: WebSocket):  # Try with and without annotation
    await websocket.accept()
    await websocket.send_json({'msg': 'hello'})
uvicorn.run(app, host='127.0.0.1', port=9999, log_level='warning')
"

# In another terminal:
python3 -c "
import asyncio, websockets
async def test():
    try:
        async with websockets.connect('ws://127.0.0.1:9999/ws') as ws:
            msg = await ws.recv()
            print('OK:', msg)
    except Exception as e:
        print('FAILED:', e)
asyncio.run(test())
"
# If 403 → confirmed: code bug, not platform
```

### 2. Confirm handler never runs
Add `print('WS HANDLER CALLED', flush=True)` as the first line of your WebSocket handler. If it doesn't print, the rejection happens before ASGI dispatch.

### 3. Use middleware to intercept the error
```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.websockets import WebSocket

class WSDebugMiddleware:
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            async def debug_send(message):
                print(f"[WS] send: {message}")  # This reveals the close reason
                await send(message)
            await self.app(scope, receive, debug_send)
        else:
            await self.app(scope, receive, send)

app.add_middleware(WSDebugMiddleware)
```

### 4. Check the error message
The middleware will reveal the exact error:
```
{'type': 'websocket.close', 'code': 1008, 'reason': [{'type': 'missing', 'loc': ['query', 'websocket'], 'msg': 'Field required'}]}
```

## The Fix

**Add the `WebSocket` type annotation:**
```python
from fastapi import FastAPI, WebSocket

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):  # ← THIS fixes it
    await websocket.accept()
    # ... rest of handler
```

## Optional: Use wsproto Backend

The default `websockets` backend works fine with the type annotation fix. For a lighter alternative:

```bash
# requirements.txt
wsproto==1.3.2
```

```bash
# startup command
gunicorn -w 1 -k uvicorn.workers.UvicornWorker webhook_listener:app --bind 0.0.0.0:8000 --ws wsproto
```

## Key Lesson

**Never assume platform limitation without local reproduction.** Always:
1. Reproduce locally first with `uvicorn.run()` + raw websockets
2. Use middleware to intercept the actual error message
3. Check handler code execution (print debugging)
4. Read the error reason — Pydantic validation errors are not network/tier issues

## Common Mistake

Do NOT patch uvicorn internals (`websockets_impl.py` `check_request`). This was a red herring in earlier investigations — the patch happened to change header parsing which masked the real issue but didn't fix it. The type annotation is the **only** correct fix.
