# Frigate CPU-only deployment & soak test (Office PC, 2026-08-03)

Context: Tuan Hafizi wants browser live-view + NVR-style recording alongside the OpenCV `cctv-worker`. Frigate runs as a Docker container on the same Office PC (i3-2100 2C/4T, 16 GB RAM). It is a **sibling service** — never let it starve or kill cctv-worker.

## Architecture decisions

- Image `ghcr.io/blakeblackshear/frigate:stable` (0.17.2 observed). `restart: "no"` for soak (manual lifecycle), not `unless-stopped` until approved for production.
- **Bind loopback only**: `127.0.0.1:5000:5000` (UI), `127.0.0.1:8554:8554` (RTSP restream). Port 8555/udp (go2rtc/webrtc) will still show as exposed by the image default — acceptable, it listens inside container.
- `shm_size: "256mb"` (FFmpeg shared memory).
- Volumes: `./config:/config` (config.yml + frigate.db), `/mnt/cctv/frigate/media:/media/frigate`, `/etc/localtime` ro. **Do NOT double-mount a second volume onto /config** — it hides config.yml.
- Secrets via `env_file: .env` with `FRIGATE_RTSP_USER` / `FRIGATE_RTSP_PASSWORD`; config uses `rtsp://{FRIGATE_RTSP_USER}:{FRIGATE_RTSP_PASSWORD}@IP:554/streamN`. Matches the worker's CAMERA_1_RTSP_URL (username may be URL-encoded `%40`).
- No `privileged`, no `/dev` devices, no Coral TPU — pure CPU.

## config.yml gotchas (0.17.x)

- **Do NOT set `model.path`** (e.g. `/cpu_model.tflite`) — that file does not exist in the image; leave default CPU model. Detector: `cpu1: {type: cpu, num_threads: 2}`.
- `database.path: /config/frigate.db` (lives on the /config bind mount).
- Record retention in 0.17 uses per-mode `retain:` blocks (`alerts`, `detections`, `continuous`, `motion`) with `days:` — old `mode: motion` single-key form is replaced.
- `live.streams:` mapping (e.g. `streams: {entrance: entrance}`) replaces the old flat `live.stream_name`.
- First boot: Frigate enables auth and auto-creates `admin` user — **password printed once in `docker logs frigate`** (look for "Created a default user"). Save it before more logs bury it; recommend changing after soak if kept.
- Expected benign startup logs: HomeKit config warning, "Did not detect hwaccel… recommended" and "CPU detectors are not recommended… trial purposes" — both fine for this machine (Sandy Bridge has no usable hwaccel path).
- `/api/version` may 500 briefly while FastAPI boots (nginx upstream auth not yet up) — retry after ~10–30 s; check `docker inspect -f "{{.State.Health.Status}}" frigate` → healthy.

## CPU tuning (measured on i3-2100, 1 camera TC74 720p)

| detect fps | Frigate CPU | process_fps | skipped_fps | verdict |
|-----------|-------------|-------------|-------------|---------|
| 5 | ~224–254% at boot, settles ~75%+ | lags (3.8–5.1, skips up to 3.8 during activity) | non-zero | high, contention when events active |
| 3 | **~48–75%** | steady 3.0–3.1 | ~0.0 | **recommended 1-cam** |
| 2 (960×540) | target ~30–50% | — | — | **recommended for 2nd camera** |

Rule of thumb for this 2C/4T host: keep detect pixels×fps total low; for a 2nd camera prefer **960×540 @ 2 fps** and object track = person only. `inference_speed` ~50–100 ms is normal for CPU TFLite.

## Soak-test procedure (guards protect cctv-worker)

Use a standalone Python monitor (not in container) sampling every 60 s for the approved window, writing JSONL under `/mnt/cctv/logs/frigate-soak-*.jsonl`:

- Record: host load, `free -b` mem, `systemctl show cctv-worker -p MainPID/MemoryCurrent`, worker `/health`, `docker stats frigate`, `docker inspect` health, Frigate `/api/stats` cam fps (camera_fps|process_fps|skipped_fps|detection_fps|inference_speed), redacted journal category counts (Detection started / loop ended / Face attr / Cannot open / End of video / Reconnecting).
- **Auto-stop Frigate (guard) if any of:**
  1. worker state != active or PID changed (worker generation boundary)
  2. worker MemoryCurrent > 900 MB
  3. `Detection started` > 3 in ~70 s window (RTSP reconnect storm)
- Capture a pre-start baseline (PID, memory, health, docker stats, version, uptime) and a T0 file before `docker compose up`.
- Report cadence per approval: T0 immediately, then every ~15 min (use background sleep+notify pattern), final at window end. Never report fabricated samples — read real `docker stats` / api values.

