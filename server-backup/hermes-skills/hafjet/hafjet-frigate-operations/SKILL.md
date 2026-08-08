---
name: hafjet-frigate-operations
description: Frigate NVR deploy/config/debug on HAFJET office PC.
---

# HAFJET Frigate Operations

Frigate NVR on the HAFJET office PC (`hafizi145@100.121.94.41`, hostname `hafjet-pc-office`, i3-2100 2C/4T, 16GB RAM, Ubuntu 26.04). Runs in Docker, loopback-only, CPU-only inference. Complements the Python cctv-worker (:8091) — do NOT confuse the two.

## Current state (2026-08-04)
- Frigate `0.17.2-3d4dd3a` on `ghcr.io/blakeblackshear/frigate:stable`, container `frigate`, healthy.
- Dual-camera LIVE: `entrance` (Tapo TC74, 1280×720 @ 3fps) + `outdoor_shop` (Tapo C560WS, 960×540 @ 2fps).
- UI `127.0.0.1:5000`, RTSP restream `127.0.0.1:8554` (loopback only). Media on `/mnt/cctv/frigate/media`, DB `/home/hafizi145/frigate/config/frigate.db` (docker mount `~/frigate/config -> /config`; the `/mnt/cctv/frigate/config` path does NOT exist — verify mounts with `docker inspect frigate --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`).
- Access from laptop: `ssh -L 5000:127.0.0.1:5000 hafizi145@100.121.94.41` → `http://127.0.0.1:5000` (first-boot user `admin`, password printed in `docker logs frigate`).

## Layout
```
~/frigate/
├── docker-compose.yml     # env_file .env; ports 127.0.0.1:5000/8554; shm 256mb
├── config/config.yml      # cameras, detectors, record
├── .env                   # credentials — TWO sets (see below)
└── config.yml.c3-draft    # backup/draft of camera-3 config
```
**Recording segments:** `/mnt/cctv/frigate/media/recordings/{date}/{hour}/{camera}/{ss.mm}.mp4` (verified 2026-08-04) — e.g. `.../recordings/2026-08-03/17/entrance/35.13.mp4`. NOT `{camera}/{date}/{HH}` as early drafts assumed. ~5k+ segments accumulate; scripts must filter by person events from the Frigate DB, never scan the whole tree.

## Steps

### 0. Frigate event DB (0.17) — querying for alerts/analytics (Fasa A pattern)
Schema gotchas that bite anyone querying `event` for alerting or visitor counts — full recipe in `references/frigate-event-db-queries.md`.
- **`score`, `top_score`, `false_positive` COLUMNS ARE ALL NULL in 0.17.** Real values live in the `data` JSON column (`data.score`, `data.top_score`, `data.max_severity`, `data.path_data`). Filtering `WHERE false_positive=0` silently returns nothing; parse `json_extract(data, '$.top_score')` instead.
- **Event volume is huge:** Frigate writes a segment every ~10s and many map to person events — measured ~450 person events in 24h across 2 cameras (score≥0.55), and ~100 events/hour in peak business hours. Any visitor counter MUST coalesce (e.g. events within 120s = 1 visitor), never count raw events.
- Event IDs are `epoch.float-randomsuffix` — sort by `start_time`, dedupe by ID when resuming.
- CPU detector on i3-2100 is noisy: filter `data.top_score >= 0.55` (matches Frigate `min_score`).
- `python3` (3.11) on the VPS has NO supabase module — use **`python3.10`** for Supabase SDK (or SQL Editor for DDL; PostgREST cannot run DDL).
- **Alert channel = TELEGRAM (keputusan 2026-08-08):** WhatsApp proactive alerts ALWAYS fail 131047 (24h session window; sent=True from HTTP 200 ≠ delivered — check message_delivery_status table). CCTV alerts go to Telegram group -5330700835 (group CCTV ALERT — Tuan betulkan dari draft awal -5098600919 yang salah) via Bot API; WhatsApp stays for customer service only. WAJIB guna parse_mode: HTML — nama kamera outdoor_shop ada underscore yang diinterpretasi Telegram Markdown sebagai italic tak berpasangan → HTTP 400 Bad Request. Full recipe: references/frigate-alert-channel-telegram.md.
- **Snapshot path (Frigate 0.17, untuk thumbnail alert):** /mnt/cctv/frigate/media/clips/{camera}-{event_id}.jpg (e.g. outdoor_shop-1786161172.002571-y08b8j.jpg, ~100-200KB). Thumb kecil: clips/thumbs/{camera}/{event_id}.webp. Kirim via sendPhoto multipart dengan caption HTML — bold guna <b> (bukan *...* — Markdown asterisk tidak berfungsi dengan parse_mode HTML). Jika snapshot tiada, fallback sendMessage teks biasa. Implemented 2026-08-08 in cctv_alert_poller.py (Office PC): snapshot_path() + _send_photo().
- **Label alert mengikut kamera (keputusan 2026-08-08):** entrance (TC74) → 🛎️ Customer Masuk Kedai; outdoor_shop (C560WS) → 🚶 Orang Lalu Depan Kedai. Kedua-dua hantar snapshot. Snapshot kadang dijana lewat (event baru mungkin tiada .jpg serta-merta — poller fallback ke teks dan hantar lagi bila cron seterusnya).

