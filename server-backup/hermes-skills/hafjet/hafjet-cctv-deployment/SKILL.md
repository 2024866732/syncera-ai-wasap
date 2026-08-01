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

**Storage boundary:** Tapo does **not** write SMB “NAS” like Xiaomi. App options = microSD / Tapo Care / Storage Hub (skip if budget). HAFJET free path = RTSP pull → this worker → `/mnt/cctv`. Prefer **event clips** before continuous record. Xiaomi Samba + file ingest = skill `hafjet-camera-nas-storage` (sibling service `:8092`, not this process). Details: `references/tapo-storage-paths.md`.

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

### Pre-purchase evaluation of AI cameras (e.g. Tapo C560WS)

See `references/tapo-c560ws.md` for condensed notes from e-commerce screenshots and feature claims (4K 8MP local AI facial recognition with familiars vs strangers, 18× digital zoom + F1.6, pan/tilt, privacy claims "local processing only", app reporting/activity center, RM224.40 pricing).

When Tuan Hafizi shares camera product listings or app screenshots:
- Extract resolution, zoom/aperture, AI type (facial rec, local vs cloud, person/pet/vehicle), coverage, storage.
- Note privacy/processing details and familiar/stranger management.
- Capture current MYR price, discounts, and seller info.
- Assess RTSP/integration potential vs current TC74 (auto-reconnect patterns, stream1/2).
- Record reporting features that could complement the worker (recognition reports, activity timelines).
- Append post-purchase test results (RTSP URLs, face data access, real accuracy) to the reference file.

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

### Restart approval gate — mandatory
A restart changes process state, reloads staged code, and resets RSS/uptime evidence. **Never restart `cctv-worker` merely because a patch compiles, a helper script suggests it, or a restart appears to be the logical next step.**

1. During any RSS/leak, crash, reconnect, or state-sensitive investigation: preserve the current process and collect the requested trend first.
2. Stage code changes and prove syntax/diff without restart.
3. State exactly what the restart will load and ask for a **separate, explicit approval**.
4. Only then use the narrow approved command/script; verify health and requested markers afterwards.
5. If a restart happened unexpectedly, disclose it immediately, record the new baseline, and do not retrospectively describe the lost trend as intact.

This gate applies even to an apparently small dashboard-label or CSS-adjacent Python template fix.

## Dashboard Visual Refreshes (CSS/HTML Only)

When Tuan Hafizi requests a `/dashboard` redesign, preserve the dashboard contract:
- **Do not change** endpoint paths, query parameters (`from_date`, `to_date`, `limit`), storage queries, CSV route/content, or `/api/events` JSON.
- Reuse the already-fetched `all_events` list for visual summary stats; do not add a database query merely for cards.
- Keep date filter, Clear/quick links, CSV export, full snapshot, face crop, UTC+MYT, `(est.)` labels, and a clear `Showing X of Y` count.
- Treat gender/age strictly as display-only estimates. Dashboard must visibly retain `(est.)` and the tooltip/disclaimer: `AI estimate, ±5 years accuracy`.

### Safe implementation sequence
1. Inspect the entire current dashboard function and identify the HTML-only boundaries.
2. Present the **full diff** plus effort/risk before applying. Explicitly list preserved contracts.
3. Build stats from `all_events`: total filtered events, face detection rate, mean confidence.
4. For card layouts: use semantic card classes, confidence badges (`>0.7` green, `0.5–0.7` yellow, `<0.5` red), gender badges (Male blue, Female pink, missing grey), explicit `No Face`/`—`, responsive one-column mobile layout, sticky filter bar, and hover effects.
5. After approval: syntax/import check, restart only with separate approval if needed, then verify dashboard (unfiltered + date-filtered), CSV header/data, and `/api/events` unchanged.
6. Capture a rendered before/after view only when a browser/screenshot capability is actually available; never claim a screenshot or hover/tooltip test based solely on `curl` HTML. If unavailable, report the exact HTML evidence and limitation.

**Patching pitfalls:** `references/dashboard-ui-patching-pitfalls.md` covers f-string double-brace escaping, atomic multi-pass write strategy, body-block `return`/`import` preservation, and the clean-backup re-run pattern.

**When a dashboard card disagrees with `/api/events`:** follow `references/dashboard-field-divergence.md` before attributing the discrepancy to browser cache or D.6. It requires a same-event DB → API → server-rendered HTML comparison and separate verification of dashboard storage-query field mapping.

