# Active Windows RTX TikTok Listener → Existing LiveTalking Session

Use when Tuan is already live on the RTX Windows host: TikTok Live Studio captures an Aina LiveTalking WebRTC session, while Hermes must read TikTok comments and trigger the **same** avatar session. Do not restart `app.py` or create `/offer`.

## Guardrails

- Do not call `/offer`, restart `app.py`, or stop/release the owner-managed live GPU lock.
- Keep LiveTalking `:8010`, Chrome CDP, and Hermes bridge loopback-only; never expose them to LAN/Tailscale.
- Treat the session UUID as operational metadata; never send it in chat.
- Never invoke the TikTok chat input or typed-reply path.

## Proven local architecture

1. **Keep CDP host-local.** Launch a dedicated Chrome profile in the active Windows console with `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9223`.
2. **Run the TikTok CDP client natively on Windows.** A Windows-loopback Chrome CDP port is not reliably reachable from WSL; use Windows Python/PowerShell for `/json/list` and WebSocket `Runtime.evaluate` against visible `[data-e2e="chat-message"]` nodes.
3. **Bridge Hermes loopback only.** A reverse SSH forward may present the Hermes orchestrator as `127.0.0.1:18740` on the RTX WSL host; Windows host can call this local port. Verify `/health` from Windows before starting the listener.
4. **Resolve the current avatar UUID at every run start:** `GET http://127.0.0.1:8010/api/admin/sessions`. Require exactly the intended Aina `transport=webrtc` session.

## Existing-session speak test

1. Verify `GET /index.html` is HTTP 200 and inspect existing app/GPU state read-only.
2. Require expected avatar/model and initial `speaking` state from `/api/admin/sessions`.
3. Send an approved line only to the existing UUID:

```json
POST /human
{"text":"<approved text>","type":"echo","interrupt":false,"sessionid":"<existing UUID>"}
```

4. Success requires body `{"code":0,"msg":"ok"}` and unchanged session count. `speaking:true` is point-in-time backend playback evidence; visual mouth movement in Live Studio remains operator-confirmed.
5. For `/humanaudio`, use the same UUID and require body `code:0`; HTTP 200 alone is insufficient.

## Bounded auto comment → speak

1. Start a TikTok-only Hermes session and retain pause/kill control.
2. Read unique visible comments local to Windows, then filter **before** dispatch:
   - accept greetings and explicit static-catalog keywords only;
   - skip emoji-only, repetitive/spam, off-topic, and another merchant's products;
   - never invent prices; keep price guard enabled.
3. Require a **speak-only** Aina decision; any decision containing `typed_reply` is cancelled/skipped.
4. Enforce a hard max-speak count and a 25–30 s cooldown in the listener.
5. Forward approved text to `/human` with the current UUID and accept only `code:0`.
6. **Queue hygiene:** `/events/comment` can enqueue a speak job even if the listener sends `/human` directly. Claim/ack the matching event job after a successful direct speak, or cancel it on failure/unsafe decisions, so another consumer cannot replay it.
7. At max/time end call `/session/pause`; verify `is_paused=true` and queue empty.

## Recovery

A stale UUID can return `{"code":-1,"msg":"session not found"}` after a Live Studio/browser reconnect. Immediately pause the orchestrator and cancel pending queue work, resolve `/api/admin/sessions` again, update the listener to the active UUID, then begin a new bounded run. Do not restart LiveTalking simply to repair a stale UUID.

## Required report evidence

- Exact live URL/title from Windows CDP.
- Selected comment, spoken text, and `/human` body result.
- Speak count, cooldown and duration.
- Final paused state, queue empty, and current session count/state.
