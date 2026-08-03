# Frigate 1-camera soak prep (Office PC, 16 GB)

## Host reality
- Office PC: i3-2100 2C/4T, **16 GB RAM** (not the Hermes VPS 1 GB).
- Baseline: cctv-worker often ~350–500 MB RSS and ~40–50% CPU; xiaomi-ingest ~50–80 MB; **~14–15 GiB RAM still available**.
- Constraint for Frigate is **CPU** and **second RTSP client** on TC74, not RAM.

## Scope gate
- **In:** TC74 entrance only — `192.168.1.94:554/stream1`.
- **Out until soak green:** C560WS outdoor (`192.168.1.226/stream2`), multi-cam Frigate, continuous 24/7 record, birdseye, MQTT, public binds.
- Prep files only until user reviews config and approves soak start.

## Layout on Office PC
```
~/frigate/
  docker-compose.yml
  config/config.yml
  .env.example          # copy → .env (secrets)
  README.md
/mnt/cctv/frigate/media   # recordings bind
```

## docker-compose essentials
- Image: `ghcr.io/blakeblackshear/frigate:stable`
- `restart: "no"` for soak (manual lifecycle)
- `shm_size: "256mb"`
- Volumes: `./config:/config`, `/mnt/cctv/frigate/media:/media/frigate`, `/etc/localtime:ro`
- Ports: **`127.0.0.1:5000:5000`**, `127.0.0.1:8554:8554` only
- CPU-only: no privileged, no Coral devices
- `env_file: .env` for RTSP secrets

## config.yml essentials
- `mqtt.enabled: false`, `birdseye.enabled: false`
- Detector: `type: cpu`, `num_threads: 2`
- Camera `entrance`: roles detect+record
- Path: `rtsp://{FRIGATE_RTSP_USER}:{FRIGATE_RTSP_PASSWORD}@192.168.1.94:554/stream1`
- Detect: **1280×720 @ 5 fps**
- Objects: person only (min_score ~0.55, threshold ~0.65)
- Record: motion retain ~5 days
- Default CPU model shipped in image — avoid brittle custom `model.path` unless verified for that image tag

## Secrets
```bash
cd ~/frigate && cp .env.example .env
# FRIGATE_RTSP_USER / FRIGATE_RTSP_PASSWORD must match worker CAMERA_1
# If username contains @, use URL-encoded form (%40) as worker does
```

## Mount pitfall
Do **not** mount both a file `config.yml` and a directory onto `/config`, or two directories onto `/config`. Single bind `./config:/config` keeps `config.yml` + `frigate.db` together.

## Soak start (only after explicit approval)
```bash
cd ~/frigate
docker compose pull   # optional first time
docker compose up -d
docker stats frigate --no-stream
curl -s http://127.0.0.1:5000/api/version
# parallel: worker health + MemoryCurrent + CPU
systemctl show cctv-worker -p MainPID -p MemoryCurrent
curl -s http://127.0.0.1:8091/health
```
Laptop tunnel: `ssh -L 5000:127.0.0.1:5000 hafizi145@100.121.94.41` → browser `http://127.0.0.1:5000`

### First-boot auth (Frigate 0.17+)
On first start Frigate may enable auth and log a default admin password once (`User: admin`). Read it from `docker logs frigate` on the server — do not invent. Early `/api` 500 while FastAPI starts is normal for ~30–60s; recheck when health is `healthy`.

## Observed soak T0 (2026-08-03, 1-cam)
| Metric | Observation |
|--------|-------------|
| Version | `0.17.2-3d4dd3a` |
| Frigate RAM | ~675–780 MiB (~4–5% of 16 GB) — comfortable |
| Frigate CPU | **~220–255%** of one core (CPU detector warning expected) |
| Detect path | camera_fps 5.0; process_fps often **below 5** with skipped_fps; inference ~90–95 ms |
| Worker | PID unchanged, health ok, MemoryCurrent ~320–350 MB at T0 |

**Interpretation:** RAM headroom is large; **CPU is the real gate**. process_fps lag at 5 fps on i3-2100 is a tuning signal (consider 3–4 fps later if worker suffers), not an automatic fail if worker stays healthy.

## External soak monitor pattern
Disposable external sampler (not inside Frigate/worker), ~60s interval, 30–60 min:
- Sample: `docker stats frigate`, `free`, worker MainPID/MemoryCurrent/health, Frigate entrance fps fields, loadavg.
- **Stop Frigate immediately** (`docker compose stop frigate`) if worker inactive/PID change, worker MemoryCurrent ≥900 MB, or RTSP reconnect storm (e.g. >3 `Detection started` in ~70s).
- Logs: `/mnt/cctv/logs/frigate-soak-*.jsonl`, `frigate-soak-monitor.out`.

## Soak pass criteria (30–60 min)
- Frigate stays healthy; entrance capture/detect without crash loops
- Host RAM comfortable (Frigate typically under 2 GiB)
- cctv-worker stays `active`, health ok, no reconnect storm
- Combined CPU not sustained-starving worker
- Stop: `cd ~/frigate && docker compose down` (or `stop`)

## Promote 2-cam only after
1-cam soak green **and** separate approval for C560WS stream2 + likely lower fps/res if CPU already near ceiling.
