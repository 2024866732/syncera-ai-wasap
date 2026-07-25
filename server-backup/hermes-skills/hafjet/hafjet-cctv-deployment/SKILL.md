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
- **Session timeout (known limitation):** Tapo TC74 firmware terminates RTSP sessions every ~167s regardless of transport (UDP or TCP tested, both exhibit the same behaviour). TCP interleaved mode makes disconnects MORE erratic (49–449s), not better. This is a camera firmware limitation, not a transport issue. **Auto-reconnect** already handles it (5–7s recovery, ~4% detection downtime). See `references/rtsp-transport-diagnostic.md` for full diagnostic procedure and `references/rtsp-keep-alive-investigation.md` for why TCP/environment-variable approaches failed and the keep-alive options analysis.

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
# NOTE: Do NOT add Environment="OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp"
# — tested and proven ineffective for Tapo TC74 session timeout.
# The ~167s disconnect is a camera firmware limitation, not a transport issue.
# Auto-reconnect (in-code, ~5-7s recovery) handles it adequately.
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

See `references/7-day-monitoring-protocol.md` for the full passive monitoring framework (6-hour checkpoints, 8 escalation triggers, decision proposals).

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

## Report Format — MYT Always Included

Tuan Hafizi requires **UTC + MYT (UTC+8) dual time** in all CCTV reports:
- Text format: `"03:12:33 UTC (11:12:33 MYT)"`
- Table format: dual columns `Time (UTC)` and `Time (MYT)`
- Conversion formula: MYT = UTC + 8 hours (Malaysia timezone)
- **Do NOT change database/log storage** — UTC is the canonical format for storage
- **Only add MYT conversion during presentation/report** — at the output/presentation layer

Apply to: cron reports, event summaries, disconnect analysis, dashboard references, and all monitoring output to Tuan Hafizi.

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
- **Cron job fails on model drift** → if global inference config changes, cron gets skipped. Check with `cronjob action=list`. **ALWAYS pin model/provider** when creating cron: `model={'provider': 'opencode', 'model': 'specific-model'}`.
- **Cooldown gap analysis:** When comparing event gaps, ensure all events compared are from a **single continuous worker run**. Cooldown resets on worker restart, so events from different runs may appear closer than the configured cooldown. Always verify with `last_event_time` log lines.
- **Systemd `StandardOutput=append:` Permission denied:** On some systems (e.g. Ubuntu 26.04), systemd fails to open `/tmp/cctv-worker.log` for append even when the file is user-owned. **Fix:** Use `StandardOutput=journal` and `StandardError=journal` instead. Logs are then readable via `journalctl -u cctv-worker`.
- **False alarm on systemd restart count:** `journalctl | grep 'Started cctv-worker'` includes initial config-failure restarts (e.g. Permission denied loop). To get **true operational restarts**, filter by date: `--since 'YYYY-MM-DD HH:MM:SS'` or check if the count of `Started` events is concentrated in a single burst at deploy time.
- **Tapo TC74 RTSP session timeout (camera firmware limitation):** Tapo cameras terminate RTSP sessions at regular intervals due to a firmware-level session limit. **TCP transport does NOT fix this** — tested and proven: TCP interleaved mode (`OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp`) makes disconnects MORE erratic (49–449s), not better. UDP rollback after TCP may improve the pattern (1 disconnect/15min vs 17/6h originally). **Recommended approach: E2 — accept as limitation** with the existing auto-reconnect (5–7s recovery, ~0.5–4% detection gap). See `references/rtsp-transport-diagnostic.md` and `references/rtsp-keep-alive-investigation.md` for full investigation.

## Related Skills

- **`hafjet-worker-project-setup`** — covers initial project scaffolding, dependency verification, venv bootstrap, and Phase A audit (complementary; this skill covers deployment & sustainment, the setup skill covers project creation)
- **`whatsapp-bot-health-check`** — similar health-check / monitoring pattern for WhatsApp bot
- **`self-hosted-deployment`** — systemd and Tailscale exposure for production services (future sprints only)

## Feature Status

| Proposal | Status |
|----------|--------|
| D.3 Dashboard Enhancement | ✅ Implemented (2026-07-25) |
| D.5 Face Crop + Smart Search | ✅ Implemented (2026-07-25) |
| D.6 Face Attribute Detection | ✅ Models downloaded (HuggingFace 44MB×2), code pending |
| D.1 Layer 3 Notification | 🟡 Option A confirmed, B/C deferred |
| D.4 Multi-camera + Behaviour | 🔵 Deferred |
| D.2 YOLOv8 Nano Upgrade | 🔵 Deferred |

See `references/d3-d6-proposals.md` for full approval details and `references/face-crop-implementation.md` for D.5 implementation architecture.

Also see `references/face-attribute-detection-proposal.md` for D.6: face attribute detection (gender + age) using OpenCV DNN Caffe models — lightweight alternative to DeepFace for CPU-only edge PCs.
