# RTSP Camera Testing Protocol (Sequential)

Tuan Hafizi's enforced ordering for debugging camera detection issues.
Do NOT skip steps. Do NOT combine steps.

## The Order

```
A. Camera repositioning
   (check framing first, not model)
   ↓ if still no detection
B. Lower confidence threshold
   (0.45 → 0.30)
   ↓ if still no detection
C. Switch stream
   (stream2 → stream1)
   ↓ if still no detection
D. Replace model
   (MobileNet-SSD → YOLOv8 nano or similar)
```

## Step A: Camera repositioning (MANDATORY first step)

Most common cause of zero detections is the camera pointed at furniture,
not the walkway.

### Commands

```bash
# 1. Capture one debug frame from the RTSP stream
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/<project> && source .venv/bin/activate && python3 -c '
import cv2
cap = cv2.VideoCapture(\"rtsp://user:pass@<ip>:554/stream1\")
[cap.read() for _ in range(5)]
ret, f = cap.read()
cv2.imwrite(\"/tmp/debug_frame.jpg\", f)
cap.release()
print(\"Saved /tmp/debug_frame.jpg\")
'"

# 2. Copy to Hermes server for inspection
scp hafizi145@100.121.94.41:/tmp/debug_frame.jpg /tmp/debug_frame.jpg

# 3. Inspect with vision_analyze
vision_analyze(image_url="file:///tmp/debug_frame.jpg",
               question="Describe what this camera sees. Is it pointed at an entrance/walkway or at furniture? Are there any people visible?")

# 4. If furniture/wall: physically reposition camera to point at walkway.
# 5. After reposition, run 30-frame scan:
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/<project> && source .venv/bin/activate && python3 scripts/scan30.py"
```

### Pass criteria
- 30/30 frames detect person at confidence ≥0.45 (or current threshold)
- Walker stays in frame with full body visible

### Report format

| Metric | Before reposition | After reposition |
|--------|-------------------|------------------|
| Frames with person | 0/30 | 30/30 |
| Best confidence | chair@0.78 | person@0.99 |
| Dominant class | chair | person |

---

## Step B: Lower confidence threshold (only if A fails)

Only if person still not detected after correct positioning, lower the
threshold from default (0.45) to 0.30.

### Commands

```bash
# Idempotent .env update
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/<project> && if ! grep -q '^VISION_CONFIDENCE=' .env; then echo 'VISION_CONFIDENCE=0.30' >> .env; else sed -i 's/^VISION_CONFIDENCE=.*/VISION_CONFIDENCE=0.30/' .env; fi"

# Run 30-frame scan to verify
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/<project> && source .venv/bin/activate && python3 scripts/scan30.py"
```

---

## Step C: Switch stream (only if B fails)

If substream (stream2) still produces no detection, try main stream
(stream1) which has higher resolution.

### Commands

```bash
# Switch stream2 → stream1
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/<project> && sed -i 's|/stream2|/stream1|' .env"

# Run 30-frame scan
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/<project> && source .venv/bin/activate && python3 scripts/scan30.py"
```

### Trade-offs

| | stream2 (substream) | stream1 (main) |
|---|---|---|
| Resolution | Lower (640×360) | Higher (2880×1620) |
| Detection quality | Worse for small models | Better |
| Bandwidth | Lower | Higher |
| Connection stability | More stable | May disconnect (1-2 min) |
| CPU load | Lower | Higher (but fine on i3-2100) |

---

## Step D: Replace model (only if A+B+C fail)

If all three steps above fail with zero detection, the model architecture
(MobileNet-SSD) is not suitable for this camera's view angle. Upgrade to
YOLOv8 nano via ONNX Runtime.

See: `hafjet-worker-project-setup` → auto-reconnect pattern for
reconnection logic when using stream1.
