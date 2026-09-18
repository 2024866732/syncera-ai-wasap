# Windows RTX local TikTok listener (2026-08)

Use when the PC Office / separate Windows HITL node is unavailable and all live components run on the RTX PC:

```
Windows RTX host: Chrome TikTok listener + TikTok Live Studio capture
RTX WSL2:          LiveTalking :8010
Hermes:            orchestrator / Aina / catalog
```

## Verified setup

1. Keep Chrome profile **local to the Windows RTX user**, e.g.
   `C:\Users\<WindowsUser>\hafjet-live-listeners\profiles\tiktok-rtx`.
   Never copy, inspect, export, or delete cookies/profile storage.
2. Launch interactive Chrome on the active Windows console with:
   - `--user-data-dir=<dedicated-profile>`
   - `--remote-debugging-address=127.0.0.1`
   - `--remote-debugging-port=9223`
   - exact supplied TikTok live URL.
3. Verify with **Windows PowerShell** `Invoke-RestMethod http://127.0.0.1:9223/json/list`.
   WSL may not be able to reach a Windows loopback-bound CDP port; that is expected and preserves containment.
4. Run the DOM/WebSocket CDP reader natively on Windows (Python + `websocket-client`), not on WSL. Keep it bounded, deduplicated, and read-only to TikTok.
5. To let the native Windows listener call Hermes without a public bind, create a reverse SSH tunnel that exposes Hermes only at RTX WSL `127.0.0.1:<port>`. Windows can reach that loopback port through localhost forwarding; verify both WSL and Windows receive `/health` 200 before enabling ingress.
6. The listener must enforce: max speak count, >=25s cooldown, spam/emoji/off-topic filtering, and speak-only decision validation. Do not invoke TikTok typed-reply controls.
7. On exit or max count, call orchestrator pause and verify queue empty. Do not stop/restart an owner-managed LiveTalking process.

## Existing LiveTalking capture

When Aina is already captured into TikTok Live Studio, discover the existing WebRTC UUID via `GET /api/admin/sessions`, then call `/human` using that UUID. Never create `/offer` or restart `app.py`. Require response body `code:0`; session count must remain unchanged.

## Active session UUID refresh

Read `GET /api/admin/sessions` immediately before **every** bounded run. Reopening/recreating the owner-facing WebRTC UI can change the UUID even though LiveTalking remains healthy. A `/human` response body `{"code": -1, "msg": "session not found"}` is a stale-UUID safety stop: pause the run, cancel any queued work, refresh the UUID, and restart only with the new value. HTTP 200 alone is not success; require body `code:0`.

## Queue hygiene for direct `/human` dispatch

If comment evaluation is posted through the orchestrator, its `speak` action can enqueue a job. When the Windows listener then sends that same text directly to LiveTalking `/human`, it must acknowledge or cancel the matching queue job after `code:0`. Otherwise a later consumer could replay it and cause duplicate speech. At completion, pause and verify both pending and in-flight queues are empty.

## Operational caveat

A bounded auto-listener may receive no new comments. Report zero comments/zero speaks honestly, still pause the orchestrator, and leave the owner-managed Chrome, Live Studio, and LiveTalking processes running.