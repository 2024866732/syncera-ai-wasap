# D.3–D.6 Technical Proposals — Approval Status

Prepared: 2026-07-25 | Updated: 2026-07-25 (post-review)

## D.3: Dashboard Enhancement (Priority 1)

**Status:** ✅ **APPROVED & IMPLEMENTED** — 2026-07-25

- Date range filter: `GET /dashboard?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`
- CSV export: `GET /api/events/csv?from_date=...&to_date=...` (limit 10,000 rows)
- MYT column: dual columns `Time (UTC)` and `Time (MYT)` in dashboard table
- New DB function: `get_events_by_date()` with parameterized SQL queries
- Bug fixed: CSV link builds params list safely (no None concatenation)
- Imports added: `csv`, `io`, `datetime`, `timedelta`, `timezone`

## D.5: Face Crop + Smart Search Grid (Priority 2)

**Status:** ✅ **APPROVED & IMPLEMENTED** — 2026-07-25

- Pipeline: `person_detected (conf >0.70)` → Haar cascade → crop → `/mnt/cctv/faces/{event_id}.jpg`
- `face_crop.py`: 60-line module, zero dependencies, cascade loaded once at startup
- `face_dir.mkdir()` at startup (`run_api()`), not per-event
- DB migration: `migrate_add_face_column()` — ALTER TABLE for face_snapshot_path, gender, age_range
- Face crop runs **after** write_json_alert, only when conf ≥0.70 (~10ms per face on i3)
- Non-blocking: only triggered once per 45s cooldown, negligible CPU impact
- Dashboard: face thumbnail column in table
- **Retention cron:** systemd timer files created (`cctv-face-retention.service` + `.timer`) but **NOT enabled**. Schedule `OnCalendar=daily` pending Tuan Hafizi explicit approval.
- Details: see `references/face-crop-implementation.md`

## D.6: Face Attribute Detection — gender + age (Priority 3)

**Status:** ✅ **APPROVED with condition** — Model download pending explicit approval

- Model: OpenCV DNN Caffe — `age_net.caffemodel` + `gender_net.caffemodel` (~22MB each)
- Sources: `https://github.com/opencv/opencv_extra/raw/master/testdata/dnn/`
- Zero pip dependencies
- DB columns already migrated (gender, age_range) by D.5 migration
- Module: `app/vision/face_attr.py` designed (lazy-load, blobFromImage preprocessing)
- **BLOCKED:** Tuan Hafizi must approve model download before implementation

## D.1: Layer 3 Notification (Priority 4)

**Status:** 🟡 **Option A — CONFIRMED (current state)**
**Option B/C — DEFERRED** pending explicit approval + credential provision

## D.4: Multi-camera + Behaviour Rule (Priority 5)

**Status:** 🔵 **DEFERRED** — Only relevant when second camera hardware exists

## D.2: YOLOv8 Nano Upgrade (Priority 6)

**Status:** 🔵 **DEFERRED** — MobileNet-SSD accuracy sufficient; revisit if false negatives increase
