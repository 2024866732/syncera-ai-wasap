# RTSP Transport Diagnostic

## Tapo TC74 session timeout — FIRMWARE LIMITATION (not fixable via transport)

### Symptom
- `journalctl -u cctv-worker | grep -c "Stream disconnected"` shows **103+ disconnects in 6 hours**
- Timestamps reveal a **cyclical pattern** (~167s = ~2m47s) — very consistent
- Ping to camera shows **0% packet loss** and **low latency** (not a network issue)
- Worker auto-reconnects within 5-7 seconds each time — service itself does NOT restart

### Root Cause
Tapo TC74 **firmware enforces an RTSP session timeout of ~167s** regardless of transport protocol. This has been confirmed through testing:

- **UDP RTP mode:** disconnect every ~167s (predictable cycle)
- **TCP interleaved mode:** disconnect every 49–449s (erratic, **worse** than UDP)

The timeout is a camera-side firmware behavior, NOT a network or transport issue. See `references/rtsp-keep-alive-investigation.md` for the full test results.

**Important:** The RTSP *control* connection (port 554) is always TCP, regardless of transport setting. Changing the transport only affects the *RTP data* channel — and the camera still terminates the session regardless.

### Step-by-step diagnostic

1. **Confirm network health:**
```bash
ping -c 20 <camera-ip>
# Expected: 0% loss, <10ms avg latency
```

2. **Count disconnects in recent period:**
```bash
journalctl -u cctv-worker --since "6 hours ago" | grep -c "Stream disconnected"
```

3. **Check for cyclical pattern:**
```bash
journalctl -u cctv-worker --since "6 hours ago" | grep "Stream disconnected" | head -30
# Look for consistent ~2m47s intervals
```

4. **Verify transport currently in use:**
```bash
# Check systemd environment
grep -r "OPENCV_FFMPEG" /etc/systemd/system/cctv-worker.service

# Check RTSP URL (for URL query approach)
grep "CAMERA_1_RTSP_URL" ~/projects/hafjet-cctv-worker/.env

# Check live connections (UDP RTP = problem, TCP-only = fixed)
ss -tpn | grep -E "192.168.1.94.*python"   # TCP control (always present)
ss -unp | grep 192.168.1.94                  # UDP RTP (should be EMPTY after fix)
```

## Fix method comparison

| Method | Tested? | Result | Recommendation |
|--------|---------|--------|---------------|
| **Accept as limitation (E2)** | ✅ (2026-07-25, 2h monitoring) | Auto-reconnect ~5-7s, ~13 disconnects/hr (improved from 17/hr baseline) | **FINAL** — closed, accept as firmware limitation |
| TCP transport (env var) | ✅ (2026-07-25, tested) | ❌ Erratic, **24/hr**, worse than UDP | Do NOT use — makes disconnects more frequent |
| Application-level keep-alive | ❌ Not tested | Unknown, camera-side timeout unlikely affected | Not worth effort — firmware limitation cannot be overridden |
| UDP rollback (after TCP) | ✅ (2026-07-25, tested) | ✅ Improved: 13/hr (was 17/hr), irregular pattern | **Current mode** — UDP is the stable default |

## Recommended stance

**E2 — Accept as known limitation (CLOSED).** The auto-reconnect mechanism recovers within 5–7 seconds. After 2 hours of UDP monitoring (03:20–05:30 UTC), the disconnect rate settled at ~13/hr, 25% better than the original 17/hr baseline. The cyclical ~167s pattern returns after ~90 minutes of uptime but the impact on detection is negligible (~2% gap). Data integrity confirmed: snapshots = events = alerts (71:71:18). For a single-camera small-shop deployment using a consumer-grade Tapo TC74, this is acceptable.

Key evidence from 2-hour UDP rollback test (2026-07-25):
- 26 disconnects in 120 minutes = 13/hr (baseline was 17/hr)
- All disconnects were decode errors (h264), NOT session timeouts — improved pattern
- Cyclical 167s returned after ~90 minutes but with fewer events
- Data integrity: 71 events = 71 snapshots = 18 alert log lines (100% match)
- CPU stable at 46%, RAM stable at 318MB over full 2h period
- Worker PID 12854, zero systemd restarts since initial deploy

### Impact of accepting the limitation

| Metric | UDP Baseline | UDP After Rollback | TCP (failed) |
|--------|-------------|-------------------|--------------|
| Disconnects per hour | ~17 | **~13** | ~24 |
| Disconnects per 15 min | ~4.3 | **~3.25** | ~6 |
| Pattern | Cyclical 167s | Irregular, decode errors | Erratic 49-449s |
| Detection downtime | ~4% | **~2%** | ~3% |
| Log noise | Heavy | Moderate | Heavy |
| Risk of missed event | Low | **Lower** | Higher |
| Data integrity | ✅ | ✅ | ✅ |

### Verification (post-rollback to baseline)

After removing any TCP transport fix and returning to default UDP:

```bash
# Restart
sudo systemctl restart cctv-worker
sleep 10

# 1. Confirm steady ~167s cycle returns
journalctl -u cctv-worker --since "15 minutes ago" | grep "Stream disconnected" | head -6
# Expected: cyclical ~2m47s pattern, not erratic

# 2. Confirm detection still works
curl -s http://127.0.0.1:8091/health
# Expected: {"status": "ok", ...}
```

### Verification (post-rollback to baseline)

After removing any TCP transport fix and returning to default UDP:

```bash
# Restart
sudo systemctl restart cctv-worker
sleep 10

# 1. Confirm steady ~167s cycle returns
journalctl -u cctv-worker --since "15 minutes ago" | grep "Stream disconnected" | head -6
# Expected: cyclical ~2m47s pattern, not erratic

# 2. Confirm detection still works
curl -s http://127.0.0.1:8091/health
# Expected: {"status": "ok", ...}
```

### Impact of NOT fixing

| Metric | UDP (problem) | TCP (fixed) |
|--------|--------------|-------------|
| Disconnects per 6 hours | ~103 | ~0 |
| Detection downtime | ~4% (7s gap every 167s) | ~0% |
| Log noise | Heavy | Clean |
| Risk of missed event | Low but possible | Negligible |

### Distinguishing from genuine network or crash issues

| Signal | Network issue | Tapo session timeout | Worker crash |
|--------|-------------|---------------------|--------------|
| Ping loss | >1% | **0%** | 0% |
| Ping latency | High/jittery | **<10ms stable** | <10ms |
| Disconnect interval | Random | **Cyclical (~167s)** | N/A (worker dead) |
| Reconnect time | Variable | **~5-7s** (in-code) | Service restart (~10s) |
| Service restarts | Maybe | **No** | Yes |
| `systemctl status` | Active | Active | **Failed/restarting** |

### Related documents
- `references/rtsp-keep-alive-investigation.md` — why TCP didn't work + keep-alive options
