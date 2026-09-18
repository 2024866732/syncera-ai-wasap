# G5b Stage 2 — Read-only live comment ingestion

## Purpose

Use this method only after Stage 1 has attached an approved dedicated browser profile to one exact TikTok Live room, and the user explicitly allows capture/process/logging but forbids every platform/GPU action.

## Safety invariant

A normal active orchestrator session is unsafe for this mode: `POST /events/comment` can produce a `speak` action and enqueue it. The `read_only=true` session flag is required.

Behavior:

1. Aina's normal `decide()` path runs with the static catalog and mandatory price guard.
2. The event and decision timing are logged in `SessionStore`.
3. Before dispatch, the API replaces any output with `ignore/read_only`.
4. No typed reply client is invoked and `SpeakQueue` must remain empty.

## Verified procedure

1. Confirm the local orchestrator health endpoint is HTTP 200.
2. Start only a TikTok session:

   ```json
   {"platforms":["tiktok"],"title":"G5b Stage 2 read-only","read_only":true}
   ```

3. Read only visible TikTok DOM nodes with selector `[data-e2e="chat-message"]` through the loopback-only CDP tunnel. Do not touch input, send, like, or navigation controls.
4. Normalize public node text into `user` and `text`, create unique event IDs, and POST to `/events/comment`.
5. Verify all of the following before report:
   - captured count equals session `event_count`;
   - every response has action `ignore` and reason `read_only`;
   - `/queue` has `pending: []`;
   - no RTX/LiveTalking process was started.
6. Run:

   ```bash
   .venv/bin/pytest -q \
     tests/test_schema.py::test_read_only_session_processes_and_never_enqueues_speak \
     tests/test_price_guard.py \
     tests/test_aina_brain_unit.py::test_llm_mock_invented_price_guarded
   ```

## Reporting boundary

Report a point-in-time visible capture count and a small public-comment sample. Do not claim continuous monitoring or exhaustive history. End in standby and wait for an explicit next-stage approval before enabling typed replies, speak queue workers, avatars, RTMP, or public live.
