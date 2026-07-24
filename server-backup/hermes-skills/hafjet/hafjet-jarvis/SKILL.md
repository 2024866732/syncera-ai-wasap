---
name: hafjet-jarvis
description: Install, configure, and operate the JARVIS autonomous AI daemon (github.com/vierisid/jarvis) on HAFJET infrastructure — office-PC daemon hub, LLM provider setup (incl. Gemini free tier), sidecars, and safety posture. Use when Tuan Hafizi mentions JARVIS, "autonomous daemon", sidecar enrollment, port 3142, or the jarvis CLI on hafjet-office-pc.
---

# HAFJET JARVIS — Autonomous AI Daemon

## Triggers
- "install jarvis", "jarvis", "jarvis start", "jarvis dashboard", "sidecar", "enroll device", "autonomous agent on office PC", port 3142, `@usejarvis/brain`.

## What JARVIS is
- **Just A Rather Very Intelligent System** — an always-on autonomous AI daemon (24/7), NOT a chatbot-with-tools. It sees the screen (via sidecar), runs scripts, controls desktops, has a 9-agent hierarchy + a 50+ node visual workflow builder (n8n-style), and pursues goals/OKRs.
- License **RSALv2**. Runtime = **Bun** (NOT Node). Language TypeScript.
- Architecture: one **central daemon** ("brain") + unlimited **sidecars** (Go agents) on each machine, giving desktop/browser/clipboard/screenshot reach across the fleet.

