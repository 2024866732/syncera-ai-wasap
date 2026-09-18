# G5b Stage 4 — Guarded Real-Room Soak

Use after explicit G5b Stage-4 approval for a bounded ≥10-minute real TikTok room soak.

## Safe operating shape

1. Confirm exact attached room through CDP and use only visible `[data-e2e="chat-message"]` nodes.
2. Start a TikTok-only session with `read_only=true`. This still runs Aina and price guard plus event logging, but replaces every outgoing action with `ignore/read_only` before dispatch.
3. Deduplicate comments deterministically from normalized `user + text`; do not read cookies or touch any TikTok action control.
4. Hold a LiveTalking WebRTC session only if GPU/lock soak is within the approved scope. Use a dedicated empty job directory so no speak can occur.
5. At a defined midpoint call `POST /session/pause`; retain the endpoint response time. On the first genuine post-pause comment, record the elapsed time to its `ignore/paused` decision. If none arrives, report event-observed latency unavailable rather than injecting a fake comment.
6. Call `POST /session/resume` only for the approved test window, then finish with `POST /session/stop`.

## Cleanup is an exit criterion

- Stop only the LiveTalking process started for the soak.
- Stop the worker gracefully where possible. If it was externally terminated, do not assume its Python `finally` ran through the SSH wrapper.
- Query `gpu_lock.py status`. If it shows `LOCK_HELD=1`, explicitly run `gpu_lock.py release`, then re-query until `LOCK_HELD=0`.
- Prove `:8010` returns no HTTP response, orchestrator is inactive, queue is empty, and circuit breaker is nominal.

## Reporting

State actual duration, event count, dispatched speaks (normally zero for guarded soak), pause API timing, event-observed pause timing or its unavailability, final GPU temperature/VRAM, CB status, and all cleanup checks.
