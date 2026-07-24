---
name: jarvis-daemon-setup
description: Install, configure, and securely expose the JARVIS autonomous AI daemon (github.com/vierisid/jarvis) on HAFJET infrastructure (typically hafjet-office-pc). Covers Bun install, LLM provider choice (Gemini free tier works), the JWT-only auth model, the insecure_open_access escape hatch, browser-only access via ?token=, and sidecar enrollment. Use whenever Tuan Hafizi says "install jarvis", "set up jarvis", "jarvis daemon", or asks about JARVIS auth/dashboard access.
---

# JARVIS Daemon Setup (HAFJET)

JARVIS = "Just A Rather Very Intelligent System" — an always-on autonomous AI daemon
(24/7, multi-agent, screen/desktop awareness via sidecars, visual workflow builder).
Runtime is **Bun**, not Node. Repo: `github.com/vierisid/jarvis`.

It is NOT a chatbot — once configured it can run scripts, read files, access clipboard,
and act autonomously within authority limits. Treat every deployment as a security-sensitive
operation.

## When this applies
- Fresh install of JARVIS on any HAFJET machine (office PC, server).
- Troubleshooting JARVIS dashboard access / 401 errors.
- Adding a sidecar (desktop awareness / voice) to a GUI machine.
- Securing or re-securing a JARVIS install.

## Environment facts (hafjet-office-pc, verified 2026-07-24)
- Ubuntu 26.04, i3-2100 (4 core), 16GB RAM, 53GB free disk, headless (no GUI/mic).
- Node v22 present; **Bun NOT present by default** → install it.
- Tailscale IP `100.121.94.41`. Dashboard reachable at `http://100.121.94.41:3142`
  over Tailscale (do NOT expose port 3142 to the public internet).
- Headless box = daemon HUB only. Desktop awareness / voice / STT belong on a
  sidecar installed on Tuan's GUI laptop/desktop, not here.

## Install procedure
1. **Install Bun** (if missing): `npm install -g bun` works (got 1.3.14). Ensure
   `~/.bun/bin` and `~/.local/bin` are on PATH for the session.
2. **Install JARVIS global**: `bun install -g @usejarvis/brain`. Binary lands at
   `~/.bun/bin/jarvis`.
   - Bun blocks 3 postinstall scripts (`ensure-bun.cjs`, `copy:models`, `protobufjs`).
     Safe to ignore for daemon boot. Run `bun pm trust` only if you need bundled ML models.
3. **Verify**: `jarvis --version` (0.8.2) and `jarvis doctor` (checks Bun, port 3142, SQLite).
4. **Start (headless, detached, no browser auto-open)**:
   `jarvis start -d --no-open`
   First run boots in **setup mode** — no LLM configured, does nothing autonomous yet.

## LLM provider
Native providers: **Anthropic, OpenAI, Gemini, Ollama, Groq**.
- **OpenCode Go is NOT supported** by JARVIS — do not offer it as a provider.
- **Gemini free tier works** (no card, no expiry): ~15 RPM / 1,500 RPD / 1M TPM.
  Caveat: Google may train on prompts unless opted out in Google AI Studio.
  Recommend **Gemini 2.0 Flash** (highest free-tier limits, cheapest).
  Free-tier quota is thin for 24/7 autonomous use — warn Tuan before enabling
  always-on awareness/agents.

## STT (voice) — skip on headless
Dashboard setup offers OpenAI Whisper / Groq Whisper / Local Whisper.cpp.
- **Skip for now** on the office PC (no mic, no GUI). Wire up later from
  Settings → Channels on a sidecar machine.
- Local Whisper.cpp needs an HTTP server at `http://localhost:8080` — we do NOT run
  that. Our `faster-whisper` venv is NOT a whisper.cpp endpoint; don't select it.

## SECURITY MODEL — read before touching config.yaml
JARVIS is **JWT-only by default**. The dashboard and every API route require a valid
enrolled-device token. The ONLY escape hatch:

```yaml
# ~/.jarvis/config.yaml
auth:
  insecure_open_access: true   # DANGEROUS: dashboard open with NO auth
```
This is meant ONLY for first-time self-host setup before a device is enrolled.
The daemon logs a loud WARNING while it is on. **Remove it as soon as setup is done.**

### Browser-only secure access (no sidecar GUI) — option B
To let Tuan open the dashboard from a remote browser without the sidecar app:
1. `jarvis enroll "<device>" --json` → JSON contains `token` (the enrollment JWT, ~632 chars).
2. Mint a short-lived access token:
   `POST http://localhost:3142/sidecar/token` with header
   `Authorization: Bearer <enrollment_jwt>` → returns `{"access_token":"..."}` (~380 chars).
3. Open dashboard at `http://<host>:3142/?token=<access_token>`.
   The server sets a cookie and redirects; thereafter the browser is authenticated.
See `scripts/jarvis-token.sh` (run on the daemon host) which automates steps 1–3.

See `references/jarvis-auth-model.md` for the source-code map (handler order, why the
`Authorization` header is required, audience/scope notes).

## PITFALLS (learned the hard way)
- **Mint endpoint needs the JWT in the `Authorization: Bearer` HEADER, not a JSON body.**
  Sending it as `{"token": "..."}` body returns **403 Forbidden**.
- **Re-enroll against the RUNNING daemon before minting.** A JWT minted before a daemon
  restart can 401 (stale). Always `jarvis enroll` fresh in the same session as the mint.
- **Never remove `insecure_open_access` until `?token=` browser access returns 200
  against the LIVE daemon.** Sequence that is safe:
  1. Keep `insecure_open_access: true` while Tuan sets the Gemini key in the dashboard.
  2. Generate a token URL via the helper script; confirm `curl`/browser gets 200.
  3. Only then stop daemon, delete the flag, restart, and verify:
     - `curl -o /dev/null -w '%{http_code}' http://localhost:3142/` → expect **401**.
     - Same with `?token=<access>` → expect **200**.
- **Rollback is cheap**: if you lock yourself out, just stop the daemon, re-add
  `insecure_open_access: true` to config.yaml, restart. Reversible.

## Verification checklist
- [ ] `jarvis status` shows running PID, port 3142 LISTEN.
- [ ] `curl -s -o /dev/null -w '%{http_code}' http://localhost:3142/` behaves per auth mode
      (200 if insecure_open_access, 401 if JWT-only).
- [ ] Gemini key entered in dashboard Settings → LLM.
- [ ] After securing: `jarvis-token.sh` prints a working `?token=` URL (200).
- [ ] `insecure_open_access` removed from config.yaml; daemon restarted.

## Sidecar (desktop awareness / voice on a GUI machine)
1. On the GUI machine: `bun install -g @usejarvis/sidecar`.
2. In JARVIS dashboard Settings → Sidecar, enroll a device, copy the token command.
3. Run `jarvis` (the sidecar binary) there — it connects back over authenticated WebSocket.
Note: `daemon.brain_domain` must be a routable hostname for *remote* sidecars; the
office-PC daemon warns "Brain URL points at a local host" otherwise (fine for local-only).

## Support files
- `references/jarvis-auth-model.md` — source-code map of the auth/route handlers.
- `scripts/jarvis-token.sh` — enroll + mint + print dashboard URL helper.
