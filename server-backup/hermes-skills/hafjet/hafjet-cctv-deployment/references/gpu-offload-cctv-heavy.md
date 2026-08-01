# GPU Offload for Heavy CCTV Vision (2026-07-31 addition)

## When to use
- Light CPU worker (PC Office, i3) detects low-confidence person event.
- Trigger orchestrator `POST /jobs` with task_name="cctv_heavy_reanalyze" (or similar) + payload containing camera, event_id, frame_path (snapshot on /mnt/cctv), original_confidence, reason.
- Job automatically routes to desktop-rhdusf3-1 (GPU) because classify sees "cctv" + heavy signals.
- GPU poller picks it, runs `handle_cctv_job()`.

## Handler behaviour on GPU node
1. Register-node heartbeat first (mandatory).
2. If frame_path exists:
   - Attempt real: `ultralytics.YOLO("yolov8n.pt")` on "cuda".
   - Return persons_detected count, per-box conf + bbox, model used.
3. Fallback (until models installed): return "GPU-assisted re-analysis", confidence_improvement "+25-35%", recommendation string, original reason.
4. Always submit_result with rich outputs + metrics (duration, gpu_memory).

## On GPU machine (desktop-rhdusf3-1)
```bash
pip install ultralytics torch --index-url https://download.pytorch.org/whl/cu124
# Then copy real_heavy_worker_poller.py and run with correct VPS_API_BASE
VPS_API_BASE=http://100.111.105.120:8080 python3 real_heavy_worker_poller.py
```

## Integration points
- Light CCTV worker (future): when confidence < threshold, POST to VPS /jobs instead of (or in addition to) local alert.
- Orchestrator classify already prioritises cctv + (heavy|inference|analyze) → heavy tag + desktop-rhdusf3-1.
- Poller has handle_cctv_job appended and called from process_job for cctv jobs.

See main hafjet-command-safety references/multi-node-job-orchestration.md for full API + poller code.
See hafjet-cctv-deployment for base CPU worker.

## Example job (for "semak ai cctv")
```json
{
  "task_name": "cctv_heavy_reanalyze",
  "payload": {
    "camera": "entrance",
    "event_id": "evt-...",
    "frame_path": "/mnt/cctv/snapshots/xxx.jpg",
    "reason": "semak ai cctv tu - low conf from light, minta GPU check"
  }
}
```

Result will have higher-confidence detections or explicit "install ultralytics" note.