# G5b TikTok.com — CLOSED PASS (2026-09-20)

Owner-declared live test complete. Evidence from RTX WSL + Windows CDP listener
on the same PC as LiveTalking (not the unused HITL node `100.73.190.96`).

## Room
- URL (owner-supplied): `https://www.tiktok.com/@hafizi.raub/live`
- Orch session left **standby**: `ws_live_raub_v3_2h` (tiktok, not paused)
- LT session: `ba5a6557-5b5c-49e2-8011-a20f52d359fc` avatar **Aina** / `ms-MY-YasminNeural`

## Stop (clean)
- Listener Windows PID 39916 → Stop-Process → `py=0`
- Consumer WSL PID 42052 → SIGTERM → `CONSUMER_OFF`
- Queue at stop: **0 / 0 / 0**
- GPU after stop: **5,623 MB / 50°C** (LT idle; TTS process gone)
- LT `:8010` and orch `:8740` **left up** (standby)

## Metrics (this live window)

| Metric | Value |
|--------|-------|
| Listener elapsed | 1,060 s (~17.7 min) |
| `room_live` | true |
| `chat_socks` | 1 |
| `reloads` | 0 |
| Frames | 216 |
| `seen_comment` | 10 |
| Enqueued | 9 (1 emoji-only dropped by spam guard: ✊) |
| Consumer jobs | **9 / 9 `ok_spoke`**, `humanaudio_code: 0`, ack `done` |
| Fail / CB stop | **0** |
| Peak VRAM | **9,933 MB** (before) / **9,923 MB** (after) |
| Peak GPU temp | **57°C** |
| Inner CB | 10,752 MB — buffer ~819 MB (≥600 MB) |
| Outer guard | 11,000 MB / 80°C — not hit |
| RTF | 1.034 – 1.387 |

Comments decoded (host `HAFJET MALAYSIA` + one `HAFIZI GAMING`):
Assalamualaikum, Hello, Kak, Esok bukak ke kedai, Ade repair iphone,
Esok bukak ke kedai?, Servis bateri iphone boleh ke?, Kat mana nie kl ke?

## Topology used
Windows Chrome CDP `127.0.0.1:9223` profile `tiktok-rtx` → `cdp_ws_listener.py`
`--reload --force-visible --room-url=https://www.tiktok.com/@hafizi.raub/live`
→ orch `127.0.0.1:8740` via RTX reverse tunnel `18744` →
`autospeak_consumer_loop.py` / `speak_queue_consumer.py` (`HAFJET_SESSION_PICK_V1`)
→ Chatterbox → LiveTalking `/humanaudio` on session Aina.

## Gate
**G5b = CLOSED PASS** as of 2026-09-20 23:57 MYT, by owner confirmation
("ujian live selesai dan berjalan lancar sepenuhnya") plus the table above.

Still **not** G6/G7: no multi-platform 15 min, no public HAFJET go-live.
G4c Shopee/IG listeners remain incomplete.
