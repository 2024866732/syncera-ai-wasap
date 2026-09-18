# G5b Windows HITL — CDP, read-only ingress, one-speak guard

Use for approved G5b private TikTok validation only. Never use for public/G6/G7.

## Windows interactive Chrome

- Node: `user@100.73.190.96`; dedicated profile: `C:\Users\User\hafjet-live-listeners\profiles\tiktok-g5b`.
- Launch Chrome through a Windows Scheduled Task with `LogonType Interactive` so it opens in the active console session, not SSH Session 0.
- Use `--user-data-dir=<dedicated profile> --no-first-run --no-default-browser-check`.
- Before a CDP restart, close **only** Chrome processes whose command line contains `tiktok-g5b`; never delete the profile directory.
- CDP must bind only to loopback: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9223`.
- If Hermes uses a local SSH forward to `127.0.0.1:19223`, Chrome 151 requires exact origin allowlisting: `--remote-allow-origins=http://127.0.0.1:19223`. Do not use broad network binds.
- Verify `/json/version` returns HTTP 200 and `/json/list` contains the exact approved TikTok URL/title before DOM reads.

## Passive TikTok chat inspection

- Read via CDP `Runtime.evaluate` only. Never send page clicks, key presses, comments, or replies.
- Current TikTok LIVE comment selector: `[data-e2e="chat-message"]`; filter visible nodes using `getBoundingClientRect()`.
- Treat the room title and exact URL as attach evidence. Count only visible `chat-message` nodes; do not fabricate real-comment evidence when none exists.
- A browser listener/typed-reply runner must remain stopped during passive/Stage-2 tests.

## Read-only orchestrator mode

A session has a `read_only` flag. When `true`, `/events/comment` must:

1. run Aina and mandatory price guard,
2. record the event/decision,
3. force returned action to `ignore` with reason `read_only`, and
4. leave the speak queue empty.

Use it to prove genuine ingress without starting the avatar. Verify `event_count`, `read_only=true`, and `queue_pending=0` after capture.

## Exactly one private avatar speak

Only after explicit approval, and only for a comment that matches the HAFJET static catalog/context:

1. Fresh RTX CB must be `run`; lock must be absent; no LiveTalking/worker already active.
2. Start existing LiveTalking and G5a RTX worker only; do not install models/weights.
3. Start a normal TikTok-only session, post **one** selected event, and assert the decision contains only a `speak` action (no `typed_reply`).
4. Extract the single queue job, then immediately pause the orchestrator and verify queue empty. Deliver that extracted job to the worker's dedicated job directory.
5. Require `ok_spoke` and `/humanaudio` body `code:0`; HTTP 200 alone is insufficient.
6. Cleanup: worker releases `LIVE_GPU_LOCK`; stop only the LiveTalking process started by this run; verify `LOCK_HELD=0`, `:8010` not available, post-speak CB nominal, orchestrator paused, queue empty.

## Suitability rule

Do not speak merely because a live comment is gadget-adjacent. If the comment is for a different merchant/catalog and Aina would respond with unrelated HAFJET products, skip it. Report the safe skip; do not force a reply.
