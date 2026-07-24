#!/bin/bash
# Cron health check template for HAFJET CCTV workers
# Usage: cronjob action=create schedule="4h" repeat=6 prompt="$(cat scripts/cron-health-check.sh)"
# Or: copy the prompt text below into cronjob action=create prompt="..."

# === BEGIN PROMPT TEXT ===
Check the HAFJET CCTV worker on {OFFICE_PC_IP} and report status.

SSH into hafizi145@{OFFICE_PC_IP} and run:

1. Worker process status: `ps aux | grep -v grep | grep 'app.main'`
2. Health endpoint: `curl -s http://127.0.0.1:8091/health`
3. Recent events: `curl -s 'http://127.0.0.1:8091/api/events?limit=10'`
4. Snapshots: `ls -lh /mnt/cctv/snapshots/`
5. Log tail: `tail -20 /tmp/cctv-worker.log`

Then compile into this table:

=== CCTV Worker Check ===
Timestamp:
Process: [PID] running / NOT RUNNING — CPU%
Health: OK / ERROR
Events: total count, newest event: timestamp, confidence
Snapshots: count, total size
Log anomalies: count of error/crash/reconnect lines (case-insensitive)
Recent log excerpt: last 5 lines

If worker is NOT running, restart command needed:
  cd /home/hafizi145/projects/{PROJECT_NAME} && nohup .venv/bin/python -m app.main >> /tmp/cctv-worker.log 2>&1 & disown
# === END PROMPT TEXT ===
