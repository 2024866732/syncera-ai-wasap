# G2 Task 5 — Edge-TTS + WebRTC speak capture (2026-08-17)

## Goal

text/audio → LiveTalking wav2lip → previewable avatar **≥30s** without OBS formal gate.

## Verified stack

| Piece | Value |
|-------|--------|
| Server | `~/hafjet-live/LiveTalking` + `venv-livetalking` |
| Start | `app.py --transport webrtc --model wav2lip --avatar_id wav2lip256_avatar1 --tts edgetts --listenport 8010` |
| TTS sample | `edge-tts --voice ms-MY-YasminNeural` → `~/hafjet-live/wav/aina_demo_my.wav` (~31s) |
| Drive | `POST /humanaudio` (wav) after WebRTC `POST /offer` yields `sessionid` |
| Capture | `~/hafjet-live/bin/speak_capture_mp4.py` (aiortc recv video → libx264 mp4) |
| Evidence | `~/hafjet-live/logs/g2_t5_avatar_speak.mp4` **34.32s** / 858 frames; still `g2_t5_frame15.jpg` |
| GPU while speak | ~41–44°C, VRAM ~3085 MiB, CB `action=run` |

## Preferred preview order

1. Client MP4 capture (automation / evidence)  
2. Windows browser → `http://localhost:8010/index.html` (WSL localhost forward)  
3. OBS **display capture** of that browser  
4. Virtual cam — deferred (no `/dev/video*` in WSL)

## Commands (RTX via Office jump)

```bash
# sample TTS
$HOME/hafjet-live/venv-livetalking/bin/python -m edge_tts \
  --voice ms-MY-YasminNeural \
  --text "..." --write-media $HOME/hafjet-live/wav/aina_demo_my.mp3
ffmpeg -y -i ...mp3 .../aina_demo_my.wav

# start server (Python detach — avoid Hermes nohup block)
# see start_livetalking_t5.sh + Popen(start_new_session=True)

# capture ≥30s (use min_seconds*25 frame rule)
python ~/hafjet-live/bin/speak_capture_mp4.py \
  --audio ~/hafjet-live/wav/aina_demo_my.wav \
  --out ~/hafjet-live/logs/g2_t5_avatar_speak.mp4 \
  --min_seconds 32 --max_seconds 48
```

## Pitfalls (do not repeat)

1. **`/record` immediately after offer** — ffmpeg rawvideo `0x0`, breaks `process_frames` pipe; download 404.  
2. **Frame threshold `min_s * 15`** — exits ~20s; use `* 25` + wall clock.  
3. **Hermes `nohup` over SSH** — blocked; use RTX-side `start_new_session` launcher.  
4. **Kill/scp may need user approval** — if stop blocked, report path and ask Tuan to `pkill -f 'app.py --transport webrtc'` + `gpu_lock.py release`.  
5. **is_speaking poll alone ≠ frames** — always count video track frames for evidence.

## API cheat sheet

- `POST /offer` JSON `{sdp, type, avatar}` → `{sdp, type, sessionid}`  
- `POST /humanaudio` form `sessionid` + `file`  
- `POST /human` `{sessionid, text, type: "echo", tts: {voice: "ms-MY-YasminNeural"}}`  
- `POST /is_speaking` `{sessionid}` → `data: bool`
