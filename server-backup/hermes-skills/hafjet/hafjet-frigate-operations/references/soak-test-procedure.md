# Frigate Soak-Test Monitor Procedure (dual-camera, office PC)

Used to validate Frigate 1-cam or dual-cam changes without touching production detection path. Run 15–45 min, sample every 60s, auto-stop Frigate on worker damage.

## Monitor pattern (Python, runs on office PC)
Write a Python script that loops `DURATION_SEC` with `INTERVAL_SEC=60`, emits JSONL to `/mnt/cctv/logs/frigate-soak-<ts>.jsonl`, and on each sample collects:

- `free -b | awk '/Mem:/ {printf "%s %s %s", $2,$3,$7}'` (total/used/available)
- `cut -d' ' -f1-3 /proc/loadavg`
- worker: `systemctl is-active cctv-worker`, `systemctl show cctv-worker -p MainPID --value`, `-p MemoryCurrent --value`, `curl -s -m3 http://127.0.0.1:8091/health`
- Frigate: `docker stats frigate --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"`, `docker inspect -f "{{.State.Health.Status}}" frigate`
- per-camera: `curl -s http://127.0.0.1:5000/api/stats` → for each camera `camera_fps|process_fps|skipped_fps|detection_fps`, detector `inference_speed`
- worker journal counts (last 70s): Detection started / loop ended / Face attr / Cannot open / Reconnecting

Launch: `nohup python3 /tmp/frigate_soak_monitor.py >/mnt/cctv/logs/frigate-soak-monitor.out 2>&1 &` (rsync script up first; heredocs over ssh get mangled — write the file locally then `rsync -az`).

## Guards (auto-stop Frigate)
- worker `ActiveState != active` OR `MainPID != pre_pid` → `cd ~/frigate && docker compose stop frigate`
- worker `MemoryCurrent > 900*1024*1024` → stop
- `Detection started` count > 3 in 70s (RTSP reconnect storm) → stop

## Report cadence
T0 baseline, then T+5 / T+10 / T+15 (bg `sleep 900` with notify). Healthy = process_fps ≈ camera_fps, skipped_fps ≈ 0, no 401 in `docker logs frigate` after boot, worker PID unchanged, worker mem flat (<900MB).

## Resource expectations (i3-2100, 16GB)
- Frigate 1-cam (720p@3-5fps): ~120–200% CPU, ~700–900MB RAM.
- Dual-cam (720p@3 + 540p@2): ~170–200% CPU, ~850MB–1GB RAM, inference 90–140ms.
- Host load during boot spikes (3–6) then settles <1.5; worker RSS flat ~350–500MB.
