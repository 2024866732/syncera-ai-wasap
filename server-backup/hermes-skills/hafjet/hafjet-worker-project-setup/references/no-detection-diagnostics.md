## No-detection diagnostics (Tapo TC74 + MobileNet-SSD)

If the worker starts, the RTSP stream connects, but zero `person_detected` events are created:

### Step-by-step

0. **CRITICAL — Check what the camera is actually pointing at**

   This is the **#1 root cause** of zero detections. If the camera is placed on a counter,
   behind furniture, or pointed at a chair/wall, no amount of model tuning will help.
   The foreground object (e.g. a chair at 0.78 confidence) will dominate all detections
   and the model will never see the person.

   **Fix:** Physically reposition the camera to point at the entrance walkway where a
   person appears with full body visible (head to feet), unobstructed by foreground objects.

   **Quick verification after positioning:**
   ```bash
   # Run a 30-frame continuous scan
   ssh <host> "cd /project && source .venv/bin/activate && python3 -c '
   import cv2, sys, time
   sys.path.insert(0, \".\")
   from app.vision.detector import Detector
   from app import config
   d = Detector(config.MODEL_DIR)
   cap = cv2.VideoCapture(\"rtsp://...\")
   for i in range(30):
       ret, f = cap.read()
       if not ret: continue
       persons = d.detect_persons(f)
       if persons:
           print(f\"Frame {i}: {len(persons)} person(s), conf={max(p[\"confidence\"] for p in persons):.2f}\")
       else:
           print(f\"Frame {i}: no persons\")
       time.sleep(0.9)
   cap.release()
   '
   ```
   If 30/30 frames detect person with high confidence (>0.90), the positioning is good.
   If 0/30 detect person even at 0.30 confidence, the camera view is the problem.

1. **Confirm the stream is live** (not stalled frame):
   ```bash
   ffprobe -rtsp_transport tcp -i "rtsp://user:pass@camera-ip:554/stream2"
   ```
   Should show a changing `pts` and non-zero frame count. If ffprobe hangs or shows a single frame, the stream may be stalled. Try a different stream path.

2. **Save a debug frame** and inspect what the model sees:
   ```bash
   source ~/projects/hafjet-cctv-worker/.venv/bin/activate
   python -c "
   import cv2
   cap = cv2.VideoCapture('rtsp://user:pass@camera-ip:554/stream2')
   for _ in range(10): cap.read()
   ret, f = cap.read()
   if ret: cv2.imwrite('/tmp/debug_frame.jpg', f); print('Saved')
   cap.release()
   "
   ```
   View the JPEG or check its size. If the frame is all black or static, the stream is not advancing.

3. **Run detector at confidence 0.0** to see all raw detections:
   ```python
   from app.vision.detector import Detector
   d = Detector(model_dir)
   persons = d.detect_persons(frame, conf_threshold=0.0)
   # Check what classes and confidences appear
   ```
   If no detections at 0.0, the model is not recognising any object — perspective/clarity issue.
   If detections appear but below 0.45, lower the confidence threshold and retry.

4. **Swap stream**: `/stream2` (substream) may be too low-resolution for the model.
   Change to `/stream1` (main stream) in `.env`:
   ```ini
   CAMERA_1_RTSP_URL=rtsp://user:pass@192.168.1.94:554/stream1
   ```

5. **Try a different model**: If the steps above confirm the stream is live but MobileNet-SSD still produces no detections, the PASCAL VOC training domain may not match your camera's perspective. Consider:
   - YOLOv8 nano via ONNX Runtime (better generalisation)
   - OpenCV DNN with a YOLO model (e.g. yolov3-tiny.weights)
   - TensorFlow Object Detection API model

### Known limitations

| Factor | Impact |
|--------|--------|
| Ceiling-mounted angle | PASCAL VOC photos are mostly eye-level; top-down views may confuse the model |
| IR / low-light | MobileNet-SSD trained on daylight photos |
| Substream resolution (640×360) | Objects may be too small for the 300×300 native input |
| Confidence threshold 0.45 | May reject weak but correct detections; lower to 0.30 first |
