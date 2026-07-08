# WebSocket Pong Format

## Problem

Backend sends `"pong"` as plain text via `websocket.send_text("pong")`. Frontend processes all WS messages through `JSON.parse(event.data)`, which throws `Unexpected token p, pong is not valid JSON` on every heartbeat.

## Fix

### Backend (webhook_listener.py)
```python
# BEFORE (breaks frontend JSON.parse):
await websocket.send_text("pong")

# AFTER:
await websocket.send_json({"type": "pong"})
```

### Frontend (api.js — connectWebSocket)
```js
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (onMessage) onMessage(data);
  } catch (e) {
    // Ignore non-JSON messages (heartbeat pong, etc.)
  }
};
```

### Frontend (useWebSocket.js — useWebSocket)
```js
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data?.event) handleWsEvent(data);
  } catch (e) {
    // ignore non-JSON (e.g., "pong")
  }
};
```

Do NOT use `console.error()` in the catch block — these are expected heartbeats, not errors.
