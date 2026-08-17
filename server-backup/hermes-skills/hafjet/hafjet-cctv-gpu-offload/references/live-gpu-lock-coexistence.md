# LIVE_GPU_LOCK coexistence with AI Live Streamer

Canonical lock on RTX WSL2 (`hafjet`):

```text
~/hafjet-live/LIVE_GPU_LOCK
```

Managed by live-streamer glue: `gpu_lock.py acquire|release|status`  
(repo: `~/projects/hafjet-ai-live-streamer/avatar/livetalking_glue/`).

## CCTV analyze guard (apply with Tuan OK)

At top of `cctv_analyze.py` or hourly wrapper:

```python
from pathlib import Path
if Path.home().joinpath("hafjet-live/LIVE_GPU_LOCK").is_file():
    print("SKIP_LIVE_LOCK")
    raise SystemExit(0)
```

- Treat `SKIP_LIVE_LOCK` as success/skip for watchdogs (not batch failure).
- Shared CB: temp warn 80 / stop 88°C; VRAM warn 8GB / stop 10.5GB; no auto-resume.
- Never use PC Office as LiveTalking host.
- If Tailscale `desktop-rhdusf3-1` offline, YOLO batch simply cannot run; live G2 preflight is BLOCKED the same way.
- LiveTalking sustained VRAM ~3GB (wav2lip WebRTC speak, measured Task5); YOLO batches outside live windows when possible.
- Venv isolation: never install into `~/cctv-analysis/.venv` for live stack (`venv-livetalking` only).

See skill `hafjet-ai-live-streamer` + `references/g2-task5-webrtc-speak-capture.md`.
