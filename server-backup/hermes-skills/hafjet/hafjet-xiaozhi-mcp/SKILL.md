---
name: hafjet-xiaozhi-mcp
description: "Integrate xiaozhi-esp32-based devices (e.g. the ZUOWEI portable AI assistant Tuan Hafizi bought) with Hermes Agent via the OFFICIAL xiaozhi.me MCP endpoint — keep voice/ASR/TTS on xiaozhi.me, use Hermes only as the MCP tool-brain. Covers the client-only bridge pattern, endpoint format, and the Phase-1 PoC skeleton (hafjet_status)."
version: 1.0.0
author: Hermes-HAFJET
license: MIT
---

# HAFJET × XiaoZhi MCP Integration

Link a **xiaozhi-esp32-based device** (the ZUOWEI "4th Gen AI Smart Assistant"
Tuan Hafizi bought is one) to **Hermes Agent** through the **official
xiaozhi.me MCP endpoint** — WITHOUT self-hosting a server.

## When to use
- Tuan bought / wants to extend a xiaozhi-esp32 device and link it to Hermes.
- Goal: device keeps its **natural Malay voice** (xiaozhi.me ASR + LLM + TTS);
  Hermes provides **tools / logic** behind it via MCP.
- NOT for: full self-hosted xiaozhi-server deployment (heavier path — see Pitfalls).

## Critical insight (saves hours)
The `wss://api.xiaozhi.me/mcp/?token=...` URL the **seller provides** IS the
MCP endpoint. You do **NOT** run `xiaozhi-server` or `mcp-endpoint-server`.

**ROLE — this is the #1 mistake to avoid:** We PROVIDE tools TO xiaozhi, so
the bridge MUST run as an **MCP SERVER** over the websocket transport. This is
exactly what the `mcp_pipe.py calculator.py` example does — `calculator.py` is
a *server* registering a tool; xiaozhi connects as the *client*. Do NOT use
`ClientSession` (that's the client role and cannot receive `tools/list` from
the peer). Correct shape:
```python
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.models import InitializationOptions
from mcp.client.websocket import websocket_client   # NOTE: websocket_client, not ws_client

app = Server("hafjet-bridge")
@app.list_tools()
async def list_tools(): return [types.Tool(name="hafjet_status", description="...", inputSchema={"type":"object","properties":{}})]
@app.call_tool()
async def call_tool(name, arguments): return types.CallToolResult(content=[types.TextContent(type="text", text="...")], isError=False)

async with websocket_client(MCP_ENDPOINT) as (read_stream, write_stream):
    await app.run(read_stream, write_stream, InitializationOptions(
        server_name="hafjet-bridge", server_version="1.0",
        capabilities=types.ServerCapabilities(tools=types.ToolsCapability(listChanged=False))))
```
Full working Phase-1 file: `templates/hafjet_bridge.py`.
Confirmed via `xiaozhi-esp32-server/docs/mcp-endpoint-integration.md`
("download 虾哥's mcp-calculator, run `python mcp_pipe.py calculator.py`") and
`xiaozhi-mcp-proxy` / `xinnan-tech/mcp-endpoint-server` repos.

## Architecture (approved by Tuan Hafizi 2026-07-20)
```
[ZUOWEI device] --voice WiFi--> [xiaozhi.me OFFICIAL: ASR+LLM+Malay TTS]
                                     --MCP WebSocket (wss://api.xiaozhi.me/mcp/?token=)
                                              v
                                   [Hermes MCP Bridge]  (tiny client, on VM with Hermes)
                                              v   Phase1: read Hermes env (ps / state.db)
                                                  Phase2: call Hermes tools (api server :8642)
                                   [Hermes Agent]  (NO restart, NO deploy)
```

## HARD safety constraints (from hafjet-command-safety)
- **Do NOT** change the device OTA / endpoint to self-host without explicit approval.
- **Do NOT** restart the production Hermes gateway.
- **Do NOT** write to `~/.hermes/.env` — suggest the lines, Tuan edits via `nano`.
- **Do NOT** self-host xiaozhi-server unless Tuan explicitly pivots (he did NOT).
- A BLOCKED command = stop, don't retry/rephrase (see hafjet-command-safety).

