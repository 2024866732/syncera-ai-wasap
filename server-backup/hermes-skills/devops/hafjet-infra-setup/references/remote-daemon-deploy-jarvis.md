# Remote daemon deploy on PC Office — JARVIS case study

Full recipe for standing up an always-on third-party daemon (JARVIS, the autonomous
AI assistant from github.com/vierisid/jarvis) on `hafjet-pc-office` (Ubuntu, reachable
only via Tailscale `100.121.94.41`). Captured 2026-07-24. Generalizes to any
Bun/Node daemon you want to run headless on that box.

## Why this is the right pattern
- PC Office is the always-on worker; the brain daemon runs there. Sidecars on other
  machines (laptop) connect back over authenticated WebSocket.
- JARVIS is **JWT-only by default** — there is NO shared dashboard password. Access is
  gated by an enrolled-device token. This is good security; it just needs correct setup.

## Install (on PC Office, via SSH from Azure)
```bash
# Bun is the runtime (NOT node). Install via npm if missing:
npm install -g bun            # lands at ~/.bun/bin/bun
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
bun --version                 # 1.3.x

# Install the brain daemon globally:
bun install -g @usejarvis/brain
jarvis --version              # v0.8.2
```
- 3 postinstall scripts are BLOCKED by Bun's security default (ensure-bun, copy:models,
  protobufjs). Harmless for boot — models download on demand. Don't `bun pm trust` blindly.
- First run: `jarvis start -d --no-open` boots in setup mode on port 3142.

## Auth model (CRITICAL — read before touching config.yaml)
- `auth.insecure_open_access: true` = dashboard/API open to ANYONE who can reach the port.
  Use ONLY for first-run setup, REMOVE immediately after.
- Without it, dashboard requires a short-lived **access token** minted from an enrollment JWT:
  1. `jarvis enroll "<device-name>" --json` → prints `{token: <JWT>, sid: ...}`
  2. `POST /sidecar/token` with header `Authorization: Bearer <JWT>` → `{access_token: ...}`
  3. Open `http://<host>:3142/?token=<access_token>` → server sets cookie, redirects.
- `curl` alone can't hold the cookie+302; use a cookiejar (python) or a browser. The
  `jarvis-token.sh` helper (see templates/) does this and prints a ready URL.

## brain_domain for REMOTE sidecars (easy to miss)
- Default enrollment tokens point at `localhost:3142` — only works for sidecars ON the
  same machine. For a laptop sidecar, set in `~/.jarvis/config.yaml`:
  ```yaml
  daemon:
    brain_domain: 100.121.94.41:3142   # Tailscale IP, NOT localhost
  ```
- After setting, **restart the daemon and re-enroll** — old tokens keep the old (localhost)
  origin and will fail WS connect from the laptop.
- Log confirms: `[SidecarManager] Brain URL: wss://100.121.94.41:3142/sidecar/connect`.

## Sidecar on Windows 11 laptop
- JARVIS GitHub Releases have **0 prebuilt assets** (no windows .exe) as of v0.8.2.
  Install via Bun instead:
  ```powershell
  bun install -g @usejarvis/sidecar
  jarvis --token <ENROLL_TOKEN_FROM_OFFICE_PC>
  ```
- The enroll token must be copied from the office PC to the laptop manually (no cross-machine
  transfer available). Subsequent runs are just `jarvis` (token saved in `~/.jarvis/sidecar.yaml`).
- Capabilities (terminal, filesystem, desktop, browser, clipboard, screenshot, awareness)
  are toggled in dashboard Settings → Sidecar after connect.

## LLM provider — Gemini free tier works
- JARVIS native providers: Anthropic, OpenAI, Gemini, Ollama, Groq. OpenCode Go is NOT supported.
- Gemini free-tier API key (aistudio.google.com/apikey) is sufficient: ~15 RPM, ~1500 RPD,
  no card. Pick Gemini 2.0/3 Flash (cheapest, highest limits). Autonomy (screen capture,
  multi-agent) burns quota fast — don't run 24/7 autonomous on free tier.
- STT (voice) can be SKIPPED on first run (headless server has no mic). Wire later via
  Settings → Channels. Local Whisper.cpp needs a `:8080` server we don't run.

## Verification checklist
- `jarvis doctor` → Bun OK, port 3142 available, SQLite OK.
- No-token dashboard hit → **401** (confirms secured).
- With `?token=<access_token>` → **200** + HTML.
- `jarvis status` → running PID.
- After brain_domain set: re-enroll, decode JWT payload `brain` claim = `wss://100.121.94.41:3142/...`.

## Gotchas hit this session
- Don't `write_file` expecting it to land on the SSH target — it writes to the AGENT's local
  FS (Azure). Pipe via `cat localfile | ssh 'cat > remote'` instead.
- `echo === text ===` breaks bash (parsed as `test`). Avoid `===` in echoed headers.
- `<<PY` heredocs inside `ssh -c '...'` fail with "unexpected EOF". Write the script to a
  local file and `cat | ssh 'cat > file'`, then run it remotely.
- `scp` of a single file silently failed here; the `cat | ssh` pipe worked.
- `execute_code` (Hermes tool) is BLOCKED for SSH/remote subprocess. Use the `terminal` tool.
