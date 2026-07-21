# Observability & Secret-Injection Patterns (HAFJET × XiaoZhi MCP PoC)

Condensed from the 2026-07-20 first-integration session. Companion to
SKILL.md sections "Observability-first PoC" and "Secret injection: run.env".

## 1. Why observability > speed for the first run
Tuan's standing rule: for PoC #1, being able to *audit* the run beats getting
it running fast. So the bridge is built with 8 explicit log points and a
structured `logging` formatter BEFORE any execution is attempted. Design phase
produced the artifact; only after full review + separate "run" approval is the
bridge actually executed.

### 8 log points (marker prefixes make grepping trivial)
| # | Event | Marker |
|---|-------|--------|
| 1 | resolve endpoint (token redacted) | `[1] resolving MCP endpoint ...` |
| 2 | WS connect OK | `[2] WebSocket connected to XiaoZhi MCP endpoint` |
| 3 | MCP init / server start | `[3] MCP server starting ...` |
| 4 | tool registered / tools/list | `[4] tool 'hafjet_status' registered` |
| 5 | tools/call received | `[5] tools/call received: name=...` |
| 6 | success result sent | `[6] tool success result sent: ...` |
| 7 | error result sent | `[7] tool error result sent: ...` |
| 8 | exception / shutdown | `[8] exception in bridge: ...` / `[shutdown] ...` |

Redaction rule: never log the raw token. Use
`wss://api.xiaozhi.me/mcp/?token=***` in every log line.

### Normal run flow (expected)
```
[1] resolving MCP endpoint from env (token redacted)
[2-pre] connecting ... (wss://api.xiaozhi.me/mcp/?token=***)
[2] WebSocket connected to XiaoZhi MCP endpoint
[3] MCP server starting (initialize handshake via app.run)
[4] tool 'hafjet_status' registered and available
<blocks, serves>
[5] tools/call received: name=hafjet_status
[6] tool success result sent: Hermes gateway sedang berjalan. 12 sesi aktif direkodkan.
```

### Failure signatures
- `SystemExit: XIAOZHI_MCP_TOKEN / XIAOZHI_MCP_ENDPOINT not set` → env not loaded.
- `[8] exception in bridge: ... InvalidStatusCode ... HTTP 401` → token wrong/expired → check xiaozhi.me, rotate.
- Process exits immediately with no `[2]` → endpoint rejected / MCP feature not enabled in console.

### PRE-FLIGHT validation (run BEFORE load+run; never prints the value)
```bash
grep -q '^XIAOZHI_MCP_TOKEN=*** ~/hafjet-mcp-bridge/run.env && echo TOKEN_OK
grep -q '^XIAOZHI_MCP_ENDPOINT=wss://' ~/hafjet-mcp-bridge/run.env && echo URL_OK
```
If neither matches → STOP, tell the user the EXACT line to write, do NOT load/run.

### RECURRING FAILURE MODE (captured 2026-07-20 — 4x in one session!)
User repeatedly wrote `run.env` with the **value only** (no `XIAOZHI_MCP_*=`
prefix) — bare token or bare `wss://...?token=...` on line 1. Each attempt:
```
run.env: line 1: eyJhbG...E1ZA: command not found
# or
run.env: line 1: wss://api.xiaozhi.me/mcp/?token=eyJhbG...R3oA: No such file or directory
```
→ shell executes the token as a command, **splats a PARTIAL TOKEN into the
terminal (LEAK)**, and the variable stays unset so the bridge logs
`[8] startup failed: XIAOZHI_MCP_TOKEN / XIAOZHI_MCP_ENDPOINT not set`.
**Required format** (flush `=`; no spaces before/after):
```
XIAOZHI_MCP_TOKEN=<token>
# OR
XIAOZHI_MCP_ENDPOINT=wss://api.xiaozhi.me/mcp/?token=<token>
```
If a token EVER appears in a terminal error, ROTATE it after the PoC. Do NOT
auto-retry the run.

## 2. The `run.env` secret-injection pattern (Option B)
Terminal is non-interactive — user cannot `export` during the agent session.

Steps (agent side):
1. Safe-existence check only — do NOT read/cat/dump the file:
   ```bash
   test -f ~/hafjet-mcp-bridge/run.env && echo OK || echo MISSING
   ```
2. If MISSING → STOP. Do not load, do not run, wait for user to create the file.
3. Load + run:
   ```bash
   set -a; . ~/hafjet-mcp-bridge/run.env; set +a
   python3 /tmp/hafjet_bridge.py
   ```
4. Foreground only. `Ctrl+C` cleanly stops (`KeyboardInterrupt` handler logs
   `[shutdown] interrupted by user (Ctrl+C)`).

Hard rules (Tuan's constraints):
- Agent NEVER writes `run.env`, NEVER prints the token value, NEVER dumps
  file contents, NEVER copies the token to another location, NEVER creates a
  fresh `.env`.
- Rejected alternative A (paste token as a CLI arg): leaks into chat history
  and process argv; rotate token if ever used.
- Rejected alternative C (user runs himself): fine but loses agent-side log
  capture and orchestration.

## 3. Smoke-test checklist (first run)
- [ ] venv active (`~/hafjet-mcp-bridge/.venv`)
- [ ] `run.env` present, `XIAOZHI_MCP_TOKEN` set
- [ ] xiaozhi.me MCP feature enabled for the agent
- [ ] bridge runs foreground, `Ctrl+C` ready
- [ ] logs show `[2]` connect + `[4]` tool registered
- [ ] xiaozhi.me console: refresh MCP status → `hafjet_status` listed
- [ ] device: "apa status Hermes?" → spoken Malay reply
- [ ] after test: ROTATE the token (was pasted in chat earlier)
