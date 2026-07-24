# The `scp + vision_analyze` diagnostic loop

The most effective way to diagnose "zero detections" from a live camera is to
**see what the camera actually sees** — not just analyse code.

## Workflow

### 1. Capture a frame from the RTSP stream
```bash
ssh hafizi145@100.121.94.41 "cd /home/hafizi145/projects/hafjet-cctv-worker && source .venv/bin/activate && python3 -c '
import cv2, sys
cap = cv2.VideoCapture(\"rtsp://user:pass@camera-ip:554/stream1\")
for _ in range(5): cap.read()  # warm-up frames
ret, frame = cap.read()
if ret:
    cv2.imwrite(\"/tmp/debug_frame.jpg\", frame)
    print(\"SAVED\")
cap.release()
'"
```

### 2. Copy the frame to the Hermes server (Azure VM)
```bash
scp hafizi145@100.121.94.41:/tmp/debug_frame.jpg /tmp/camera_view.jpg
```

### 3. Use `vision_analyze` to inspect the frame
```python
vision_analyze(image_url="file:///tmp/camera_view.jpg",
               question="Describe exactly what this camera sees. "
                        "List all objects. Is there a person visible? "
                        "What is the camera angle?")
```

This reveals:
- The camera is pointed at a **chair/counter/furniture** (not the walkway)
- A person standing in front is **occluded/partial/out of frame**
- The environment is **too dark** or **too bright** for the model
- The frame is **stalled** (static image, not a live feed)

### Example: before vs after repositioning

| Aspect | Before (on counter) | After (pointed at entrance) |
|--------|---------------------|---------------------------|
| `vision_analyze` result | "Camera sitting on counter, foreground blurred counter, rack with cables, chair covered in plastic" | "Person standing at entrance, full body visible" |
| Dominant model detection | `chair` at 0.78 | `person` at 0.98+ |
| Person detection rate | 0/30 frames | 30/30 frames |

### Why this works

The `vision_analyze` tool (powered by a vision model) sees the same frame the
detection model sees. By getting an unbiased description of the frame content,
you immediately know whether the problem is:

1. **Camera positioning** (frame shows furniture, not people) → **most common**
2. **Stream quality** (frame is black/pixelated/stalled) → stream or network issue
3. **Model capability** (frame has a clear person but model doesn't detect) → needs model change

This is faster and more reliable than adjusting thresholds or changing streams
blindly (which only works if the camera is already pointed at the right area).
