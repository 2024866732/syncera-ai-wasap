# CCTV Worker RSS Investigation and Numpy/OpenCV Retention

Use for sustained RSS growth in the HAFJET CPU-only CCTV worker. This is an evidence-first procedure; do not infer a leak from one high RSS sample.

## Non-negotiable process rule

**Do not restart during the observation window.** A restart resets RSS, uptime, Python objects, and native OpenCV allocations, so it destroys the trend being measured.

- Stage any proposed code change, back it up, run syntax/import checks, and show the exact diff.
- Restart only after Tuan Hafizi gives a separate explicit approval naming the restart.
- A restart-induced RSS drop proves that memory belonged to the worker process, but **does not by itself distinguish Python objects from OpenCV/C-level allocations**. Treat it as supporting evidence, not proof of a specific root cause.

## 1. Capture a useful RSS trend

Sample every 30 minutes for 3–4 hours (6–8 samples). Use the systemd main process, not an incidental shell/SSH PID:

```bash
systemctl status cctv-worker --no-pager | grep Memory
systemctl show cctv-worker -p MainPID --value
```

Record: sample, UTC/MYT timestamp, RSS, peak RSS, worker PID/uptime, and whether a burst of face-crop/D.6 events occurred in the interval.

Classify only after enough samples:

- **Steady rise correlated with event bursts** → suspected retention/leak; inspect face/DNN path.
- **Initial rise then plateau** → working-set growth / new normal; do not call it a leak.
- **Random oscillation** → normal allocator/GC behaviour.
- **No event activity** → insufficient evidence to validate a face-crop hypothesis.

## 2. Read-only code inspection

Check for unbounded container accumulation and inspect frame/crop lifetimes:

```bash
grep -n "\.append\|\.extend" app/main.py
grep -n "face_crop = frame\|face_array\|crop_face_from_frame\|predict_age_gender" \
  app/main.py app/vision/face_crop.py app/vision/face_attr.py
```

Do not assume `gc.collect()` can be injected into another running process through a separate `python -c`; it cannot. A new Python process only collects its own heap. Instrumentation must be part of the worker code and requires a separately approved deployment/restart.

## 3. Numpy slice-view trap

A crop created this way is a **view**, not an independent image:

```python
face_crop = frame[y1:y2, x1:x2]  # view; can retain the full camera frame
```

If the crop survives through D.6 inference, the small face crop can keep its large parent `frame` alive. The safe production form is:

```python
face_crop = frame[y1:y2, x1:x2].copy()
```

The copy is intentionally small (face crop only) and breaks the parent-frame reference.

## 4. Approved cleanup pattern

When `crop_face_from_frame(..., return_array=True)` succeeded, it returns an independent face array after the `.copy()` fix. Release that transient object after all D.6 paths, including the exception path:

```python
if result:
    face_path, face_array = result
    try:
        attr = predict_age_gender(face_array)
        # persist output if available
    except Exception:
        logger.warning(..., exc_info=True)
    del face_array  # inside if result:; guaranteed assigned
```

Do **not** add `del frame` casually in the middle of the detection path: `frame` is still required for snapshot/crop work and is naturally overwritten by the next `cap.read()` iteration. Do **not** run `gc.collect()` on every frame without measured justification; it adds pauses and masks the underlying lifetime issue.

## 5. Safe deployment sequence for a memory fix

1. Back up each modified file (`*.before-memfix`).
2. Apply only the reviewed code diff.
3. Run `python -m py_compile`/project import checks.
4. Show grep/diff evidence that `.copy()` and cleanup landed in the real files.
5. Stop. Obtain explicit restart approval.
6. Restart once to load all staged fixes; record fresh baseline RSS and health.
7. Start a **new** 3–4 hour tracker; pre-restart samples belong to the old process and cannot be merged with post-fix trend.

## 6. Post-fix success criteria

- Health endpoint remains OK; event persistence and face crops continue.
- Baseline should be comparable to a clean worker start (record actual value; do not promise a fixed number).
- Under multiple successful face-crop + D.6 events, RSS should rise modestly then plateau, rather than climb continuously toward the alert ceiling.
- If RSS still rises, investigate OpenCV DNN tensors, `VideoCapture`/FFmpeg buffering, model duplication, and snapshot encoding allocations before changing thresholds.

## Monitoring threshold

Raise a threshold only after a measured post-fix plateau has been observed. Set it relative to the plateau (for example ~1.5×), not from an assumed historical number.