## Face Gallery (`/dashboard/faces`)

Added as a separate route reusing the same `get_events_by_date()` query, filtered to events with `face_snapshot_path`. Tab navigation links between `/dashboard` (Event List) and `/dashboard/faces` (Face Gallery).

### Layout
- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))` with `gap: 6px`.
- Each face card: `aspect-ratio: 1 / 1.1`, hover lift + cyan border.
- Click: opens full-size face crop at `/faces/{filename}`. Full event snapshots remain at `/snapshots/{filename}`; these are separate directories/routes. See `references/face-media-serving.md` for the safe serving split and real-asset verification.

### Hover overlay (desktop) vs static overlay (mobile)
- **Desktop:** overlay (time + gender/age badges) hidden by default, shown on `:hover`.
- **Tablet/phone (`@media max-width: 768px`):** overlay ALWAYS visible (`opacity: 1; position: static`), stacked below the thumbnail. No hover dependency — touch devices cannot hover.
- **User requirement:** Tuan Hafizi explicitly specified that touch devices must not rely on hover state. Overlay info must be visible on first tap/view.

### Breakpoints for Face Gallery grid
| Width | Columns | Thumbnail min | Gap |
|---:|---|---|---|
| 1440px+ | 7–8 | 110px | 6px |
| 1024px | 5–6 | 100px | 6px |
| 768px | 3–4 | 110px | 6px |
| 480px | 2–3 | 90px | 4px |
| 360px | 2 | 90px | 4px |

## Responsive CSS Breakpoints (Shared)

All dashboard views use three breakpoints:
1. **`@media (max-width: 1024px)`** — tablet/small desktop: 5-column event grid.
2. **`@media (max-width: 768px)`** — phone/tablet portrait: filter bar stacks vertically, touch targets ≥44px, thumbnails 90px, overlay always visible for Face Gallery.
3. **`@media (max-width: 480px)`** — small phone: single-column event cards, thumbnails 120px, body padding 8px.

### Touch target requirement
All filter/action buttons (`Filter`, `Clear`, `Export CSV`, `.tab`) enforce `min-height: 44px` on `≤768px` breakpoint per WCAG touch target guidelines.

## RTSP Credential Log Hygiene

- Never log a raw RTSP source URL. Before any `logger.*` call, route it through a redactor that emits `rtsp://user:***@host:port/path`.
- Verify new logs without printing secrets: count RTSP URLs and distinguish `:***@` masked entries from unmasked credential entries. A generic URL regex alone is insufficient because it also matches masked URLs.
- Do not delete, vacuum, or rotate historical journal entries containing an old credential without explicit approval, even after a camera password rotation.
- The worker uses `redact_rtsp_url()` in `app/main.py`; ensure both detection-start and detection-end logging use `safe_source` rather than the raw `source`.

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
- **Scoped sudo via SSH:** the Office-PC rule is intentionally exact: `/usr/bin/systemctl restart cctv-worker` and `/usr/bin/systemctl status cctv-worker`. Verify using `sudo -n` plus those exact commands with **no extra arguments**. Commands such as `status ... --no-pager --lines=2` do not match and will authenticate. Do not widen the rule without explicit approval; see `references/d3-d6-final-operational.md`.
- **Cron job fails on model drift** → if global inference config changes, cron gets skipped. Check with `cronjob action=list`. **ALWAYS pin model/provider** when creating cron: `model={'provider': 'opencode', 'model': 'specific-model'}`.
- **Cooldown gap analysis:** When comparing event gaps, ensure all events compared are from a **single continuous worker run**. Cooldown resets on worker restart, so events from different runs may appear closer than the configured cooldown. Always verify with `last_event_time` log lines.
- **Systemd `StandardOutput=append:` Permission denied:** On some systems (e.g. Ubuntu 26.04), systemd fails to open `/tmp/cctv-worker.log` for append even when the file is user-owned. **Fix:** Use `StandardOutput=journal` and `StandardError=journal` instead. Logs are then readable via `journalctl -u cctv-worker`.
- **Memory growth / potential leak:** Follow `references/memory-leak-investigation.md`: collect a 30-minute RSS trend for 3–4h with no restart; inspect unbounded references and the numpy slice-view trap; stage `.copy()` for face crops plus safe `del face_array` only after review. A restart reset is process-level evidence only, not proof that the cause is Python rather than OpenCV/C-level. **Never restart prematurely** during trend collection, and do not raise thresholds until a post-fix plateau is measured. If growth persists after the NumPy fix, use `references/opencv-dnn-rss-correlation-and-mitigation.md`: correlate every RSS interval with `Face attr:` journal timestamps; distinguish a one-time DNN working-set allocation from renewed growth after later inference groups; prefer an isolated DNN reproducer before proposing workarounds. A scheduled main-worker restart is emergency containment only and requires a specific policy exception to the explicit-restart gate. For the required three-stage DNN/detector/decode isolation sequence and the separate Haar false-positive audit protocol, see `references/dnn-pipeline-isolation-and-face-audit.md`; correlation is not root-cause proof.
- **False alarm on systemd restart count:** `journalctl | grep 'Started cctv-worker'` includes initial config-failure restarts (e.g. Permission denied loop). To get **true operational restarts**, filter by date: `--since 'YYYY-MM-DD HH:MM:SS'` or check if the count of `Started` events is concentrated in a single burst at deploy time.
- **Tapo TC74 RTSP session timeout (camera firmware limitation):** Tapo cameras terminate RTSP sessions at regular intervals due to a firmware-level session limit. **TCP transport does NOT fix this** — tested and proven: TCP interleaved mode (`OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp`) makes disconnects MORE erratic (49–449s), not better. UDP rollback after TCP may improve the pattern (1 disconnect/15min vs 17/6h originally). **Recommended approach: E2 — accept as limitation** with the existing auto-reconnect (5–7s recovery, ~0.5–4% detection gap). See `references/rtsp-transport-diagnostic.md` and `references/rtsp-keep-alive-investigation.md` for full investigation.

