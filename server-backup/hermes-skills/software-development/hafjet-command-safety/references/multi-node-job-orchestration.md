# Multi-node job orchestration (VPS + workers) — HAFJET 2026-07-31

## VPS API contract (port 8080, Tailscale only)

- POST /register-node
  Request: {node_id, role (light-worker|gpu-worker), tailscale_ip, hostname, status, capabilities[], resources{}}
  Response: {"ok": true, "node_id": "..."}

- GET /jobs?node_id=...&tag=light|heavy&status=pending
  Response: array of jobs or []

- POST /jobs
  Payload example (from trigger):
  {
    "type": "heavy_task",
    "task_name": "gpu_test_inference" or "cctv_heavy_reanalyze",
    "target_node": "desktop-rhdusf3-1",   // explicit wins over classify
    "tags": ["heavy"],
    "payload": {"prompt": "...", "model": "...", "camera": "entrance", "frame_path": "...", "event_id": "...", "reason": "low confidence - GPU re-check"}
  }
  Response: {"ok": true, "job_id": "job-..."}

- POST /jobs/{job_id}/result
  Payload: {job_id, node_id, status, outputs:{}, metrics:{}, error}
  Response: {"ok": true, "job_id": "..."}

- GET /health → {"status":"ok", "service":"hafjet-orchestrator"}

## Worker poller skeleton (real_heavy_worker_poller.py)

**Mandatory first step (user rule):** register heartbeat before polling.

```python
def register_node():
    payload = {
        "node_id": NODE_ID,
        "role": "gpu-worker",
        "tailscale_ip": "100.119.32.87",
        "status": "online",
        "capabilities": ["gpu_inference", "batch_processing", ...],
        "resources": {"cpu": "...", "gpu": "RTX 4070..."}
    }
    http_post(f"{VPS_API_BASE}/register-node", payload)

def main():
    register_node()   # ALWAYS FIRST
    jobs = get_pending_jobs()
    for job in jobs:
        if "cctv" in task or "cctv" in payload:
            handle_cctv_job(job)
        else:
            process_job(job)
```

Light worker equivalent uses tag=light and node_id=hafjet-pc-office.

## CCTV Heavy Handler (in poller)

When job is cctv_heavy_*:
- Try real: ultralytics YOLOv8n on CUDA (if torch.cuda available and frame_path exists).
- Fallback: enhanced analysis reporting confidence boost, recommendation to escalate.
- Submit rich outputs (persons_detected, improvement, note about installing ultralytics).

Example job payload for semak AI CCTV:
{
  "task_name": "cctv_heavy_reanalyze",
  "payload": {
    "camera": "entrance",
    "event_id": "...",
    "frame_path": "/mnt/cctv/snapshots/...",
    "reason": "semak ai cctv - minta GPU check"
  }
}

## Systemd units (VPS)

**API service** (Restart=always):
```
[Service]
User=hafizi145
WorkingDirectory=/home/hafizi145/hafjet-orchestrator
ExecStart=/usr/bin/python3 .../api_server.py --port 8080
Restart=always
```

**Health monitor timer** (every 2min):
- .timer: OnUnitActiveSec=2min
- .service: ExecStart=.../health_monitor.py  (curls remote health, updates workers.status)

**Retention timer** (daily):
- Runs retention_cleanup.py (DELETE completed/failed jobs + events older than RETENTION_DAYS=30)

## Safe verification pattern (Tuan requirement)

Always:
```bash
curl -s -o /tmp/jobs.json "URL"
python3 -c '
import json
from pathlib import Path
data = json.loads(Path("/tmp/jobs.json").read_text())
print(...)
'
```

Never `curl ... | python3`.

## Retention policy

- Completed/failed jobs + events: 30 days
- Stale pending: 7 days (safety)
- Run via daily timer or manual: `python3 scripts/retention_cleanup.py`

## Signals for future

- When GPU node offline: still create heavy job as "pending" but do not count it as routed.
- Health update must be called before any GET /jobs that filters by node.
- Keep simulate_*.py for local test; real_*_poller.py is the one copied to nodes.
- For CCTV: light worker can trigger "cctv_heavy_reanalyze" when confidence low; GPU returns improved confidence + recommendation.