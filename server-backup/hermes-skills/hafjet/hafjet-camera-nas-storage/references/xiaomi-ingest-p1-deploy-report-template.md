# HAFJET Xiaomi Ingest P1 — Deploy Report Template

Use this template for every deploy to Office PC. Fill all fields; unknown = "N/A".

## Header
- Date: YYYY-MM-DD
- Deployer: Tuan Hafizi / Assistant
- Git commit / tag: <sha or "local scaffold">
- Target host: hafjet-pc-office (100.121.94.41)
- Service: hafjet-xiaomi-ingest (P1)

## Pre-deploy Worker State
| Metric | Value |
|--------|-------|
| cctv-worker PID | |
| cctv-worker MemoryCurrent (MiB) | |
| cctv-worker MemoryPeak (MiB) | |
| :8091/health status | |
| :8091/health free_disk_gb | |

## Deploy Steps
- [ ] rsync tree (exclude .venv, __pycache__, .env)
- [ ] TTY sudo `scripts/fix_acl.sh` — exit code / notes
- [ ] python3 -m venv .venv
- [ ] pip install -r requirements.txt
- [ ] test -f .env || cp .env.example .env
- [ ] python -m compileall app
- [ ] python -m unittest discover -s tests -v — PASS/FAIL count
- [ ] Foreground `python -m app.main` (10s smoke) — PID / port / health

## Post-deploy Worker State
| Metric | Value |
|--------|-------|
| cctv-worker PID (must match pre) | |
| cctv-worker MemoryCurrent (MiB) | |
| cctv-worker MemoryPeak (MiB) | |
| :8091/health status | |

## New Service State (8092)
| Metric | Value |
|--------|-------|
| xiaomi-ingest PID | |
| :8092/health phase | |
| :8092/health watcher_alive | |
| :8092/health recordings_dir_exists | |
| :8092/health counts.ingested | |

## Sample Ingest Test
- Test file dropped: <path/name>
- Listed in `/api/videos`: YES/NO
- Thumb generated: YES/NO (path)
- JSON generated: YES/NO (path)
- ffprobe metadata populated: YES/NO (duration, width, height, codec)

## Blockers / Open Items
- sudo/ACL on `/mnt/cctv/xiaomi-nas/recordings`: RESOLVED / PENDING
- systemd install: DEFERRED / APPROVED
- Phase 2 (AI/DNN): NOT STARTED / GATED

## Approval
- Worker integrity verified: YES/NO
- Deploy declared: SUCCESS / PARTIAL / FAILED
- Next action:

---

## Quick Reference Fields (always report)

| Field | Example |
|-------|---------|
| rsync | OK / fail |
| unit tests | N/N OK |
| `:8092/health` | status, phase, ai, watcher_alive, recordings_dir |
| `:8091/health` | status, camera_name |
| worker MainPID pre/post | must match |
| sample ingest | video id + listed in `/api/videos` yes/no |
| ACL / sudo | TTY required? recordings write OK? |
| `.env` recordings path | production path vs `test-drop` workaround |
| systemd | not installed (P1 default) |

Stop foreground ingest without touching worker:
`pkill -f 'hafjet-xiaomi-ingest/.venv/bin/python -m app.main'`