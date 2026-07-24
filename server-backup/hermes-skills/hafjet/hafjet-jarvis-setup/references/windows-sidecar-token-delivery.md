# Windows Sidecar + Token Delivery — Gotcha Walkthrough

Real session: connecting a Windows 11 laptop sidecar to the office-PC brain over Tailscale.

## Setup sequence that worked
1. Brain (office PC): set `daemon.brain_domain: 100.121.94.41:3142` in `~/.jarvis/config.yaml`, restart, re-enroll device `hafjet-laptop-win`.
2. Laptop: install Bun via `powershell -c "irm bun.sh/install.ps1 | iex"` (ignore the harmless `schannel: CRYPT_E_NO_REVOCATION_CHECK` warning — download still succeeds, binary lands at `C:\Users\<user>\.bun\bin\bun.exe`). Restart terminal.
3. Laptop: `bun install -g @usejarvis/sidecar` then `jarvis --token <FULL_TOKEN>`.

## The #1 failure: truncated token
- A `jarvis enroll` JWT is ~646 chars. Pasting it into a Telegram message truncates to `eyJhbG...9HGA` (~20 visible chars).
- Pasting the truncated preview → sidecar logs `Failed to create client: decode token: invalid JWT format` and exits.
- Symptom Tuan saw: `jarvis --token eyJhbG...eyJhbG...NiIs...` — the preview string got pasted TWICE (concatenated), also invalid.

### Reliable delivery methods (do NOT paste chat text)
- **MEDIA file attachment** (preferred): on the brain, `jarvis enroll "hafjet-laptop-win" --json | python3 -c '...' > /tmp/laptop_token.txt'` (646 chars), copy that file to local Hermes, deliver as `MEDIA:/abs/path/laptop_token.txt`. File attachments are NOT truncated by Telegram.
- **SSH → clipboard** (PowerShell laptop): `ssh hafjet-pc-office "cat /tmp/laptop_token.txt" | Set-Clipboard` then `jarvis --token (Get-Clipboard)`. Verify with `(Get-Clipboard).Length` → 646.
- **File on laptop**: save the full token to `C:\jarvis_token.txt` (note: a file literally named `C:\jarvis` also works if you read it with `Get-Content C:\jarvis -Raw`), then `jarvis --token (Get-Content C:\jarvis_token.txt -Raw)`.

## Other gotchas observed
- `<` and `>` are reserved in PowerShell — never paste them; they were placeholder brackets in examples.
- `jarvis --token <PASTE>` where `<PASTE>` still contains `<`/`>` → parser error. Paste the raw token only.
- `ssh host "cat ..." | Set-Clipboard` must run in PowerShell (laptop), NOT inside an active SSH session — otherwise `Set-Clipboard` runs on the remote and fails with "command not found".
- If a bad token was saved to `~/.jarvis/sidecar.yaml`, delete it before retrying: `Remove-Item $HOME\.jarvis\sidecar.yaml -Force`.

## Verification
- Laptop: after `jarvis --token ...`, the process should connect (no immediate exit). Check dashboard Settings → Sidecar for the laptop as online.
- Brain: `jarvis sidecars` lists `hafjet-laptop-win` with a `last seen` timestamp after connect. If `last seen never` persists, the laptop never reached the brain (Tailscale / token / version issue).
- Version floor: dashboard Settings → Sidecar shows OK / Update available / Update required. "Update required" = refused connection.
