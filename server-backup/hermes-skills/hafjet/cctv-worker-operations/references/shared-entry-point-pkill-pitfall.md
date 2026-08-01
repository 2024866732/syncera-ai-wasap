# Shared Entry Point `pkill` Pitfall

**Date:** 2026-08-01
**Severity:** CRITICAL — killed production cctv-worker during sibling service deploy

## Incident Summary

During xiaomi-ingest P1 deploy to Office PC, used `pkill -f "python -m app.main"` to stop the foreground test process. This pattern matched **both** services because they share the exact same entry point:

| Service | Port | Entry Point | Process Command |
|---------|------|-------------|-----------------|
| cctv-worker (systemd) | 8091 | `python -m app.main` | `/home/hafizi145/projects/hafjet-cctv-worker/.venv/bin/python -m app.main` |
| xiaomi-ingest (foreground) | 8092 | `python -m app.main` | `/home/hafizi145/projects/hafjet-xiaomi-ingest/.venv/bin/python -m app.main` |

**Result**: cctv-worker (PID 2474808) was killed, became inactive at 09:07:35 UTC. Required manual `sudo systemctl restart cctv-worker` by Tuan Hafizi.

## Root Cause

`pkill -f` matches against the **full command line**. When two services use identical entry point patterns (`python -m app.main`), a broad pattern kills all matches.

## Prevention Rules (Mandatory for All Sibling Service Deploys)

### 1. Never use `pkill -f` with patterns matching the main worker's entry point
```bash
# FORBIDDEN:
pkill -f "python -m app.main"
pkill -f "app.main"
```

### 2. cctv-worker (systemd service) — ONLY use systemctl
```bash
# CORRECT:
sudo systemctl restart cctv-worker
sudo systemctl stop cctv-worker
sudo systemctl start cctv-worker
```

### 3. xiaomi-ingest / sibling services — use specific PID tracking
```bash
# Option A: Capture PID at launch (foreground)
cd ~/projects/hafjet-xiaomi-ingest && . .venv/bin/activate
python -m app.main &
INGEST_PID=$!
# Later:
kill $INGEST_PID

# Option B: PID file (background)
cd ~/projects/hafjet-xiaomi-ingest && . .venv/bin/activate
nohup python -m app.main > /mnt/cctv/logs/xiaomi-ingest.log 2>&1 &
echo $! > /tmp/xiaomi-ingest.pid
# Later:
kill $(cat /tmp/xiaomi-ingest.pid)

# Option C: Different module path (if restructured)
pkill -f "hafjet-xiaomi-ingest"  # only if module path is unique
```

### 4. Mandatory verification after ANY process manipulation
```bash
# Always check BOTH services:
curl -s http://127.0.0.1:8091/health   # cctv-worker
curl -s http://127.0.0.1:8092/health   # xiaomi-ingest
systemctl show cctv-worker -p MainPID  # confirm PID unchanged or properly restarted
```

## Verification Bar

- **Non-restart operations**: "cctv-worker PID unchanged" + `:8091/health` = ok
- **Approved restarts**: "cctv-worker restarted via systemctl with new PID" + `:8091/health` = ok
- **Never assume** a pkill only hit the intended target

## Related Skills

- `cctv-worker-operations` — main skill (contains prevention rules in SKILL.md)
- `hafjet-camera-nas-storage` — deploy checklist includes PID verification
- `hafjet-command-safety` — TTY sudo rules, no destructive globs

## Files
- SKILL.md updated with prevention rules (2026-08-01)
- This reference: `references/shared-entry-point-pkill-pitfall.md`