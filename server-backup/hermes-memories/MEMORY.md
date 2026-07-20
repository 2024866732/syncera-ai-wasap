Tuan Hafizi (MD HAFJET, UiTM study leave, Malay+Kelantan). Wants concise tables/bullets, hates overexplaining. Hard rules: pre-commit review (show status+diff, approve BEFORE commit); pre-deploy review (diff+logs, deploy only on explicit cmd); destructive/long/irreversible ops need SEPARATE approval each time; if safety gate BLOCKS a cmd, treat as explicit denial — stop, no retry, wait for fresh instruction. Never guess secrets.
§
Git: origin=github.com/2024866732/hafjet-whatsapp-bot.git (active, NOT syncera). Local branch release/v2.2.0 NO upstream → `git push -u origin release/v2.2.0`. Tuan gave standing push permission for own repo.
§
External API defense: never trust resp.json() alone — use _safe_json() that returns {} instead of raising; guard empty body, vendor prefixes (Shopee: )]}'\n), unmatched brackets, parse failures; log raw body(500).
§
AI licensing: commercial-use clearance required before customer-facing models; cc-by-nc/unlicensed avoided for business; personal testing OK (mesolitica Malaysian-TTS-0.6B-v1 approved 2026-07-20, personal only).
§
HAFJET costs(Jul2026): sewa tertunggak RM400/bln(baki RM5k), BSN RM400/bln, TNB RM400-500/bln, min gaji RM1.7k/bln. Hire bila net profit >RM3.5k/bln stabil.
§
PC Office (hafjet-pc-office): Python 3.14 only, no python3-venv/PEP668. Use `uv` for venvs (uv venvs have NO pip). CPU-only, 16GB/4-core i3. HF TTS = skill `huggingface-tts-deploy`.
§
XiaoZhi MCP (HAFJET): expose Hermes tools to xiaozhi.me official = run MCP SERVER role over `websocket_client` transport (from mcp.client.websocket; correct import name `websocket_client` NOT `ws_client`; deprecated in mcp 1.28.1 but works). Use `Server.run(read, write, init_opts)` — ClientSession is the CLIENT role and cannot receive tools/list. Seller token `wss://api.xiaozhi.me/mcp/?token=...` IS the official endpoint (no self-host needed). Venv ~/hafjet-mcp-bridge/.venv has mcp 1.28.1 + websockets 16.1.1; artifact /tmp/hafjet_bridge.py. Device stays on official xiaozhi.me to keep natural Malay TTS.