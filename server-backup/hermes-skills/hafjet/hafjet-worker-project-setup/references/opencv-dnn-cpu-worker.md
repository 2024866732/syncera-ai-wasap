# CPU-based OpenCV DNN CCTV Worker

Captured from HAFJET CCTV AI Sprint v0.1 (July 2026).

## Architecture

```
Test video (MP4) or Tapo TC74 RTSP substream
        ↓
CPU-only worker (hafjet-pc-office, i3-2100)
  ├─ OpenCV DNN (MobileNet-SSD Caffe)  →  Person detection (class 15)
  ├─ SQLite event database              →  /mnt/cctv/db/cctv_events.db
  ├─ Snapshot writer                    →  /mnt/cctv/snapshots/*.jpg
  └─ FastAPI (127.0.0.1:8091)          →  /health, /api/events, /api/cameras
```

## Dependencies (pinned for Python 3.14 on Ubuntu 26.04)

```
opencv-python-headless==4.13.0.92
fastapi==0.118.3
uvicorn[standard]==0.40.0
python-dotenv==1.1.1
pydantic==2.13.4           # 2.11.7→2.13.4 because pydantic-core 2.33.2 has no cp314 wheel
```

## Project structure

```
project-root/
├── app/
│   ├── __init__.py
│   ├── config.py              # .env → typed config
│   ├── main.py                # CLI entry point, detection loop, API background thread
│   ├── vision/
│   │   ├── __init__.py
│   │   └── detector.py        # MobileNet-SSD → person class (ID 15)
│   ├── storage/
│   │   ├── __init__.py
│   │   └── events.py          # SQLite DB + snapshot save
│   └── api/
│       ├── __init__.py
│       └── routes.py           # /health, /api/events, /api/cameras
├── scripts/
│   └── download_models.sh      # Downloads MobileNet-SSD Caffe model files to /mnt/cctv/models
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt
```

## Key fixes learned

### 1. SQLite + FastAPI threading
The detection loop (main thread) creates the `sqlite3.Connection`. The API server
(runs in a separate threading.Thread) tries to use the same connection. Fix:
```python
conn = sqlite3.connect(str(db_path), check_same_thread=False)
```

### 2. Python 3.14 wheel gaps
- `pydantic==2.11.7` requires `pydantic-core==2.33.2` which has no cp314 wheel.
  Upgraded to `pydantic==2.13.4` (uses pydantic-core==2.46.4, which has cp314).
- **How to find a compatible version:** run `pip index versions <package>` in the venv
  to see all available versions and their wheels. Then bump to the next version that
  has a cp314 wheel.
- Use `--only-binary=:all:` to avoid source builds on the i3-2100.
- If a version mismatch occurs, stop and report instead of silently bumping.
  Report the error and propose the next compatible version. Do not silently substitute.

### 3. `logger.trace()` does not exist in standard logging
Use `logger.debug()` for any trace-level logging.

### 4. Test flow
1. `python -m app.main --source test_person.mp4` (local video, no RTSP)
2. Verify: DB created, snapshots saved, API responds
3. Only then fill `CAMERA_1_RTSP_URL` for live camera

### 5. Cooldown verification
- Cooldown timer (`_last_event_time`) is **per-process** — it resets on every restart.
  Events from different runs may appear closer than `EVENT_COOLDOWN_SECONDS` apart.
  Only a single continuous run proves cooldown works.
- To verify cooldown within one run, create a **looped test video** longer than
  the cooldown window:
  ```bash
  ffmpeg -y -stream_loop -1 -i test_person.mp4 -c copy -t 60 test_person_loop.mp4
  ```
- Run the worker with the looped video for > COOLDOWN seconds, then check
  event timestamps: the gap between consecutive events must be ≥ `EVENT_COOLDOWN_SECONDS`.

### 6. Thumb rule for cooldown gap analysis
When reporting cooldown behaviour:
- If events come from **different process runs** (worker killed + restarted), the
  gap between their timestamps is **not a valid cooldown test** — each run starts
  with `_last_event_time = 0.0`.
- Only compare timestamps within a **single run** to verify cooldown.

### 7. Safer cleanup of test artifacts
After test runs, clean up with targeted file removal — never use wildcards:
```bash
# Remove database and its WAL files
rm -f /mnt/cctv/db/cctv_events.db
rm -f /mnt/cctv/db/cctv_events.db-wal
rm -f /mnt/cctv/db/cctv_events.db-shm

# Remove specific test snapshots (list exact filenames)
rm -f /mnt/cctv/snapshots/entrance_YYYY-MM-DDThh-mm-ss.sss+00-00.jpg
```

Always specify exact filenames. Never use `rm -f /mnt/cctv/snapshots/*.jpg`.

### 8. Tapo TC74 camera account & RTSP setup
1. Open Tapo app → camera settings → **Advanced Settings → Camera Account**.
2. Create a dedicated user (e.g. `cctv`) with a strong password.
   **Do NOT reuse your master TP-Link account password.**
3. RTSP URL format:
   ```
   rtsp://<username>:<password>@<camera-ip>:554/stream2
   ```
   - Substream: `stream2` (lower resolution, recommended for CPU inference)
   - Main stream: `stream1` (higher resolution, heavier on CPU)
4. Fill in `.env`:
   ```ini
   CAMERA_1_RTSP_URL=rtsp://cctv:your_password@192.168.1.100:554/stream2
   CAMERA_1_ENABLED=true
   ```

## Model files

- MobileNet-SSD (Caffe) from Chuanqi305:
  - `MobileNetSSD_deploy.prototxt` (~44 KB)
  - `MobileNetSSD_deploy.caffemodel` (~23 MB)
- Class labels: PASCAL VOC 21 classes. Person = class index **15** (not 0).
- Stored in: `/mnt/cctv/models/`
- Download: `bash scripts/download_models.sh`

## Camera assumptions (v0.1)

- Tapo TC74 only (wired, RTSP + ONVIF Profile S assumed).
- Xiaomi/Imilab cameras are cloud-only; RTSP not attempted unless user provides URL.
- Always use substream (lower resolution) for CPU inference.
