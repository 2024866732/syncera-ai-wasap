---
name: hafjet-xiaozhi-integration
description: "Link Tuan Hafizi's XiaoZhi-based device (ZUOWEI-70DD, xiaozhi-esp32 firmware) to Hermes Agent as an MCP tool-brain via the OFFICIAL xiaozhi.me MCP endpoint. Covers the locked decision (keep device on official server, preserve natural Malay TTS), MCP endpoint format, the lightweight bridge pattern, and the phased PoC. Use whenever integrating a XiaoZhi/ESP32 voice device with Hermes."
version: 1.0.0
author: Hermes-HAFJET
license: MIT
---

# HAFJET XiaoZhi ↔ Hermes Integration

## When to use
- Tuan Hafizi wants his **ZUOWEI-70DD** (or any xiaozhi-esp32 device) to talk to Hermes.
- Task mentions "XiaoZhi", "xiaozhi.me", "ZUOWEI", "ESP32 AI companion", "MCP endpoint", or linking the voice device to Hermes tools.

## 🔒 LOCKED DECISION (2026-07-20 — do not revisit without explicit override)
The user **redirected** away from the self-host path mid-session. Hard rules:
1. **KEEP the device on the official xiaozhi.me server.** Do NOT reflash, do NOT point OTA at a self-hosted server, do NOT change the device/OTA endpoint. Reason: preserves the natural (non-robotic) Malay voice + character persona the official server provides.
2. **Hermes is a TOOL-BRAIN only**, reached through the official **MCP endpoint**. Hermes is never the voice/ASR/TTS engine.
3. **NO production gateway restart.** Do NOT enable `hermes-api-server` or restart the Hermes gateway for Phase 1. The bridge can read Hermes local state (ps / `~/.hermes/state.db`) without the API server.
4. **NO self-hosted xiaozhi-server deployment.** The heavy `xiaozhi-esp32-server` (torch/funasr/SenseVoice) is NOT installed/run. (Repo was cloned to `~/xiaozhi-server` for RESEARCH ONLY — it is a 1.6GB dir that bloats the 92%-full disk; see Pitfalls.)

## Architecture (official route — preferred)
```
[ZUOWEI device]
   │  WiFi → xiaozhi.me (ASR + LLM + Malay TTS, kekal)
   ▼
[xiaozhi.me official MCP endpoint]   wss://api.xiaozhi.me/mcp/?token=<seller_token>
   ▼
[Hermes MCP Bridge]  (small Python, on the SAME VM as Hermes)
   │  reads Hermes local state / (Phase 2+) calls Hermes tools
   ▼
[Hermes Agent]  (no restart, no API server for Phase 1)
```
The seller-provided `wss://api.xiaozhi.me/mcp/?token=...` IS the official MCP endpoint — same format as the `mcp_endpoint` config in xiaozhi-server docs. So we do NOT need to run `xiaozhi-server` or `mcp-endpoint-server`. We build the equivalent of `mcp-calculator` (a client that connects and registers tools).

## How MCP works in the XiaoZhi ecosystem (from repo docs)
- Endpoint format: `ws://<host>:<port>/mcp_endpoint/mcp/?token=<tok>` (official uses `wss://api.xiaozhi.me/mcp/?token=...`).
- A "calculator" example (docs/mcp-endpoint-integration.md): set `MCP_ENDPOINT=ws://.../?token=...`, then `python mcp_pipe.py calculator.py`. The server lists tools; on device connect it logs `支持的工具数量` and the function list appears in the agent's available tools.
- `core/providers/tools/server_mcp/mcp_client.py` shows the xiaozhi-server side accepts **three transports**: `command` (stdio), `url` with `transport: sse` (default), or `transport: streamable-http`. A client just needs to speak MCP JSON-RPC over WebSocket.
- xiaozhi.me UI: Agent management → 配置角色 → 编辑功能 → bottom has **MCP接入点** showing the agent's MCP address. Enable via 参数字典 → 系统功能配置 → tick MCP接入点.

## Hermes MCP Bridge — skeleton (Phase 1 PoC)
Goal: one tool `hafjet_status` that, when called from XiaoZhi, queries Hermes local state and returns a short string. Proves the official server can reach Hermes via MCP.
```python
# ~/hafjet-mcp-bridge/hafjet_bridge.py  — SKELETON, do not run without approval
import asyncio, os
from mcp.client.websocket import ws_client   # fallback: xinnan-tech/mcp-endpoint-server client lib
from mcp import ClientSession, Implementation

OFFICIAL_MCP = "wss://api.xiaozhi.me/mcp/?token=" + os.getenv("XIAOZHI_MCP_TOKEN")

async def hafjet_status(args: dict) -> str:
    # Phase 1: read Hermes local state only (no API server needed)
    # e.g. check `ps` for gateway pid 607547, count sessions in ~/.hermes/state.db
    return "Hermes gateway: RUNNING (pid 607547). 12 sessions."

async def main():
    async with ws_client(OFFICIAL_MCP) as (r, w):
        async with ClientSession(r, w, client_info=Implementation("hafjet", "1.0")) as s:
            await s.initialize()
            # register hafjet_status, loop on tools/call -> call hafjet_status -> return text
```
- Deps (light): `mcp` + `websockets`. NO torch/funasr.
- Env: `XIAOZHI_MCP_TOKEN` (the seller token) — Tuan pastes via `nano`, agent never writes it.

## Phased plan
- **Phase 1 (current):** `hafjet_status` returns local Hermes status. Verifies link. No API server, no gateway restart.
- **Phase 2 (later):** enable `hermes-api-server` (localhost only) so the bridge can call real Hermes tools; needs explicit gateway-restart approval.

## Risks & safety
| Risk | Mitigation |
|---|---|
| Seller MCP token pasted in chat (happened 2026-07-20) | **Rotate the token** after setup; anyone with it could register malicious tools on the agent. Agent must NEVER echo the token back. |
| Disk nearly full (27G/29G, 92%) | This route is MB-scale; no heavy install needed. If cleanup is required, get a SEPARATE standalone approval per delete (see hafjet-command-safety). |
| Touching production | No gateway restart, no `.hermes` edits, no OTA/device change. |
| `mcp` SDK WebSocket transport | Pin a version that has `mcp.client.websocket`; if not, use `xinnan-tech/mcp-endpoint-server` client lib as fallback. |

## Pitfalls
- **Do NOT go down the self-host path first.** The instinct "device → self-hosted xiaozhi-server → Hermes" is tempting but the user explicitly rejected it (voice quality + risk). Always propose the official-MCP route first.
- **`~/xiaozhi-server` is research clutter** (1.6GB). Don't `pip install` its full `requirements.txt` (torch/funasr) — it will fill the disk. If deps are needed for a bridge, install ONLY `mcp` + `websockets`.
- **Bundled destructive+install commands get blocked.** A `rm -rf ~/.cache/pip && python3 -m venv .venv && pip install ...` was BLOCKED as a whole by the approval/timeout gate — delete never ran, venv never made. Never retry; split into separate approved steps.
- **Token from seller is the official MCP endpoint**, not a self-host address. Don't try to stand up `mcp-endpoint-server` — connect directly to it.

## References
- `references/xiaozhi-mcp-research.md` — condensed findings from xiaozhi-server repo docs (mcp_endpoint format, calculator pattern, LLM base_url capability, transport support).