## MCP tool result format (audit-friendly, Tuan's spec)
Always return a `CallToolResult`-shaped dict:
- success: `{"content":[{"type":"text","text":"..."}], "isError": false}`
- error:   `{"content":[{"type":"text","text":"..."}], "isError": true}`
Use a `make_tool_result(text, is_error=False)` helper so both shapes stay
consistent. On ANY exception in a tool, return `isError:true` (not plain text).

## Phase-1 PoC (built 2026-07-20)
Single tool `hafjet_status`:
- reads Hermes local state ONLY — `ps -p <gateway_pid>` + read-only `sqlite3`
  on `~/.hermes/state.db` (count sessions).
- returns a short **Malay** string (device speaks it with natural xiaozhi TTS).
- no network call to Hermes yet (proves the MCP link works end-to-end).
- Phase 2: enable Hermes API server (localhost:8642) to call real Hermes tools.

Skeleton: `templates/hafjet_bridge.py`. Research notes:
`references/xiaozhi-mcp-endpoint.md`.

## Implementation choice (verify at install time)
- **A (preferred):** SDK MCP official WebSocket transport, **SERVER role** —\n  `from mcp.client.websocket import websocket_client` (NOT `ws_client` — that\n  name does NOT exist) + `mcp.server.lowlevel.Server`. Needs `mcp` +\n  `websockets` only. On mcp 1.28.1 `websocket_client` exists but is marked\n  **deprecated** (slated for removal in mcp 2.0; XiaoZhi uses WebSocket as a\n  non-spec extension). Still works for the PoC; if a future SDK bump removes\n  it, switch to streamable-http transport or fallback B.\n- **B (fallback):** `mcp_pipe.py` / bridge-proxy pattern from\n  `xinnan-tech/mcp-endpoint-server` if `websocket_client` is absent in the\n  pinned SDK version. Both reuse the same `hafjet_status` + `make_tool_result`.\n\n### How to verify choice A after install (read-only import check)
```bash
. ~/hafjet-mcp-bridge/.venv/bin/activate
python3 -c "from mcp.client.websocket import websocket_client; print('A-OK')"
```
If `ImportError`, inspect available names: `python3 -c "import mcp.client.websocket as w; print([n for n in dir(w) if not n.startswith('__')])"`\n→ expect `websocket_client`, `ws_connect`, `Subprotocol`. Report result; do NOT\nauto-fallback to B without Tuan's approval.

## Minimum packages (PoC only)
- **Required:** `mcp`, `websockets`
- **Optional:** `fastmcp` (high-level, not needed)
- **Fallback:** `xinnan-tech/mcp-endpoint-server` client
- Stdlib (no install): `asyncio`, `sqlite3`, `subprocess`, `os`

## Observability-first PoC (Tuan's explicit rule — 2026-07-20)
For the FIRST smoke test, **observability matters more than speed**. Add minimum
structured logging at these 8 points BEFORE running (token must NEVER be
printed — always redact as `***`):
1. before resolving/connecting to MCP endpoint
2. after WebSocket connect succeeds (`[2] WebSocket connected ...`)
3. after MCP initialize / server startup (`[3] MCP server starting ...`)
4. after `hafjet_status` is registered/available (also log on `tools/list`)
5. when `tools/call` received (`[5] tools/call received: name=...`)
6. when success result sent (`[6] tool success result sent: ...`)
7. when error result sent (`[7] tool error result sent: ...`)
8. on shutdown / any exception (`[8] exception ...` / `[shutdown] ...`)
Use `logging.basicConfig(level=INFO, fmt="%(asctime)s %(levelname)s %(name)s %(message)s")`
and a module logger. Wrap `main()` in try/except for `KeyboardInterrupt` +
`Exception` + `SystemExit` so every exit path is audited. The committed
`templates/hafjet_bridge.py` already includes all 8 points — copy it as-is.
Expected normal log tail when the device asks "apa status Hermes?":
```
[5] tools/call received: name=hafjet_status
[6] tool success result sent: Hermes gateway sedang berjalan. 12 sesi aktif direkodkan.
```
On token/auth failure the bridge logs `[8] exception in bridge: ... HTTP 401`
(or `SystemExit` if `XIAOZHI_MCP_TOKEN`/`XIAOZHI_MCP_ENDPOINT` unset).

