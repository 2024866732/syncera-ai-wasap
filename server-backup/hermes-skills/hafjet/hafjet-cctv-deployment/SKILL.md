---
name: hafjet-cctv-deployment
description: "Deploy, operate, and monitor a CCTV person-detection worker on a HAFJET on-prem edge PC (office PC / i3-class). Covers RTSP camera integration (Tapo), OpenCV DNN (MobileNet-SSD), auto-reconnect, layered alert logging, internal dashboard, systemd daemonisation, and periodic cron monitoring. NOT for cloud or Azure deployments."
tags: [hafjet, cctv, rtsp, opencv, person-detection, systemd, monitoring]
trigger: |
  Use when Tuan Hafizi wants to:
  • Set up a new RTSP camera for person detection
  • Deploy or restart the CCTV worker daemon
  • Add/reconfigure alert logging (text / JSON)
  • Set up the internal FastAPI dashboard
  • Create a systemd service for auto-start
  • Implement periodic monitoring via Hermes cron
  • Troubleshoot RTSP connectivity, auth, or detection issues
  • Switch between substream (stream2) and main stream (stream1)
  Optimising confidence thresholds or swapping models (e.g. MobileNet-SSD → YOLOv8)
---

# HAFJET CCTV Deployment

## Architecture

```
Tapo TC74 ──RTSP──→ OpenCV DNN ──→ SQLite events
  (stream1/2)       (MobileNet-SSD)     ├── /mnt/cctv/snapshots/
                                       ├── /tmp/cctv-alerts.log (Layer 1)
                                       └── /mnt/cctv/alerts/events.json (Layer 2)
                                     FastAPI ──→ /dashboard (internal LAN)
                                                  /health, /api/events, /snapshots/{fn}
```

## Testing Methodology (sequential)

**Rule:** Change ONE variable at a time. Never jump directly to model replacement before verifying camera positioning and stream source.

### Ordered test sequence
1. **Default settings** — run with current `.env` (stream2, confidence 0.45, no changes)
2. **Lower confidence** — reduce `VISION_CONFIDENCE` to 0.30, retest
3. **Switch stream** — try `stream1` (main stream) instead of `stream2` (substream)
4. **Reposition camera** — if no detection, camera framing is the issue, not the model
5. **Upgrade model** — only after 1–4 have been exhausted

**Verification tool:** Use `scan30.py` to test 30 frames at 1 FPS before starting the full worker:
```bash
cd ~/projects/hafjet-cctv-worker && source .venv/bin/activate
python3 /tmp/scan30.py
```

## RTSP Camera Integration

### Pre-flight checks (in order)
```bash
# 1. Camera reachable
ping -c 2 <camera-ip>

# 2. Port 554 open
nc -zv <camera-ip> 554

# 3. Stream test via ffprobe
ffprobe -rtsp_transport tcp -i "rtsp://user:pass@<camera-ip>:554/stream2"
```

### Tapo TC74 specifics
- RTSP must be enabled in Tapo app → Advanced Settings → Camera Account
- Create a **dedicated camera account** (NOT master TP-Link account)
- Substream: `.../stream2` (640×360, less CPU)
- Main stream: `.../stream1` (2880×1620, higher CPU, better detection)

### URL encoding for special characters
| Character | Encode to | Context |
|-----------|-----------|---------|
| `@` in username | `%40` | e.g. email username `user%40gmail.com` |
| `:` in password | `%3A` | e.g. password containing colon |
| `/` in password | `%2F` | rarely needed |

**Simplest:** Create camera account with alphanumeric-only username/password to avoid encoding entirely.

## Project Structure

```
hafjet-cctv-worker/
├── .env                     # RTSP URL + config
├── app/
│   ├── main.py              # Entry point, detection loop, auto-reconnect
│   ├── config.py            # Dotenv-backed typed settings
│   ├── vision/
│   │   └── detector.py      # OpenCV DNN (MobileNet-SSD)
│   ├── storage/
│   │   └── events.py        # SQLite + snapshots + alert writing
│   └── api/
│       └── routes.py        # FastAPI: /health, /api/events, /dashboard, /snapshots
├── requirements.txt
└── .venv/
```