### 1. Dual-credential camera config (critical)
Different cameras use DIFFERENT RTSP accounts. One `.env` set is NOT enough — use a `_C3` suffix for the second camera.

```bash
# ~/frigate/.env
FRIGATE_RTSP_USER=hafizi145%40gmail.com   # TC74 entrance (URL-encoded @)
FRIGATE_RTSP_PASSWORD=***                 # TC74
FRIGATE_RTSP_USER_C3=hafizi145            # C560WS outdoor (plain)
FRIGATE_RTSP_PASSWORD_C3=***              # C560WS
```
```yaml
# config.yml
cameras:
  entrance:
    ffmpeg:
      inputs:
        - path: rtsp://{FRIGATE_RTSP_USER}:{FRIGATE_RTSP_PASSWORD}@192.168.1.94:554/stream1
  outdoor_shop:
    ffmpeg:
      inputs:
        - path: rtsp://{FRIGATE_RTSP_USER_C3}:{FRIGATE_RTSP_PASSWORD_C3}@192.168.1.226:554/stream1
```
**Both cameras use stream1.** Never share one env pair across cameras with different accounts.

### 2. Apply config / .env changes — MUST `up -d --force-recreate`
`docker compose restart` reuses the OLD container env — .env edits do NOT take effect. Always:
```bash
cd ~/frigate && docker compose up -d --force-recreate
```
Verify env landed: `docker inspect frigate --format '{{range .Config.Env}}{{println .}}{{end}}' | grep FRIGATE_RTSP`

### 3. CPU-only tuning (i3-2100, no GPU/TPU)
- Detector: `cpu1`, `num_threads: 2` (don't starve cctv-worker which also runs ~40-50% CPU).
- entrance: 1280×720 @ 3fps; outdoor_shop: 960×540 @ 2fps (conservative).
- record: motion-only 5 days; `birdseye: false`; `mqtt: false`; `telemetry.version_check: false`.
- Expect ~120-200% container CPU, ~850MB-1GB RAM, inference ~90-140ms. process_fps should match camera_fps; skipped_fps ~0 when healthy.
- Frigate + cctv-worker together ≈ near full 4 threads — do not add a third camera without lowering fps/res further.

### 4. Soak test / monitor
Use a background monitor (see references/soak-test-procedure.md). Guards: worker PID change → stop Frigate; worker mem ≥900MB → stop; RTSP reconnect storm (>3 in 70s) → stop. Report at T+5/T+10/T+15 with process_fps per camera, CPU, worker mem, 401 count.

### 5. Rollback / stop
```bash
cd ~/frigate && docker compose down   # removes container + network, frees 5000/8554
```
Stop Frigate FIRST during 401/IP-block loops — watchdog retries extend the camera block.

## Pitfalls
1. **TP-Link source-IP block (the big one):** After repeated failed RTSP auth (401) from one source IP, the camera silently blocks that IP for a long time — even power-cycle may not clear it. Symptom: VLC from laptop (different IP) plays fine with the SAME URL that ffmpeg/Frigate from the server gets 401 on. Fix: change the source IP (Office PC LAN IP was changed .252 → .250) OR wait long. See references/tp-link-rtsp-401-ip-block.md for the full saga.
2. **Verify from host BEFORE starting container:** Once creds are correct, test `ffmpeg -rtsp_transport tcp -i "rtsp://user:pass@ip:554/stream1" -t 3 -f null -` from the office PC shell first. Only start Frigate after host ffmpeg succeeds. Every extra 401 extends the block.
3. **`docker compose restart` ≠ env reload.** Use `up -d --force-recreate` (step 2).
4. **Old-container 401 noise in logs:** during shutdown/restart you will see 401s from the dying container — check logs AFTER boot, not during.
5. **Frigate first boot:** creates default user `admin` with a random password printed once in `docker logs frigate`. Change it after soak if keeping the UI.
6. **Camera 401 + stream path:** TP-Link `stream2` may 401 while `stream1` works — verify the exact stream with ffmpeg before config.
7. **Never log raw RTSP passwords** — redact with sed (`rtsp://[^@]+@` → `rtsp://***:***@`) when writing test outputs to files.
8. Frigate masks credentials in its own error logs (`rtsp://*:*@...`) — good, don't un-mask.

## Related
- GPU re-analysis of Frigate recordings (YOLOv8n batch offload to RTX node) → `hafjet-cctv-gpu-offload`.

## Support files
- `references/tp-link-rtsp-401-ip-block.md` — full 401 debugging narrative + resolution steps.
- `references/soak-test-procedure.md` — monitor script pattern + guard logic + report cadence.
- `references/frigate-event-db-queries.md` — 0.17 event schema gotchas (score in `data` JSON, NULL columns), visitor-count coalesce recipe, alert-poller pattern, supabase-py via python3.10.
- `references/frigate-alert-channel-telegram.md` — WhatsApp 131047 root cause for proactive alerts, decision to move CCTV alerts to Telegram group -5330700835 (draft awal -5098600919 SALAH), bot-in-group verification, Tailscale serve single-root overwrite pitfall.
