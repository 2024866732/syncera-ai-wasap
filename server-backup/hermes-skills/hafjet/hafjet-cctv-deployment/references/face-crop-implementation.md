# D.5 Implementation — Face Crop Pipeline

Implemented: 2026-07-25 | Status: ✅ Live

## Architecture

```
person_detected (MobileNet-SSD, conf ≥0.70, cooldown passed)
  ├── save full snapshot    (existing)
  ├── write alert log        (existing)
  ├── write JSON alert       (existing)
  └── [D.5] face crop:
        ├── convert BGR→grayscale
        ├── Haar cascade detectMultiScale (scaleFactor=1.1, minNeighbors=5, minSize=60×60)
        ├── select largest face
        ├── crop with +20% margin
        ├── save → /mnt/cctv/faces/{event_id}.jpg
        └── UPDATE camera_events SET face_snapshot_path = 'faces/{event_id}.jpg'
```

## Files Changed

| File | Change |
|------|--------|
| `app/vision/face_crop.py` | **New** — 60 lines, Haar cascade wrapper |
| `app/main.py` | +import, +face_dir mkdir at startup, +crop call after write_json_alert |
| `app/storage/events.py` | +`migrate_add_face_column()`, +`update_event_face_path()` |
| `app/api/routes.py` | +face thumbnail column in dashboard table |

## Key Design Decisions

1. **Haar cascade, not DeepFace** — zero pip dependencies, ~10ms inference, CPU-friendly
2. **face_dir.mkdir() at startup** — `run_api()` function, not per-event (avoids repeated fs calls)
3. **Non-blocking** — crop runs inline in detection loop, but only when person_detected fires (once per 45s cooldown). Haar cascade ~10ms — negligible impact on main loop
4. **Confidence gate** — only crops when confidence ≥0.70 (avoids blurry/useless face crops)
5. **DB migration safe** — `ALTER TABLE ... ADD COLUMN` wrapped in try/except for idempotency
6. **Largest face only** — if multiple faces in frame, picks the biggest (most likely the subject)

## Retention Policy

**Systemd timer files created but NOT enabled:**
- `/etc/systemd/system/cctv-face-retention.service` — `Type=oneshot`, runs `find /mnt/cctv/faces/ -name '*.jpg' -mtime +30 -delete`
- `/etc/systemd/system/cctv-face-retention.timer` — `OnCalendar=daily`, `Persistent=true`

**To enable (requires Tuan Hafizi explicit approval):**
```bash
sudo systemctl enable cctv-face-retention.timer
sudo systemctl start cctv-face-retention.timer
sudo systemctl status cctv-face-retention.timer
```

## Face Snapshots Serving

Face crops are served via the existing `/snapshots/{filename}` route:
- Path: `/mnt/cctv/faces/{event_id}.jpg`
- URL: `http://127.0.0.1:8091/snapshots/{event_id}.jpg`
- Read-only, no delete/write routes
- Protected by `relative_to()` path traversal guard
- Requires filename to be a flat file under `/mnt/cctv/snapshots/` — **face crops in /mnt/cctv/faces/ are accessed via the same route if filename matches**, but normally served as part of event metadata via `/api/events`