## Operational notes

- `ghcr.io` pull may fail once with DNS timeout (`lookup ghcr.io on 127.0.0.53:53: i/o timeout`) — retry; second pull succeeds.
- Config-change flow used successfully: write draft as `config/config.yml.c3-draft`, **show full content + summary, wait for written approval**, then copy to `config.yml` + `docker compose restart`. Do not restart on the approval to *prepare* config — only on approval to *apply*.
- Frigate default admin password change (if kept past soak) is a separate approved step.
- Camera 3 (C560WS `192.168.1.226:554/stream1`) draft = 960×540 @ 2 fps, person only, same env credentials — approved-draft state (config/config.yml.c3-draft exists; applied+restarted 2026-08-03, then blocked on 401; multi-cam stays gated on 1-cam soak + CPU headroom + resolved auth).

## Camera auth diagnosis: 401 on TP-Link RTSP (added 2026-08-03)

Symptom: `ffmpeg ... 401 Unauthorized` from `DESCRIBE`; Frigate `cameras.<name>.camera_fps: 0.0`; watchdog logs "Ffmpeg process crashed unexpectedly". **Network is fine** — the camera is answering auth challenges, not refusing connections.

Diagnosis ladder — do this BEFORE touching Frigate config or restarting:
1. `ping <cam_ip>` + `</dev/tcp/<cam_ip>/554` — unreachable ⇒ network; reachable ⇒ proceed.
2. Raw RTSP probe without auth to confirm server alive + auth required:
   ```bash
   exec 3<>/dev/tcp/192.168.1.226/554
   printf "OPTIONS rtsp://192.168.1.226:554/ RTSP/1.0\r\nCSeq: 1\r\n\r\n" >&3
   ```
   `RTSP/1.0 200 OK` with `Public: DESCRIBE, SETUP...` = alive; a `DESCRIBE` returning `401` + `WWW-Authenticate: Basic realm="TP-Link IP-Camera"` (and Digest) = credentials rejected.
3. Test matrix via `ffmpeg -rtsp_transport tcp -i "rtsp://U:P@IP:554/<path>" -t 2 -f null -`:
   - paths: `stream1`, `stream2`, `h264/ch1/main/av_stream`
   - usernames: plain (`hafizi145`), `%40`-encoded email (`hafizi145%40gmail.com`), `admin`
   - **401 on ALL combinations = the device's own RTSP "Camera Account" is not enabled or password differs — NOT a stream/path/user-format issue.** Stop guessing credentials.
4. Fix is on-device (user must do it): Tapo app → ⚙️ Advanced Settings → **Camera Account** → enable RTSP, set/verify username + password (separate from Tapo app login). Only after user confirms, re-test with ffmpeg, then update `~/frigate/.env` and restart Frigate.

### IP lockout discovery (2026-08-03, decisive)

Even after the user verified the correct Camera Account credentials and closed VLC, ffmpeg from the Office PC still got **401 for the same URL that VLC (laptop) played successfully**. Chain of evidence that resolved it:

1. **Same device, no IP conflict:** `arp -a`/`ip neigh` on BOTH the laptop and the Office PC showed the same MAC `EC-B9-31-8D-DC-95` for `192.168.1.226`. OUI lookup (web search `"EC:B9:31" MAC OUI vendor`) → **TP-Link Systems Inc** — confirms it IS the C560WS, not a duplicate-IP imposter.
2. **Lockout hypothesis:** ~10+ earlier 401 probes from the server's IP (`192.168.1.252`) put that source IP in a temporary auth-fail lockout on the TP-Link device. The laptop's different IP was not locked, so VLC worked. Waiting 90 s did not clear it; power-cycle or 30–60 min likely needed.
3. **Rule:** once you have 3–4 consecutive 401s, **STOP probing** — every further attempt extends the lockout. Do NOT brute-force username/password variants. Have the user verify credentials on-device (Tapo app → Camera Account, use "Show password" — TP-Link often auto-generates a password that differs from what the user typed), then power-cycle the camera or wait 30–60 min, then run ONE test from the consuming host.
4. **VLC-vs-ffmpeg is a diagnostic signal, not a contradiction:** same URL OK on laptop but 401 from server = lockout (or 1-session RTSP client limit if VLC is still streaming) — not a stream-format problem. Rule out IP conflict first via matching MACs.

Also confirmed this session: user later stated C560WS RTSP path is **`stream1`** at `192.168.1.226:554` (earlier `stream2` was superseded by user correction), and the on-device facial recognition has **no reliable export** (app-trapped) — so Frigate/worker get plain person detection, never face-ID from the C560WS. **Re-verify the actual stream path from the user each session** — TP-Link camera path names are not consistent across models.