## HAFJET deployment model
- **hafjet-office-pc** (100.121.94.41, Ubuntu 26.04, 16GB, i3-2100, no GPU) = central daemon hub (headless). Dashboard web at `http://localhost:3142`.
- The office PC is **headless** → desktop-awareness features (screen capture, pebble UI, native window control) are inert THERE. Those need a **sidecar on a GUI machine** (Tuan's laptop/desktop).
- Access the dashboard via **Tailscale only** (don't expose publicly).

## Install procedure (verified 2026-07-24, office PC)
1. **Bun**: if missing, `npm install -g bun` (office PC had npm v10.9.8, no bun → produced bun 1.3.14). Verify `bun --version`.
2. `bun install -g @usejarvis/brain` → installs `jarvis` binary at `~/.bun/bin/jarvis` (v0.8.2 at install time). Verify `jarvis --version` and `jarvis doctor`.
3. Bun **blocks 3 postinstall lifecycle scripts** by default. `bun pm -g untrusted` lists them (`ensure-bun.cjs` + `copy:models`, protobufjs). Non-critical for daemon boot — only needed for offline/whisper models. Trust (`bun pm trust`) only if those are required.

## Start / run
- `jarvis start -d --no-open` → detached, headless, no browser auto-open. Boots in **SETUP MODE** (dashboard at :3142 walks through LLM provider + voice + profile).
- `jarvis start --no-local-tools` → for Docker/headless to disable local tool execution.
- After first dashboard setup, run `jarvis restart` to activate background services (heartbeat, commitments, awareness) — they don't come online until next start.
- Management: `jarvis status | logs -f | stop | restart | doctor | update` (dispatches to `bun update -g`) `| uninstall` (stops daemon, removes `~/.jarvis`, unlinks CLI).

## LLM provider setup
- Native providers: **Anthropic, OpenAI, Google Gemini, Ollama, Groq**.
- ⚠️ **OpenCode Go is NOT in JARVIS's list** — do not try to route JARVIS through our OpenCode provider.
- Keys are entered in dashboard **Settings → LLM**, stored in an **encrypted keychain** (NOT env vars / config.yaml). The agent must NOT type Tuan's key — Tuan enters it in the browser.
- **Gemini free tier works** (see `references/gemini-free-tier.md`): ~15 RPM, ~1500 RPD, ~1M TPM, no card, no expiry. Caveat: 24/7 autonomous use (heartbeat + sidecar screen capture every 5–10s) burns quota fast → prefer **Gemini 2.0 Flash** (highest free limits) and avoid long unattended autonomous runs on free tier. Google may train on prompts (opt-out in AI Studio).

## Securing the dashboard (JWT-only) — remove insecure_open_access
First run needs `auth.insecure_open_access: true` in `~/.jarvis/config.yaml` to reach the setup dashboard. **Remove it once setup is done.** Final config:
```yaml
auth:
  # insecure_open_access removed — JWT-only
daemon:
  brain_domain: 100.121.94.41:3142   # Tailscale IP so REMOTE sidecars can reach the brain
```
⚠️ `brain_domain` MUST be set **before** enrolling a remote sidecar, or the enrollment token points at `localhost` and the laptop can never connect. Precedence: `JARVIS_BRAIN_DOMAIN` env > config field > localhost fallback (logs a warning). The startup log shows TWO "Brain URL:" lines — the first is a stale leftover from a prior boot; trust the LAST one (source: config.yaml).

### Browser-only dashboard access (no sidecar GUI)
`insecure_open_access` is insecure (no auth at all). For a SECURED browser URL without installing a sidecar app:
1. `jarvis enroll "<device>" --json` → enrollment JWT
2. `POST /sidecar/token` header `Authorization: Bearer <JWT>` → `{ access_token }`
3. Open `http://100.121.94.41:3142/?token=<access_token>` — server sets cookie + 302.
No-token → **401** (secured ✓). With-token → **200**. Helper script + decode recipe in `references/token-flow.md`.

## Sidecar (desktop reach)
- On a GUI machine: `bun install -g @usejarvis/sidecar` (or download binary from GitHub Releases).
- Enroll: dashboard **Settings → Sidecar →** name → **Enroll →** copy token command.
- Run: `jarvis` (the sidecar binary) on that machine.
- ⚠️ **No prebuilt Windows .exe**: GitHub releases for v0.8.x have **0 assets** (no binary). On Windows, install via Bun: `powershell -c "irm bun.sh/install.ps1 | iex"` (the schannel cert-revocation warning is harmless — install still succeeds), restart terminal, `bun --version`, then `bun install -g @usejarvis/sidecar`, then `jarvis --token <PASTE_TOKEN>` (NO `<` `>` brackets — those are placeholders; pasting them raw gives a PowerShell redirection error).
- ⚠️ Both machines MUST be in the **same Tailscale network** (same login). `tailscale status` on the laptop must show `hafjet-pc-office` as active.
- Enrollment token is **short-lived** — if the sidecar shows "last seen never" / connect is rejected, re-run `jarvis enroll` and grab a fresh token. Verify the laptop actually connected via `jarvis sidecars` on the brain (the laptop device should appear, not just `hafjet-office-pc`).

## ⚠️ SAFETY POSTURE (embed in EVERY JARVIS task)
- Once configured + started, JARVIS acts **autonomously** and can run scripts, read files, access clipboard, and control desktops across ALL enrolled machines. Higher risk than Hermes co-pilot replies.
- **NEVER auto-start the daemon or enable autonomous features without an explicit, separate user command.**
- If the user BLOCKS a start/enable command mid-turn (safety gate), treat as **explicit denial**: STOP, do not retry or rephrase, wait for a fresh explicit instruction.
- Prefer **Tailscale-only** access to :3142 (never public expose).
- Audit enrolled sidecars regularly (`jarvis sidecars`); revoke (`jarvis revoke <sid>`) any unrecognized device.

## Pitfalls
- `bun install -g` may print "Blocked 3 postinstalls" — expected, non-fatal.
- `jarvis doctor` shows ⚠️ Data dir / Config / LLM "not found" BEFORE first `jarvis start` — normal; resolved after setup.
- ⚠️ "Chromium/Chrome not found" on headless → browser tools limited. Not fatal; install chromium only if browser automation is needed.
- `bun run build:ui` is only for manual/dev install, NOT for the bun-global install.
- **write_file writes to the HERMES SERVER, not the SSH remote.** To edit office-PC files, pipe a local file: `cat localfile | ssh hafjet-pc-office 'cat > $HOME/path && bash $HOME/path'`. Never assume write_file reaches the remote.
- **SSH `bash -c` quoting breaks on `===` strings and nested heredocs (`<<PY`).** `echo === text` → "syntax error near unexpected token `('". Avoid `===` labels and prefer piping a local script file over inline multi-line Python/heredoc over SSH. Also: `execute_code` is BLOCKED for running arbitrary Python against SSH — use `terminal` with a piped script instead.
- Enrollment token is short-lived — stale token = sidecar won't connect. Re-enroll for a fresh one.
- brain_domain warning in logs is stale — check the LAST "Brain URL:" line (source: config.yaml), not the first.
- Don't expose port 3142 to the public internet — Tailscale-only.
- Sidecar version is independent of brain; brain may refuse "too old" sidecars ("update required").

## References
- `references/gemini-free-tier.md` — Gemini free-tier limits + autonomous-agent implications.
- `references/token-flow.md` — exact JWT mint/verify helper script + JWT-decode recipe for securing the dashboard without a sidecar.
