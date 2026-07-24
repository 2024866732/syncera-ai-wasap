# Diagnostic Frame Scanner (scan30.py)

A Python script that captures 30 frames at 1 FPS from an RTSP stream and reports all detections at confidence > 0.0 (any class). Useful for:
- Verifying camera view/perspective before committing to a full worker run
- Checking whether MobileNet-SSD detects anything (any class) in the current frame
- Identifying dominant objects (chairs, tables, etc.) that may be overriding person detection

## Usage

```bash
cd ~/projects/hafjet-cctv-worker && source .venv/bin/activate
python3 /path/to/scan30.py
```

The script:
1. Opens the RTSP stream (hardcoded URL — update for your camera)
2. Captures 30 frames at ~1 FPS
3. For each frame, runs the full model inference (all classes, not just person)
4. Reports: frame number, timestamp, whether a person was detected, best class name, best confidence, and any notes
5. Prints a final summary: "Person detected in any frame: YES/NO"

## Example Output

```
Scanning 30 frames at 1 FPS...
Frame    Time                 Person?  Best class      Best conf  Notes
0        15:09:56             NO       chair           0.7800
1        15:09:57             NO       chair           0.7851
...
15       15:10:11             NO       chair           0.7958
...
30       15:10:26             NO       chair           0.7664

=== Person detected in any frame: NO ===
```

## When to Use

- **Before first worker run** with a new camera position — confirms the model can see persons
- **After repositioning the camera** — quick verification without full daemon startup
- **When worker reports zero events** — isolates the problem to camera view vs worker logic
- **When debugging false positives** — run with `confidence_threshold=0.0` to see what the model is actually detecting (set in the script, not the worker)

## Implementation Note

The scanner imports the same `Detector` class and model as the main worker, so test results are directly applicable. The key difference: it bypasses cooldown and event persistence to show every raw detection.
