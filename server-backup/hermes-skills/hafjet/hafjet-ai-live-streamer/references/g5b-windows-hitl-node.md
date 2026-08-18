# G5b Windows HITL browser node

## Role

For real/private TikTok G5b, use **Windows Tailscale node `100.73.190.96`** (`DESKTOP-MOPJU6T`) for headed browser + Tuan manual HITL login. Do not use the headless Ubuntu PC Office host for browser login.

- Keep browser profile/cookies **only on this Windows node**.
- Do not copy cookies/session state to Office, Hermes, RTX, Git, logs, or Telegram.
- TikTok remains one platform only; no RTMP/public/G6/G7.

## Stage 0 proof checklist

1. Tailscale peer reports online.
2. A permitted management/browser-control path exists (Tailscale SSH/Windows OpenSSH or an approved desktop/browser integration).
3. Confirm a visible headed browser can launch on the Windows desktop.
4. Confirm a local-only profile directory and no sync/export path.
5. Verify Windows node can send a non-live synthetic comment event to Hermes through the approved route.
6. Independently verify Hermes health/pause-stop and RTX CB/`LIVE_GPU_LOCK` clear.
7. Stop and wait for **`G5b preflight OK`** before opening TikTok.com or requesting login.

## Current-session note (2026-08-18)

Tailscale was online, but TCP SSH port 22 returned `Connection refused`; browser/GUI were therefore unverified. This is a preflight blocker, not a reason to attempt login or infer browser availability.
