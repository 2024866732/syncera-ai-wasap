# Fresh live rig boot (PC reboot → TikTok attach)

Verified 2026-09-20 after Tuan powered the RTX PC back on, then attached
`https://www.tiktok.com/@hafizi.raub/live`. Companion to
`go-live-preflight-2026-09.md`, `tiktok-live-ws-frame-listener.md`,
`livetalking-vram-ceiling-and-session-picking.md`.

## What a reboot actually kills

WSL `/tmp` is empty. LiveTalking `:8010`, Chrome CDP, WS listener, consumer,
and the reverse tunnel process on Azure are all gone. Orchestrator on Azure
(`:8740`) usually **survives** — including any **stale speak jobs** from the
last live.

## Order (do not skip)

1. **Reachability** — `ssh hafjet@100.65.152.29` + `nvidia-smi` idle.
2. **Tunnel proof on RTX, not Azure.** `-R 127.0.0.1:18744:127.0.0.1:8740`
   listens on the **RTX** loopback. `ss` on Azure showing no `:18744` is
   **expected**, not a dead tunnel. Prove: from RTX
   `curl -s -m 6 http://127.0.0.1:18744/health` → HTTP 200.
3. **Cancel stale orch queue** before any consumer. Jobs dated from a previous
   live will make Aina speak leftover lines the moment the consumer starts.
   `POST /queue/ack {"id", "status":"cancelled"}` for each stale pending id;
   confirm `GET /queue` count 0. Do **not** `POST /session/stop` (standby
   session stays up).
4. **LiveTalking with production Aina flags** (the stock
   `start_lt_polish.sh` / `start_livetalking_t5.sh` default
   `wav2lip256_avatar1` — wrong avatar):
   ```
   cd ~/hafjet-live/LiveTalking && ~/hafjet-live/venv-livetalking/bin/python app.py \
     --transport webrtc --model wav2lip --avatar_id Aina --batch_size 16 \
     --modelres 192 --tts edgetts --REF_FILE ms-MY-YasminNeural --listenport 8010
   ```
   Detach via `setsid`/`Popen(start_new_session=True)` — nested `nohup` in
   foreground SSH hangs. Expect idle VRAM **~6.2–6.5 GB** (a 19 h leftover
   session had grown to ~6.99 GB).
5. **Chrome CDP** — `relaunch_chrome.sh` → profile
   `hafjet-live-listeners\profiles\tiktok-rtx`, port 9223,
   `--remote-allow-origins=*`.
6. **One Aina client tab** — `http://localhost:8010/index.html`. Set
   `#offerAvatar` = `Aina`. The Start control is **`btnStart` / `开始连接`**,
   not English "Start". `element.click()` does not negotiate; use
   `Page.bringToFront` then `Input.dispatchMouseEvent` on the button box.
   Accept only `pc.connectionState=connected`, video ~400×736 `readyState=4`,
   `/api/admin/sessions` **exactly 1** with `avatar_id=Aina`.
7. **`discover_session()`** via the patched glue (prefer Aina / non-empty
   `REF_FILE`). Must return `count: 1` + that sessionid.
8. **Re-scp `/tmp/autospeak_consumer_loop.py`** (reboot wipes `/tmp`), then:
   ```
   VAL_ORCH_URL=http://127.0.0.1:18744 MAX_JOBS=300 MAX_SEC=14400 \
     ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/autospeak_consumer_loop.py
   ```
9. **Listener only after Tuan's exact `/live` URL.** Stock
   `start_ws_listener.ps1` has **no** `--room-url`. Launch with a **single
   quoted ArgumentList string** (paths contain `PC CUSTOM`):
   ```
   Start-Process python.exe -ArgumentList "`"$script`" --reload --force-visible --max-sec=14400 --max-enq=300 --rate-s=5 --room-url=https://www.tiktok.com/@hafizi.raub/live"
   ```
   Passing `-ArgumentList` as an **unquoted array** makes Python open
   `C:\Users\PC` → `SyntaxError: leading zeros…` and `hasexited=True`.

## Ready bar (this session)

Listener PID alive, `force_visible_armed`, `room_live: true`, `chat_socks ≥ 1`,
`reloads: 0`, consumer idle, queue 0/0/0, LT 1× Aina connected. `chat_msgs: 0`
in the first minute of a quiet room is **not** a dead listener — wait; STOP
only if 3 min of a busy live still yields 0 chat frames.

## VRAM still binding

Idle LT ~5.5–6.5 GB is in band. First speak still loads Chatterbox resident
(~+4 GB). Inner CB `MEM_STOP_MB=10752` fires before the 11000 guard if TTS is
never unloaded (`maybe_unload_idle()` still unused). Do not raise CB without
Tuan's explicit safety approval.
