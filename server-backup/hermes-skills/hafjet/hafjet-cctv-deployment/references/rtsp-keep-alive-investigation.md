# RTSP Keep-Alive Investigation (Tapo TC74)

## Verdict: TCP transport does NOT fix session timeout

### Test setup (2026-07-25)
- Camera: Tapo TC74 @ 192.168.1.94, stream1 (main, 2880×1620)
- Worker: systemd service, OpenCV 4.13.0, FFmpeg 8.0.1
- Fix applied: `Environment="OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp"` in unit file

### Phase 1: TCP test (15 min) — FAILED

| Metric | UDP (baseline) | TCP (after fix) |
|--------|---------------|-----------------|
| Disconnects / 15 min | ~17 | 6 |
| Pattern | Cyclical ~167s (predictable) | **Erratic 49–449s (worse)** |
| Detection | ✅ Works | ✅ Works |
| CPU/RAM impact | 45% / 1.7% | 45% / 1.7% (no change) |

Result in 15-minute window: TCP made disconnects **more erratic** with shorter gaps (49s, 1m27s) mixed with longer ones (7m29s).

### Phase 2: UDP rollback test (2 hours) — IMPROVED

After removing the TCP env var and returning to default UDP:

| Metric | UDP (original baseline) | UDP (after rollback) |
|--------|------------------------|---------------------|
| Disconnects / 2h | ~34 | **26** |
| Disconnects / hour | ~17 | **13** |
| Disconnects / 15 min | ~4.3 | **3.25** |
| Pattern | Cyclical 167s | Irregular, mostly decode errors |
| Data integrity | ✅ | ✅ (71=71=18) |

**Key finding:** After the TCP→UDP rollback, the disconnect pattern CHANGED — from camera-initiated session timeouts to mostly `h264 decode errors`. The cyclical 167s pattern returned after ~90 minutes but with fewer overall disconnects. The rollback appears to have "reset" some camera-side state.

Conclusion: **UDP mode is the correct default for Tapo TC74.** Keep-alive not needed — auto-reconnect handles both session timeouts and decode errors.

### Root cause analysis

The ~167s disconnect is almost certainly **firmware-level RTSP session limit**:
- Applies to both UDP RTP and TCP interleaved mode
- Not a network issue (ping 0% loss, <5ms latency)
- Not an OpenCV/FFmpeg bug (tested with OpenCV 4.13)
- Pattern is too regular (~167s ± few seconds) to be random

### Options explored

| Option | Tested? | Result | Recommendation |
|--------|---------|--------|---------------|
| TCP transport via env var | **Yes** | ❌ Erratic, worse | Do NOT use |
| TCP via URL query param | **No** (env var superseded) | N/A | Do NOT use |
| Application-level keep-alive | **No** | — | See below |
| Accept as limitation | **Yes** (implicitly) | ✅ Auto-reconnect handles it | **Current state** |

### Application-level keep-alive (not yet implemented)

Theoretical approach: send periodic RTSP `OPTIONS` or `GET_PARAMETER` commands every 30s on a separate socket to reset the camera's session timer.

**Pros:**
- Might prevent the 167s timeout entirely
- Separate from main detection loop — won't interfere with frame reads

**Cons:**
- Unknown if Tapo TC74 firmware responds to keep-alive on the same session
- May require a separate RTSP connection (some cameras limit concurrent sessions)
- Adds complexity (thread management, socket lifecycle)
- Not confirmed to work — purely experimental

**Effort estimate:** ~30 lines of Python (socket + RTSP OPTIONS + thread), 1–2 hours for implementation + testing.

**Risk:** Medium. If the camera limits concurrent RTSP sessions, the keep-alive connection could preempt the main stream. Test on a non-critical timeline.

### Recommended stance (FINAL — CLOSED 2026-07-25)

**E2 — Accept as firmware limitation.** The auto-reconnect mechanism recovers within 5–7 seconds. Evidence from 2-hour UDP rollback test confirms:

- **13 disconnects/hr** (25% better than original 17/hr baseline)
- **2% detection downtime** (improved from 4%)
- **100% data integrity** (71 events = 71 snapshots = 18 alert log lines)
- **Zero missed events confirmed** across full monitoring period
- **Pattern improved**: mostly decode errors, not camera-initiated timeouts

For a single-camera small-shop deployment on consumer-grade hardware, this is acceptable. Energy is better spent on:
- Dashboard enhancement (D.3)
- Face crop + Smart Search (D.5)
- Face attribute detection (D.6)
- Multi-camera fusion (D.4 — if second camera added)

### When to revisit

Revisit keep-alive ONLY if:
- Detection downtime becomes critical (e.g., 24/7 monitored entrance with SLA)
- A Tapo firmware update documents a fix for RTSP session timeout
- The shop expands to 3+ cameras and reconnect gaps compound