## Related Skills

- **`hafjet-worker-project-setup`** — covers initial project scaffolding, dependency verification, venv bootstrap, and Phase A audit (complementary; this skill covers deployment & sustainment, the setup skill covers project creation)
- **`whatsapp-bot-health-check`** — similar health-check / monitoring pattern for WhatsApp bot
- **`self-hosted-deployment`** — systemd and Tailscale exposure for production services (future sprints only)
- **`hafjet-camera-nas-storage`** — Xiaomi/Mi Home SMB NAS, Oray X1 USB, Samba PC Office, approved sibling ingest P1 (`:8092`, meta+thumb, `xiaomi_ingest.db`). Different stack from this RTSP worker. Prefer `/mnt/cctv/xiaomi-nas` not `snapshots/`/`faces/`. Samba/ingest must not restart `cctv-worker` or write `cctv_events.db` in P1.

## Feature Status

| Proposal | Status |
|----------|--------|
| D.3 Dashboard Enhancement | ✅ Closed — date filtering, CSV export, UTC+MYT display |
| D.5 Face Crop + Smart Search | ✅ Closed — Haar crops, dashboard grid, 30-day retention |
| D.6 Face Attribute Detection | ✅ Closed — crop-gated OpenCV DNN estimates; dashboard labels `(est.)`; display-only known accuracy limitation |
| Dashboard UI Redesign (card-style) | 🟡 Implemented, pending rendered visual confirmation — stat cards, sticky filter, badges, responsive 1024/768/480px breakpoints, touch-aware overlay |
| Face Gallery (`/dashboard/faces`) | 🟡 Implemented, pending rendered visual confirmation — dense `auto-fill` grid, desktop hover/mobile static overlay, tab navigation, and verified `/faces/{filename}` media route |
| D.1 Layer 3 Notification | 🟡 Option A confirmed, B/C deferred |
| D.4 Multi-camera + Behaviour | 🔵 Deferred |
| D.2 YOLOv8 Nano Upgrade | 🔵 Deferred |

See `references/d3-d6-final-operational.md` for closure checks, exact scoped-sudo behaviour, restart-helper requirements, and RTSP credential-log hygiene.

See `references/d3-d6-proposals.md` for full approval details and `references/face-crop-implementation.md` for D.5 implementation architecture.

Also see `references/face-attribute-detection-proposal.md` for D.6: face attribute detection (gender + age) using OpenCV DNN Caffe models — lightweight alternative to DeepFace for CPU-only edge PCs.
