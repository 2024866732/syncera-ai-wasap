---
name: hafjet-jarvis-setup
description: Install, configure, and secure JARVIS (vierisid/jarvis) — an always-on autonomous AI daemon — on HAFJET infra (office PC / server). Covers Bun install, JWT-only auth model, the insecure_open_access first-run escape hatch, sidecar enrollment, Gemini free-tier LLM, and the Local Whisper.cpp vs faster-whisper pitfall.
---

# JARVIS Daemon — Install & Secure on HAFJET Infra

Install and harden [JARVIS](https://github.com/vierisid/jarvis) (v0.8.2, "Just A Rather Very Intelligent System") — an **always-on autonomous AI daemon** — on HAFJET machines. JARVIS is NOT a chatbot: it's a persistent daemon with desktop awareness, a 9-role multi-agent hierarchy, and a 50+ node visual workflow builder. Runtime is **Bun**, not Node.

## When to use
- User asks to install / setup / configure JARVIS (the vierisid/jarvis repo).
- User wants an autonomous AI agent/daemon on a HAFJET server or office PC.
- User mentions "Jarvis", "autonomous daemon", "sidecar", or "localhost:3142".

## Mental model
- **Daemon** runs on an always-on machine (headless server is fine). Dashboard at `http://localhost:3142`.
- **Sidecar** is a separate lightweight agent installed on a desktop/laptop with a GUI + mic; it gives JARVIS that machine's screen, browser, terminal, clipboard, screenshots. A headless server alone has NO desktop awareness.
- **Auth is JWT-only by default.** No shared dashboard password. First-run setup uses a temporary `insecure_open_access` flag.

## Prerequisites
- **Bun >= 1.0.** If missing: `npm install -g bun` (office PC had npm 10.9.8 at `~/.local/bin`). Verify `bun --version`.
- Unix-like OS (macOS / Linux / WSL). Native Windows daemon NOT supported.
- An LLM API key for first setup: **Anthropic, OpenAI, Gemini, Ollama, or Groq**. (OpenCode Go — our default provider — is NOT in JARVIS's native list. Use Gemini free tier or a real key.)
- For desktop awareness / voice: a sidecar on a GUI machine.

## Install (Bun global — recommended)
```bash
# on target machine (e.g. via ssh hafjet-pc-office)
bun install -g @usejarvis/brain     # ~9s, installs jarvis CLI
jarvis --version                    # confirm
# start detached + headless (no browser auto-open), setup mode
jarvis start -d --no-open
jarvis status                       # ● JARVIS is running (PID ...)
ss -tlnp | grep 3142                # LISTEN *:3142
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3142/   # 200
```
`jarvis doctor` is a good pre/post check (expects "4 passed / 2 warnings / 3 failed" before setup).

> Note: `bun install -g` BLOCKS 3 postinstall scripts by default (ensure-bun, copy:models, protobufjs). This is fine — daemon boots without them.

## Security hardening — DO THIS IN ORDER
JARVIS is JWT-only. You CANNOT reach the dashboard without either the `insecure_open_access` flag or a valid token. **Dropping the flag before the user finishes first-run setup risks a lockout.**

1. **First-run (temporary open access).** Stop daemon, write config, restart:
   ```bash
   jarvis stop
   mkdir -p ~/.jarvis
   cat > ~/.jarvis/config.yaml <<'YAML'
   # TEMPORARY — remove after first-run setup + sidecar enrollment
   auth:
     insecure_open_access: true
   YAML
   jarvis start -d --no-open
   ```
2. **User does first-run in browser** at `http://<tailscale-ip>:3142` (e.g. `100.121.94.41:3142` over Tailscale, NOT public-exposed). Sets LLM provider key + profile. Skip STT for now (see pitfall).
3. **Enroll a device (mint JWT):** `jarvis enroll "hafjet-office-pc"` → returns `sid` + JWT. `jarvis sidecars` lists enrolled.
4. **Remove the flag + set brain_domain**, then restart. See `references/auth-and-security.md` for the token-flow detail and the VERIFIED curl-mint recipe — verify a working `?token=` access path FIRST (run `bash ~/jarvis-token.sh`), or you'll lock the user out.
5. **Prefer Tailscale-only exposure.** Do NOT open 3142 to the public internet.

## LLM provider
- **Gemini free tier works** (sign up at aistudio.google.com/apikey, no card, ~15 RPM / 1500 RPD / 1M TPM as of 2026 — see `references/gemini-free-tier.md`). Free tier may use prompts for training (opt-out in Google AI Studio).
- Keys are stored in an **encrypted keychain + DB**, not env vars. You do NOT pass the key to the agent; the user enters it in the dashboard.
- After first setup, run `jarvis restart` to bring up background services (heartbeat, awareness, goals) — they only activate post-setup.

## STT pitfall (important)
The dashboard STT setup offers: Skip / OpenAI Whisper (key) / Groq Whisper (key) / **Local Whisper.cpp**.
- **Local Whisper.cpp is NOT our `faster-whisper` Python venv.** It needs a **whisper.cpp HTTP server listening on `http://localhost:8080`** (server_type whisper.cpp). Port 8080 is NOT listening by default.
- For a headless server, **choose "Skip for now" (text-only)**. STT belongs on the sidecar/desktop machine that actually has a microphone. Wire it up later from Settings → Channels.

## Sidecar (desktop reach)
```bash
bun install -g @usejarvis/sidecar
jarvis   # first run opens setup window; paste enrollment token from dashboard Settings → Sidecar
```
Each sidecar = one enrolled machine's desktop/browser/terminal/clipboard/screenshots.

### Remote sidecar (laptop on a different machine) — set brain_domain FIRST
For a laptop to connect, the enrollment token must point at the brain's **routable** address, not `localhost`. Add to `~/.jarvis/config.yaml` on the BRAIN, then **re-enroll** (old localhost token becomes invalid):
```yaml
auth: {}
daemon:
  brain_domain: 100.121.94.41:3142    # Tailscale IP:port (ws/http default; https NOT needed on Tailscale)
```
Verify: log line `Brain URL: wss://100.121.94.41:3142/sidecar/connect (source: config.yaml daemon.brain_domain)` and `jarvis sidecars` lists the device.

### Windows 11/10 laptop sidecar (NO prebuilt .exe exists)
GitHub Releases have **0 assets** for v0.8.x — there is no Windows binary. Install via Bun:
```powershell
# 1) Install Bun (official script; may show a harmless schannel cert warning but still succeeds)
powershell -c "irm bun.sh/install.ps1 | iex"
# restart terminal, confirm:
bun --version
# 2) Install + connect sidecar
bun install -g @usejarvis/sidecar
jarvis --token <FULL_TOKEN>
# subsequent runs: just `jarvis` (token saved to ~\.jarvis\sidecar.yaml)
```
- **"jarvis not recognized"** = sidecar not installed yet (run `bun install -g @usejarvis/sidecar`).
- **"invalid JWT format"** = token truncated → see Pitfalls (Telegram truncation).
- **"stuck / no response"** = (a) bad token, (b) Tailscale not on laptop, or (c) version mismatch. From laptop first check: `tailscale status` (must show same tailnet + brain active) and `Test-NetConnection 100.121.94.41 -Port 3142` (TcpTestSucceeded must be True).
- If a bad token was already saved: `Remove-Item $HOME\.jarvis\sidecar.yaml -Force` then retry.

See `references/windows-sidecar-token-delivery.md` for the full gotcha walkthrough.

## Maintenance
- `jarvis update` — auto-detects install method.
- `jarvis uninstall` — stops daemon, removes `~/.jarvis`, autostart hooks (does NOT touch sidecars).
- `jarvis logs -f`, `jarvis restart`, `jarvis stop`.

## Pitfalls
- **Lockout risk:** never remove `insecure_open_access` before confirming a token access path works. The `curl POST /sidecar/token` mint works when the JWT is sent as an `Authorization: Bearer` **header** (returns 200 + `access_token`); it only 403s if the JWT is in the JSON body. Run `bash ~/jarvis-token.sh` to generate a working `?token=` URL, or test the browser flow first.
- **Telegram truncates long tokens in chat.** A 646-char enrollment JWT pasted into Telegram shows as `eyJhbG...9HGA`. Pasting that → `decode token: invalid JWT format`. Deliver via **MEDIA file attachment** or `ssh host "cat /tmp/laptop_token.txt" | Set-Clipboard` (PowerShell). Never type/paste a truncated preview, and never paste the `<`/`>` placeholder brackets.
- **Windows has no prebuilt sidecar .exe** — install via `bun install -g @usejarvis/sidecar` after installing Bun. "jarvis not recognized" = sidecar not installed; "stuck" = check `tailscale status` + `Test-NetConnection <brain-ip> -Port 3142` from the laptop. See `references/windows-sidecar-token-delivery.md`.
- **brain_domain must be set before enrolling a remote sidecar.** Without it, tokens point at `localhost` and the laptop can never reach the brain. Set `daemon.brain_domain: <tailscale-ip>:3142`, restart, re-enroll.
- **OpenCode Go not supported** as JARVIS LLM provider. Use Gemini / Anthropic / OpenAI / Groq / Ollama.
- **Headless = no desktop awareness.** Screen capture / pebble / native app control only come via a sidecar on a GUI machine.
- **Free-tier quota burns fast** if the daemon runs autonomous 24/7 (screen capture every 5-10s, multi-agent). Keep it light during testing; prefer Gemini Flash-family (observed default: `gemini-3-flash-preview`).

## References
- `references/auth-and-security.md` — full JWT-only auth model, insecure_open_access behavior, VERIFIED curl token-mint recipe, hardening checklist, remote SSH push pitfalls.
- `references/gemini-free-tier.md` — free-tier limits, tradeoffs, observed default model.
- `references/windows-sidecar-token-delivery.md` — Windows sidecar install via Bun + the Telegram token-truncation disaster + brain_domain for remote sidecars.
- `scripts/jarvis-token.sh` — proven helper: enroll → mint access token → print a working `?token=` dashboard URL (push to target via `cat script | ssh host 'cat > ~/jarvis-token.sh'`).
