---
name: hafjet-jarvis-dashboard-access
description: Securely access the JARVIS daemon dashboard on hafjet-office-pc (headless server, port 3142) from a remote browser over Tailscale using the JWT-only access-token mint flow. Use when JARVIS runs JWT-only (dashboard returns 401 without a token) and you need to generate a secured dashboard URL, or when debugging 401/403 during access.
---

# JARVIS Dashboard Access (headless / browser-only)

## When to use
- JARVIS daemon installed on hafjet-office-pc via `bun install -g @usejarvis/brain`, running on port 3142.
- `~/.jarvis/config.yaml` has `auth.insecure_open_access` REMOVED → dashboard is JWT-only (returns 401 without a valid token).
- You want to open the dashboard in a browser over Tailscale (no sidecar GUI app).

## Setup facts
- Office PC: `hafjet-pc-office` / `100.121.94.41` (Tailscale). SSH works passwordless (`ssh -o BatchMode=yes hafjet-pc-office`).
- Bun at `~/.bun/bin` (prepend to PATH: `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"`). Node v22 also present.
- LLM provider: Gemini free-tier (configured in dashboard Settings → LLM; default model `gemini-3-flash-preview`).
- Config: `~/.jarvis/config.yaml`. Data dir: `~/.jarvis/`.

## Procedure: generate a secured dashboard URL
Run on the office PC (via SSH). The flow:
1. `jarvis enroll "<device-name>" --json` → returns `{ token: <enroll_JWT>, sid, name, created }`. The `token` field is the long-lived enrollment JWT.
2. `POST http://localhost:3142/sidecar/token` with header `Authorization: Bearer <enroll_JWT>` (EMPTY body). Returns `{ access_token, expires_in }`.
3. Open browser at `http://100.121.94.41:3142/?token=<access_token>`. The server sets a cookie + 302 redirect, then serves the dashboard. Works over Tailscale LAN (HTTP, so the `Secure` cookie flag is not set — fine for LAN).
4. Access token is short-lived (TTL). Re-run to get a fresh one.

### PITFALLS (cost iterations to discover)
- ⚠️ Sending the JWT in a JSON **body** to `/sidecar/token` returns **403**. It MUST be the `Authorization: Bearer <jwt>` **header** with an EMPTY body.
- ⚠️ Enroll MUST run against the **currently-running** daemon. After `jarvis restart` the ES256 signing key rotates (per `data_dir`), so an enrollment JWT minted before a restart is invalid → 401 on mint. **Re-enroll after every restart.**
- ⚠️ Testing with Python `urllib` default opener gives a **spurious 401** because it doesn't process the Set-Cookie + 302 like a browser. Use `http.cookiejar.CookieJar()` + `HTTPCookieProcessor` to simulate a browser, OR just test in a real browser.
- ⚠️ `curl` quoting through an ssh heredoc is fragile; prefer a python one-liner or a saved `~/jarvis-token.sh` helper.

## Correct verification
- No token → HTTP **401** (Unauthorized page). This is GOOD = secured.
- With `?token=<access_token>` via a cookie-handling client/real browser → HTTP **200** + dashboard HTML; `/api/health` → 200.

## Lock-out avoidance / recovery
- Do NOT remove `insecure_open_access` until you have confirmed the token flow works against the running daemon.
- If locked out: temporarily set `auth.insecure_open_access: true` in `~/.jarvis/config.yaml`, `jarvis stop && jarvis start -d --no-open`, finish setup, then remove the flag and re-verify with the flow above.

## Commands (run on office PC via SSH)
```bash
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
jarvis enroll "hafjet-office-pc" --json > /tmp/enroll.json
JWT=$(python3 -c 'import json;print(json.load(open("/tmp/enroll.json"))["token"])')
ACCESS=$(python3 -c "import json,urllib.request; r=urllib.request.urlopen(urllib.request.Request('http://localhost:3142/sidecar/token',data=b'',headers={'Authorization':'Bearer $JWT'},method='POST')); print(json.loads(r.read())['access_token'])")
echo "http://100.121.94.41:3142/?token=$ACCESS"
```

## Daemon control
- `jarvis start -d --no-open` (detached, headless, no browser auto-open)
- `jarvis stop` / `jarvis status` / `jarvis logs -f` / `jarvis doctor` / `jarvis restart`
- `jarvis enroll "<name>"` mints a device JWT; `jarvis sidecars` lists enrolled.
