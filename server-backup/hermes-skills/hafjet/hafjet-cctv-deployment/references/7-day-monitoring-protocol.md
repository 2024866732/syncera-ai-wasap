# 7-Day Passive Monitoring Protocol

## When to use
- After deploying a new feature set (MVP) that needs stability validation
- Before deciding on the next upgrade phase (e.g. Layer 3 notification, model upgrade, dashboard enhancement)
- Whenever the user says "baseline mode" or "passive monitoring"

## Setup: Cron job

```bash
# Create a 6-hour checkpoint cron (28 runs = 7 days)
# CRITICAL: Always pin model/provider to avoid drift-based skips
cronjob action=create \
  name=cctv-daily-check \
  schedule=6h \
  repeat=28 \
  deliver=origin \
  model='{"provider": "opencode", "model": "deepseek-v4-flash-free"}' \
  prompt="..."
```

## Per-checkpoint routine (every 6 hours)

Record these 8 items:

1. `systemctl status cctv-worker --no-pager`
2. `journalctl -u cctv-worker -n 30 --no-pager`
3. `curl http://127.0.0.1:8091/health`
4. `curl http://127.0.0.1:8091/api/events?limit=10`
5. `ps aux | grep app.main` (CPU% and MEM%)
6. `ls -lh /mnt/cctv/snapshots | tail -5`
7. `tail -5 /tmp/cctv-alerts.log` (latest events)
8. `wc -l /mnt/cctv/alerts/events.json` (monitor size)

## Escalation triggers (report IMMEDIATELY)

| # | Trigger | Threshold |
|---|---------|-----------|
| 1 | Crash loop | Service restart >2 times in 6 hours |
| 2 | CPU spike | Sustained >80% for >30 min |
| 3 | Memory leak | RAM rising continuously without dropping |
| 4 | RTSP disconnect | Not auto-reconnecting within 5 min |
| 5 | JSON size guard | `events.json` >5 MB |
| 6 | Log rotation failure | `cctv-alerts.log` >10 MB without rotation |
| 7 | Health API failure | `/health` returns error or timeout |
| 8 | Data integrity | Snapshot count ≠ event count |

Each escalation must include:
- Timestamp of issue
- Relevant `journalctl` output
- Action taken/planned (if auto-recovery exists)

## Strict prohibitions during monitoring period

- ❌ DO NOT change `VISION_CONFIDENCE` or any model threshold
- ❌ DO NOT swap to YOLOv8 or any other model
- ❌ DO NOT add Layer 3 notification (WhatsApp/Telegram/email)
- ❌ DO NOT modify dashboard or add routes
- ❌ DO NOT edit systemd unit file without explicit approval
- ❌ DO NOT touch production HAFJET code
- ❌ DO NOT touch Azure
- ❌ DO NOT run destructive commands (rm -rf, wildcard delete) on `/mnt/cctv/`

## Decision proposals to prepare (DOCUMENT ONLY, no implementation)

By the end of the 7-day monitoring period, prepare proposals for:

### D.1 — Layer 3 Notification
- Candidate channels (local log → Telegram → WhatsApp)
- Effort estimate and risk per option
- Draft alert message format

### D.2 — YOLOv8 Nano Upgrade
- Compare confidence trend from monitoring data
- Decide if accuracy is sufficient or upgrade is warranted
- Effort estimate for ONNX Runtime + new model setup

### D.3 — Dashboard Enhancement
- Most useful enhancements based on observations
- Examples: date filter, larger thumbnails, CSV export
- Effort estimate per enhancement

### D.4 — Multi-camera fusion (Innefu-inspired, limited scope)
- UI proposal for 2+ cameras
- Simple behaviour rules (e.g. alert on events outside operating hours)
- **Strictly no:** facial recognition, watchlist matching, predictive policing, biometric data

### D.5 — Face crop + Smart Search (DVR-inspired, limited scope)
- Face crop/thumbnail from frame (Haar cascade, lightweight, no recognition)
- Dashboard "Smart Search" grid view
- **Strictly no:** face recognition/matching, identity database, biometric storage

## Final report (Day 7)

Compile a comprehensive summary with:

1. Total events over 7 days
2. Confidence trend (min / max / average)
3. Total service restarts (if any) and root cause
4. Uptime percentage (from systemctl + journalctl)
5. CPU/RAM trend over the week
6. False positive rate estimate (based on low-confidence events)
7. Data integrity check (event count vs snapshot count vs alert log count)
8. Final recommendations for 3 decisions with clear justification
9. Any unresolved issues

## Pitfalls

- **Restart count overcount:** `journalctl | grep -c 'Started cctv-worker'` includes INITIAL config-failure restarts (e.g. Permission denied loop during deploy). To get TRUE operational restarts, filter by date or check if count is concentrated in a single deploy-time burst.
- **Event gap ≠ crash:** A gap of 2-3 hours with no events may just be a quiet period (night, lunch). Check `systemctl status` uptime to distinguish.
- **Cron drift skip:** If cron's pinned model/provider no longer matches the global config, it gets silently skipped. Always pin explicitly and verify with `cronjob action=list`.
- **Cooldown gap analysis:** Compare events only within a single continuous worker run. Cooldown resets on restart, making gap analysis across restarts unreliable.
