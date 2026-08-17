# G2 Task 1 + RTX preflight (2026-08-15)

## Approvals

- `approve G1` → closed G1
- `approve G2` + Inline: Task 1 Hermes → Task 2 read-only → **no Task 4** without status update to Tuan

## Task 1 (DONE on Hermes)

Shipped under `~/projects/hafjet-ai-live-streamer/`:

- `avatar/livetalking_glue/gpu_lock.py` — acquire/release/status → default `~/hafjet-live/LIVE_GPU_LOCK`
- `avatar/livetalking_glue/circuit_breaker.py` — parse nvidia-smi CSV; warn temp≥80 / VRAM≥8192; stop temp≥88 / VRAM≥10752; exit 0/1/2
- `avatar/livetalking_glue/speak_local_demo.py` — `--dry-run` OK on Hermes; full path pending Task 4
- `avatar/livetalking_glue/health_avatar.sh`
- `docs/runbook-g2-rtx.md`, `docs/runbook-incident.md`
- `obs/checklist.md` G2 preview section
- `tests/test_circuit_breaker_unit.py`

Verify:

```bash
cd ~/projects/hafjet-ai-live-streamer && .venv/bin/pytest -q
# expect 26 passed (G1 + CB/lock/dry-run)
.venv/bin/python avatar/livetalking_glue/speak_local_demo.py --dry-run
```

## Task 2 (BLOCKED 2026-08-15)

```text
tailscale status → desktop-rhdusf3-1 100.119.32.87 offline, last seen ~20h
ssh hafjet@100.119.32.87 → Connection timed out
ping → 100% loss
PC Office 100.121.94.41 → online (not GPU host)
```

**Do not** invent GPU/disk numbers when offline.  
**Do not** start Task 3 deploy or Task 4 LiveTalking install.

### Unblock

1. Power RTX Windows + WSL2  
2. Tailscale online on WSL  
3. `sudo service ssh start`  
4. User: `RTX online` or `continue G2 task2`  
5. Agent: re-run Task 2 matrix only → report → wait before Task 4

### Preflight commands (when online)

```bash
tailscale status | grep -E 'rhdusf3|100.119'
ssh -o BatchMode=yes -o ConnectTimeout=8 hafjet@100.119.32.87 'hostname; whoami; uname -a'
ssh -o BatchMode=yes hafjet@100.119.32.87 '/usr/lib/wsl/lib/nvidia-smi || nvidia-smi'
ssh -o BatchMode=yes hafjet@100.119.32.87 'df -h ~; free -h; ls ~/cctv-analysis 2>/dev/null | head'
```

## Task 4 hold rule

Even with `approve G2`, if Tuan said “jangan Task 4 tanpa update status”, stop after Task 2/3 report and wait for explicit continue.
