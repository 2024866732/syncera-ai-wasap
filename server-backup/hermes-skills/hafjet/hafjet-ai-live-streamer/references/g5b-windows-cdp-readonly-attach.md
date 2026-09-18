# G5b Windows HITL: dedicated Chrome profile + read-only TikTok attach

Use only after explicit `approve G5b tiktok`, completed Stage 0, and a further explicit Stage 1 attach instruction. This supports manual HITL login and a private/test URL. It does **not** authorize sending comments, typed replies, speak jobs, avatar startup, RTMP, or public live.

## Proven setup

- Node: `user@100.73.190.96` (Windows console Session 1).
- Profile: `C:\Users\User\hafjet-live-listeners\profiles\tiktok-g5b`.
- Launch Chrome in the interactive console session through a temporary Scheduled Task with `LogonType Interactive`, then remove the task after launch.
- Never use a daily Chrome profile; never read, export, copy, or log cookies.

## Attach/read-only procedure

1. Tuan completes TikTok login manually in the dedicated profile, then supplies the exact private/test Live URL.
2. To permit DOM verification while retaining local cookies, stop only `chrome.exe` processes whose command line contains `tiktok-g5b`; do not delete the profile directory.
3. Relaunch the same profile to the exact URL with loopback-only CDP:
   - `--remote-debugging-address=127.0.0.1`
   - `--remote-debugging-port=9223`
   - `--remote-allow-origins=http://127.0.0.1:19223`
   - `--no-first-run --no-default-browser-check --new-window <exact-live-url>`
4. Verify `http://127.0.0.1:9223/json/version` returns 200 and the page list contains the exact URL. Do not navigate a different page.
5. From Hermes, use a loopback-only SSH local forward: `127.0.0.1:19223 -> Windows 127.0.0.1:9223`. Keep it scoped and tracked; no public bind.
6. Inspect only via CDP `Runtime.evaluate` or DOM query. TikTok LIVE comments currently use `[data-e2e="chat-message"]`; count visible message nodes for a point-in-time count. Confirm the room through tab title/URL.
7. Report attach result and observed count only; leave browser attached and wait for the next explicit approval.

## Guardrails

- The Chrome 151 CDP WebSocket rejects tunneled origins unless the exact `--remote-allow-origins=http://127.0.0.1:19223` argument is present. Do not use a broad public listener.
- Do not touch `[data-e2e="room-chat-input-field"]`, send controls, likes, gifts, or any page action.
- A valid room DOM does not authorize Stage 1 reply/speak validation. That requires a new instruction.