## Secret injection: the `run.env` pattern (Option B)
The bridge needs `XIAOZHI_MCP_TOKEN` in env. The agent's terminal is
**non-interactive**, so the user cannot `export` mid-session. Settled flow:
1. User writes the token himself into `~/hafjet-mcp-bridge/run.env`
   (`XIAOZHI_MCP_TOKEN=***`). Agent NEVER writes this file, NEVER prints the
   value, NEVER dumps its contents, NEVER copies the token elsewhere.
2. Agent confirms file exists (safe check, no content read):
   `test -f ~/hafjet-mcp-bridge/run.env && echo OK || echo MISSING`
   If MISSING → STOP, do not load/run, wait for user.
3. Load + run in one shell:
   `set -a; . ~/hafjet-mcp-bridge/run.env; set +a; python3 /tmp/hafjet_bridge.py`
4. Foreground only (no background, no `nohup`). `Ctrl+C` = clean stop.
Alternative options considered: (A) paste token in chat as a CLI arg
(leaks in chat log + process args — reject; rotate if ever used), (C) user runs
the command himself on the VM. Option B chosen as the safe default.

## Pitfalls
- **Server role, not client.** The bridge registers tools FOR xiaozhi → it is
  an MCP *server* over the websocket transport (`Server.run`). Do not reach for
  `ClientSession` (client role) — it cannot receive `tools/list` from the peer.
- **Import name is `websocket_client`, NOT `ws_client`.** `ws_client` does not
  exist; on mcp 1.28.1 the symbol is `websocket_client` and is deprecated.
- **Seller MCP token pasted in chat → rotate it after PoC** (anyone with it can
  register tools on Tuan's agent).
- **VM disk was 92% full (27G/29G)** — bridge is ~MB so usually fine, but a
  combined delete+install can get BLOCKED by the safety gate. Split steps; do
  NOT chain a destructive delete with a long install in one command.
- **Don't self-host just to "link"** — the official endpoint already enables
  MCP tools. Keep the device on the official server unless Tuan explicitly
  says otherwise; self-hosting loses xiaozhi.me's natural Malay voice.
- **Phased approval workflow (Tuan's standing rule for this skill).** Build as a
  *design artifact first*: skeleton → review → patch small fixes → install+verify
  (separate approval) → write real main loop → review → only THEN run (separate
  approval). Never run, never connect, never set env, never write `.env` during
  design phase. A BLOCKED command = stop, don't retry/rephrase.

## xiaozhi.me UI steps (Tuan does; agent never touches the console)
1. Login xiaozhi.me → agent that is bound to the seller token.
2. Agent management → 配置角色 (Configure Character) → 编辑功能 (Edit Functions)
   (button to the right of 意图识别 / Intent Recognition).
3. At the bottom of that page is **MCP接入点 (MCP Endpoint)** → copy the address
   (= `wss://api.xiaozhi.me/mcp/?token=...`). If not visible, go to 参数字典 →
   系统功能配置 → tick **MCP接入点** → save.
4. After the bridge connects, return to the console and **refresh the MCP
   status** to see `hafjet_status` listed.
5. **Do NOT change OTA / device endpoint** — device stays on official xiaozhi.me.

## References
- `references/xiaozhi-mcp-endpoint.md` — endpoint format, server/client role, docs findings, UI steps.
- `references/observability-and-runenv-patterns.md` — the 8-point logging layout, expected/failure log signatures, and the `run.env` secret-injection flow (Option B).
- `templates/hafjet_bridge.py` — Phase-1 working file (server role, `hafjet_status`, `make_tool_result`, and all 8 audit log points already built in).
