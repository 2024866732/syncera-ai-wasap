# G5b fresh run after RTX PC reboot (verified 2026-09-20)

Owner-managed TikTok auto-speak rig on the RTX Windows+WSL box. Use this
after Tuan powers the PC back on and asks for a clean VRAM / G5b start.
Companion: `livetalking-vram-ceiling-and-session-picking.md`,
`go-live-preflight-2026-09.md`, `tiktok-live-ws-frame-listener.md`.

## What a clean boot looks like

| Check | Clean | Dirty |
|---|---|---|
| GPU | ~3.7 GB, no compute apps | leftover `app.py` / consumer |
| LT `:8010` | not listening | old 19 h session (~6.9 GB) |
| Chrome CDP 9223 | 0 chrome | leftover tabs |
| `/tmp/autospeak_consumer_loop.py` | **often missing** (WSL `/tmp` wiped) | present |
| Azure `ss … 18744` | often empty | — |

Reverse tunnel `-R 127.0.0.1:18744:127.0.0.1:8740` **listens on RTX, not Azure**.
`ss` on Hermes showing no 18744 is a **false negative**. Proof is RTX
`curl -s -m 6 http://127.0.0.1:18744/health` → HTTP 200 + orch JSON.

## Launch order (do not skip)

1. **Baseline GPU** (`nvidia-smi` temp + memory.used). Kill orphan
   `app.py` / `autospeak_consumer_loop` if any.
2. **LT fresh** from `~/hafjet-live/LiveTalking` with the **production Aina**
   flags (the stock `start_lt_polish.sh` / `start_livetalking_t5.sh` still
   default to `wav2lip256_avatar1` — do **not** use those as-is):

   ```
   venv-livetalking/bin/python app.py \
     --transport webrtc --model wav2lip --avatar_id Aina \
     --batch_size 16 --modelres 192 --tts edgetts \
     --REF_FILE ms-MY-YasminNeural --listenport 8010
   ```

   Detach with `setsid nohup … < /dev/null &` (Hermes foreground SSH will
   otherwise sit on the server). Expect `:8010` HTTP 200,
   `/api/admin/sessions` → `sessions: []`, VRAM **~6.4–6.5 GB**.
3. **Chrome CDP** via
   `C:\Users\PC CUSTOM\hafjet-live-listeners\relaunch_chrome.sh`
   (kills chrome, runs `launch_chrome.ps1`: profile `tiktok-rtx`,
   `--remote-debugging-port=9223 --remote-allow-origins=*`).
4. **One** LT client tab `http://localhost:8010/index.html`.
   - Set `#offerAvatar` = `Aina`.
   - Start control is `#btnStart` labelled **开始连接** (not English "Start").
   - Tab often launches `visibilityState=hidden` → TikTok/WebRTC starve.
     `Page.bringToFront` + `Emulation.setFocusEmulationEnabled` then a
     **real** `Input.dispatchMouseEvent` on `#btnStart` (DOM `.click()` did
     **not** negotiate). Accept only
     `pc.connectionState=connected`, ICE `connected`, `<video>` 400×736
     `readyState=4`, `offerError` empty.
5. **`discover_session()`** via `venv-chatterbox` importing
   `~/hafjet-live/bin/livetalking_glue/speak_queue_consumer.py`:
   `{count: 1, avatar_id: "Aina", sessionid: <new uuid>}`.
   UUID **changes every LT restart** — never reuse `33ce175e` / `844f5989`.
6. **Stale orch queue** — a live from days ago can leave `pending` speak
   jobs (observed: 7 jobs dated 2026-09-11). Starting the consumer will
   make Aina speak those lines into an empty room. Cancel first:

   `POST http://127.0.0.1:8740/queue/ack` `{"id": "<uuid>", "status": "cancelled"}`

   until `/queue` is `0/0/0`. Do **not** `/session/stop` (standby session
   stays up: `ws_live_raub_v3_2h`).
7. **Consumer loop** — if `/tmp/autospeak_consumer_loop.py` is gone, copy
   `scripts/autospeak_consumer_loop.py` from this skill to RTX `/tmp/`
   then:

   ```
   VAL_ORCH_URL=http://127.0.0.1:18744 MAX_JOBS=300 MAX_SEC=14400 \
     ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/autospeak_consumer_loop.py
   ```

   Idle proof: process alive, JSON `event: start`, VRAM stays ~6.2 GB,
   queue still 0. Do **not** start the TikTok WS listener until Tuan
   sends the exact `/live` URL.

## VRAM band (fresh vs 19 h session)

| State | VRAM |
|---|---|
| GPU idle after reboot | ~3,725 MB |
| LT Aina fresh, no TTS | **~6,220–6,477 MB** |
| LT Aina after ~19 h | ~6,991 MB |
| + Chatterbox resident | ~10,937 MB → inner CB **10,752 MB** fires |

Fresh LT is the cheap VRAM win. Unload-TTS / raising `MEM_STOP_MB` still
needs Tuan's explicit safety-threshold phrase.

## Gate honesty

This sequence **prepares** G5b; it does not close G5b. Close only after a
scheduled private TikTok live with HITL + the approved `/live` URL and
sustained `ok_spoke` (not 1–2 jobs).