## Alert Layers

### Layer 1 — Text alert log (`/tmp/cctv-alerts.log`)
```
TIMESTAMP | EVENT_ID | CAMERA_ID | CONFIDENCE | SNAPSHOT_PATH
```
Auto-rotate at 10 MB → rename to `.log.old`.

### Layer 2 — JSON alerts (`/mnt/cctv/alerts/events.json`)
```json
{"alerts": [
  {"timestamp": "...", "event_id": "...", "camera_id": "entrance",
   "confidence": 0.99, "snapshot_path": "snapshots/..."}
]}
```
Append-only via seek/truncate technique. Size guard: stops at 5 MB.

## Systemd Service

File: `/etc/systemd/system/cctv-worker.service`

```
[Unit]
Description=HAFJET CCTV Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hafizi145
WorkingDirectory=/home/hafizi145/projects/hafjet-cctv-worker
ExecStart=/home/hafizi145/projects/hafjet-cctv-worker/.venv/bin/python -m app.main
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Commands
```bash
sudo systemctl daemon-reload
sudo systemctl enable cctv-worker   # auto-start on boot
sudo systemctl start cctv-worker
sudo systemctl status cctv-worker --no-pager
journalctl -u cctv-worker -n 30 --no-pager
```

## Periodic Monitoring via Hermes Cron

Create a cron job that:
1. Checks worker process is running
2. Calls `/health` API
3. Gets recent events via `/api/events?limit=10`
4. Checks snapshot disk usage
5. Reviews log for anomalies (error/exception/traceback)

```bash
hermes cron once-in-4h \
  --name cctv-4h-check \
  --deliver origin \
  --prompt "Check HAFJET CCTV worker on 100.121.94.41..."
```

## Safety Boundaries (Kekal)
- ❌ No production HAFJET code changes
- ❌ No Azure changes
- ❌ No WhatsApp/Telegram integration without explicit approval
- ❌ No destructive commands (rm -rf, wildcard delete) without approval

## Idempotent .env Updates

Prefer Python one-liners over sed for `.env` modifications to avoid the documented `sed -i` blocking issue:
```python
# Replace if exists, append if not
if 'KEY=' in open('.env').read():
    sed replacement
else:
    append
```

Or use the `patch_reconnect.py` approach for multi-line changes.

## Common Pitfalls

- **Camera on counter, not pointing at entrance** → model detects furniture, not people. Always verify camera view before blaming the model.
- **Substream too low resolution** → MobileNet-SSD needs minimum 640×480 for reliable person detection. Use `stream1` if `stream2` fails.
- **RTSP disconnect on stream1** → main stream may disconnect after ~1.5 min. Add auto-reconnect loop.
- **Sudo on office PC requires terminal** → cannot use `sudo` commands via non-interactive SSH. Ask Tuan Hafizi to run them directly or use `ssh -t`.
- **Cron job fails on model drift** → if global inference config changes, cron gets skipped. Check with `cronjob action=list`.
- **Cooldown gap analysis:** When comparing event gaps, ensure all events compared are from a **single continuous worker run**. Cooldown resets on worker restart, so events from different runs may appear closer than the configured cooldown. Always verify with `last_event_time` log lines.

## Related Skills

- **`hafjet-worker-project-setup`** — covers initial project scaffolding, dependency verification, venv bootstrap, and Phase A audit (complementary; this skill covers deployment & sustainment, the setup skill covers project creation)
- **`whatsapp-bot-health-check`** — similar health-check / monitoring pattern for WhatsApp bot
- **`self-hosted-deployment`** — systemd and Tailscale exposure for production services (future sprints only)
