# LIVE_GPU_LOCK coexistence with AI Live Streamer

Canonical lock on RTX WSL2 (`hafjet`):

```text
~/hafjet-live/LIVE_GPU_LOCK
```

Managed by live-streamer glue: `gpu_lock.py acquire|release|status`  
(repo: `~/projects/hafjet-ai-live-streamer/avatar/livetalking_glue/`).  
Consumer also acquires around speak: `speak_queue_consumer.py` (polish e2e).

## CCTV analyze guard — DIFF FIRST (2026-08-18)

**Target:** `~/cctv-analysis/cctv_analyze.py` (entry used by `run_batch.sh`)  
**Status:** unified diff prepared in live-streamer repo  
`docs/runbook-g2-task8-cctv-diff.md` — **NOT applied** until Tuan says **`OK Task 8 apply`**.

Proposed (minimal, top of `main()` after helpers, before YOLO import):

```python
live_lock = Path(os.path.expanduser("~/hafjet-live/LIVE_GPU_LOCK"))
if live_lock.is_file():
    print("SKIP_LIVE_LOCK")
    log_line({"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "status": "SKIP_LIVE_LOCK"})
    sys.exit(0)
```

Optional belt: same file check early in `run_batch.sh`.

Verify after apply:
1. `touch ~/hafjet-live/LIVE_GPU_LOCK` → `python3 cctv_analyze.py` prints `SKIP_LIVE_LOCK`, no YOLO load  
2. `rm` lock → normal path  
3. Do not leave lock stale  

## Ops notes

- Treat `SKIP_LIVE_LOCK` as success/skip for watchdogs (not batch failure).
- Shared CB: temp warn 80 / stop 88°C; VRAM warn 8GB / stop 10.5GB; no auto-resume.
- LiveTalking sustained VRAM ~3–3.6GB (wav2lip WebRTC); YOLO outside live windows when possible.
- Venv isolation: never install LiveTalking into `~/cctv-analysis/.venv`.
- Hermes→RTX: Office jump only (`hafjet-ai-live-streamer` pitfalls).

See skill `hafjet-ai-live-streamer` + `references/polish-speak-queue-e2e.md`.
