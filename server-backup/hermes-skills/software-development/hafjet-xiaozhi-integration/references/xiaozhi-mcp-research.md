# XiaoZhi MCP Integration — Research Notes (2026-07-20)

Condensed from `xiaozhi-esp32` + `xiaozhi-esp32-server` repo docs. For the
official-MCP route (device stays on xiaozhi.me, Hermes = MCP tool-brain).

## Endpoint format
- Self-hosted: `ws://<host>:<port>/mcp_endpoint/mcp/?token=<tok>`
- Official (seller token): `wss://api.xiaozhi.me/mcp/?token=<tok>`
- Same shape → connect directly; do NOT stand up `mcp-endpoint-server`.

## How a tool gets registered (from docs/mcp-endpoint-integration.md)
1. Agent management → 配置角色 → 编辑功能 → bottom shows **MCP接入点** address.
2. Run the bridge with `MCP_ENDPOINT=ws://.../?token=...` then start it.
3. On device connect, server logs `支持的工具数量: N` and the function list
   appears in the agent's available tools (e.g. `['..., 'calculator']`).
4. Refresh MCP status in console to see the new tool.

## xiaozhi-server MCP client transports (core/providers/tools/server_mcp/mcp_client.py)
Accepts three config shapes:
- `command` → stdio (`StdioServerParameters`)
- `url` + `transport: sse` (default) → SSE client
- `url` + `transport: streamable-http` → Streamable HTTP client
A bridge we write just needs to speak MCP JSON-RPC over the WebSocket/SSE.

## LLM provider accepts base_url (self-host route, NOT used now)
`core/providers/llm/openai/openai.py` reads `base_url` (or `url`) and does
`openai.OpenAI(api_key, base_url)`. So a self-hosted xiaozhi-server could point
its LLM at `http://localhost:8642/v1` (Hermes API server). Kept for reference;
the locked decision is the official-MCP route, not self-host.

## Tool call/response shape (MCP JSON-RPC)
```json
{ "method": "tools/call",
  "params": { "name": "hafjet_status", "arguments": {} } }
// bridge replies: { "content": [ { "type": "text", "text": "..." } ] }
```

## Lightweight deps for the bridge
`mcp` + `websockets` only. NO torch / funasr / SenseVoice. The full
`xiaozhi-server` is research clutter (1.6GB at ~/xiaozhi-server) — never
`pip install` its `requirements.txt` on the 92%-full disk.
