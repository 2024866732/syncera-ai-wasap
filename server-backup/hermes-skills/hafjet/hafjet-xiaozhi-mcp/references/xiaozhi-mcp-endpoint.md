# XiaoZhi MCP Endpoint — research & verification notes (2026-07-20)

## Endpoint format
Seller gave: `wss://api.xiaozhi.me/mcp/?token=eyJ...<JWT>`
- This IS the official MCP endpoint (same shape as `server.mcp_endpoint` in
  xiaozhi-server `config.yaml`, and the `mcp_endpoint` console field).
- Token is a JWT (userId / agentId / endpointId / purpose="mcp-endpoint" / exp).
  Treat as secret — **rotate after PoC** (anyone with it can register tools on
  Tuan's agent).
- We do NOT run xiaozhi-server / mcp-endpoint-server. The endpoint is hosted by
  xiaozhi.me; we connect to it.

## CRITICAL: role is SERVER, not client
The `mcp_pipe.py calculator.py` example is a *server* that registers a tool;
xiaozhi.me connects as the *client* and pulls `tools/list` + calls `tools/call`.
So **our bridge is the MCP SERVER** over the websocket transport.

From `xiaozhi-esp32-server/docs/mcp-endpoint-integration.md`:
```
export MCP_ENDPOINT=ws://192.168.1.25:8004/mcp_endpoint/mcp/?token=abc
python mcp_pipe.py calculator.py
```
`calculator.py` defines tools and answers calls — that is the server side we
replicate. Confirmed by `xiaozhi-mcp-proxy`, `xinnan-tech/mcp-endpoint-server`.

## Verified import facts (mcp 1.28.1, installed 2026-07-20)
- `from mcp.client.websocket import websocket_client` → EXISTS.
- `ws_client` → does NOT exist (the earlier draft name was wrong).
- Other symbols in the module: `ws_connect` (alias to
  `websockets.asyncio.client.connect`), `Subprotocol`, `SessionMessage`,
  `MemoryObjectReceiveStream/ SendStream`.
- `websocket_client(url)` is an async context manager yielding
  `(read_stream, write_stream)` — feed these into `mcp.server.lowlevel.Server.run()`.
- It is decorated `@deprecated` ("will be removed in mcp 2.0; WebSocket was
  never part of the MCP specification"). For the PoC it works; if a future SDK
  bump removes it, switch to streamable-http transport or fallback B.

## Correct connection shape (Blueprint A)
```python
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.models import InitializationOptions
from mcp.client.websocket import websocket_client

app = Server("hafjet-bridge")
@app.list_tools()
async def list_tools(): return [types.Tool(name="hafjet_status", ...)]
@app.call_tool()
async def call_tool(name, arguments): return types.CallToolResult(...)

async with websocket_client(MCP_ENDPOINT) as (r, w):
    await app.run(r, w, InitializationOptions(
        server_name="hafjet-bridge", server_version="1.0",
        capabilities=types.ServerCapabilities(tools=types.ToolsCapability(listChanged=False))))
```
Do NOT use `ClientSession` — that is the client role and cannot receive
`tools/list` from the peer.

## How to obtain the endpoint (xiaozhi.me UI) — Tuan does this
1. Login xiaozhi.me → agent bound to the seller token.
2. Agent management → 配置角色 / Edit Character → 编辑功能 (Edit Functions).
3. At the bottom: **MCP接入点 (MCP Endpoint)** → copy the address.
4. If hidden: 参数字典 → 系统功能配置 → tick **MCP接入点** → save.
5. After the bridge connects, return to console and **refresh MCP status** to
   see `hafjet_status`.
6. DO NOT change OTA / device endpoint — device stays on official xiaozhi.me.

## Tool call flow (JSON-RPC)
1. Bridge connects to `wss://api.xiaozhi.me/mcp/?token=...` as a server.
2. xiaozhi.me `initialize` → session ready.
3. xiaozhi.me pulls `tools/list` → we advertise `hafjet_status`
   `{name, description, inputSchema:{type:"object",properties:{}}}`.
4. Device says e.g. "apa status Hermes?" → xiaozhi.me LLM emits
   `{method:"tools/call", params:{name:"hafjet_status", arguments:{}}}`.
5. Bridge returns CallToolResult: `{content:[{type:"text",text:"..."}], isError:false}`
   (or `isError:true` on failure, per Tuan's audit spec).

## Server-side reference (xiaozhi-esp32-server, for context only)
`core/providers/tools/server_mcp/mcp_client.py` supports transports:
`command` (stdio), `url` with `transport: sse | streamable-http`.
We only connect to xiaozhi.me's hosted endpoint; we do not run this server.

## Docs / repos found
- xiaozhi-esp32-server/docs/mcp-endpoint-integration.md (calculator example)
- xiaozhi-esp32-server/docs/mcp-endpoint-enable.md (enable mcp_endpoint-server)
- xiaozhi-esp32-server/docs/mcp-get-device-info.md (device_id in prompt)
- Seeed Studio wiki: /mcp_endpoint/, /mcp_external_system_integration/
- xiaozhi.dev/en/docs/development/mcp/
- github.com/xinnan-tech/mcp-endpoint-server (ws registry / mcp_pipe.py)
- github.com/maojindao55/xiaozhi-mcp-proxy (wss://api.xiaozhi.me/mcp/ pattern)
