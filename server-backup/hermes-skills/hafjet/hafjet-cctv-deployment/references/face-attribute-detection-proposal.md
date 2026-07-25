# Face Attribute Detection Proposal (D.6)

Status: **PROPOSAL ONLY** — not implemented. Awaiting Tuan Hafizi approval after 7-day baseline monitoring.

## Scope

- **IN:** Gender + age estimation (face attributes), face crop thumbnails, dashboard grid display
- **OUT:** Face recognition/identity matching, watchlist, biometric database, face embeddings storage

## Model Recommendation: OpenCV DNN (Caffe Age + Gender)

| Criterion | OpenCV DNN | DeepFace (lightweight) | DeepFace (MTCNN) |
|-----------|-----------|----------------------|-------------------|
| Model size | ~44 MB (2 models) | ~150 MB | ~200 MB+ |
| Dependencies | **None** (cv2 already installed) | `pip deepface` + TensorFlow | TensorFlow |
| Inference time (CPU i3-2100) | ~100–200 ms/face | ~500–1000 ms/face | >2000 ms/face |
| RAM overhead | ~50 MB | ~200 MB | ~500 MB+ |
| Age accuracy | ±4.65 MAE (8 ranges) | ±4.65 MAE | Similar |
| Gender accuracy | 97.4% | 97.4% | Similar |
| Viability for i3-2100 | ✅ **Recommended** | ⚠️ Marginal | ❌ Too heavy |

**Recommendation:** OpenCV DNN — zero additional dependencies, model already uses `cv2.dnn` (same module as MobileNet-SSD). Load models once at startup, reuse per detection.

### Age ranges (8-class output)
`0-2`, `4-6`, `8-12`, `15-20`, `25-32`, `38-43`, `48-53`, `60-100`

### Models to download (one-time)
- `age_net.caffemodel` — ~44 MB
- `gender_net.caffemodel` — ~44 MB  
- `age_deploy.prototxt` + `gender_deploy.prototxt`

## Pipeline Integration

```
person_detected (MobileNet-SSD, conf >0.70, cooldown pass)
    │
    ├─> save full snapshot    (existing)
    ├─> write alert log       (existing)
    ├─> write JSON alert      (existing)
    │
    └─> [NEW] face attribute detection
         │
         ├─> detect face in frame (Haar cascade / OpenCV DNN face detector)
         ├─> crop face → /mnt/cctv/faces/{event_id}.jpg
         ├─> run gender model → "Male" / "Female"
         ├─> run age model → "25-32" (range label)
         └─> add fields to DB event:
              face_detected: bool
              gender: str | null
              age_range: str | null
              face_crop_path: str | null
```

### Face detector (lightweight — run FIRST before age/gender)
- **Option A:** OpenCV Haar cascade (`haarcascade_frontalface_default.xml`) — built-in, zero download, ~50ms
- **Option B:** MobileNet-SSD for face (same cv2.dnn module) — more accurate but heavier

Use Option A by default — fast enough for cooldown-gated detection.

## Dashboard Enhancement (Smart Search)

| Feature | Description | Effort |
|---------|------------|--------|
| Thumbnail grid | Face crops + person snapshots side-by-side | ~20 lines HTML |
| Gender/age column | New columns in events table | ~10 lines |
| Filter by gender | Dropdown filter | ~15 lines JS |
| CSV export | `/api/events/csv?gender=male&date=2026-07-24` | ~30 lines |

## Privacy & Retention

| Policy | Detail |
|--------|--------|
| Face crop retention | Auto-delete after **30 days** (cron: `find /mnt/cctv/faces -mtime +30 -delete`) |
| Face embeddings | **DO NOT store** — no identity tracking possible |
| Gender/age data | Stored as event metadata only (no cross-event correlation) |
| Dashboard access | LAN-only (127.0.0.1 bind), same as current |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Low accuracy on poor lighting/angles | Medium | Only run when person confidence >0.70 |
| CPU spike (additional inference) | Low | Runs only on cooldown-gated events, not every frame. ~100-200ms per detection, 0.2% CPU impact |
| Gender classification bias | Low | Display as "estimated", not definitive. No decisions based on it. |
| Privacy concern | Low | No embeddings stored, auto-delete policy, LAN-only access |
| Model download failure | Low | Graceful fallback — skip attribute detection if model missing |

## Related Skills

- `hafjet-cctv-deployment` — covers the full worker pipeline this integrates with
- `hafjet-local-ml-deploy` — model download and management patterns
