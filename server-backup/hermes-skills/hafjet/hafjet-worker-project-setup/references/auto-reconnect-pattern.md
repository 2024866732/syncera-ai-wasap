# Auto-Reconnect Pattern for RTSP Workers

## Problem

RTSP streams are inherently unstable — network glitches, camera reboots,
or stream timeouts cause `cv2.VideoCapture.read()` to return `False`.
The base detection loop exits, terminating the entire worker process.

## Solution

Wrap the detection loop in an infinite retry loop so only the video
pipeline is affected, not the API server or database.

## Code changes

### Before (single-run, exits on stream loss)

```python
# main()
run_detection(str(source), db_conn, detector)
db_conn.close()
logger.info("Worker stopped.")
```

### After (auto-reconnect)

```python
# main()
while True:
    run_detection(str(source), db_conn, detector)
    logger.warning("Stream disconnected. Reconnecting in 5 seconds...")
    time.sleep(5)

# The db_conn.close() below is now dead code — acceptable
# db_conn.close()
# logger.info("Worker stopped.")
```

### In `run_detection()`, keep the existing `break` on `cap.read()` failure:

```python
if not ret:
    logger.warning("End of video stream or read error. Reopening if possible…")
    break   # ← this just exits run_detection, which the while loop catches
```

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| Temporary network glitch (<5s) | Worker reconnects after 5s delay |
| Camera reboot (30s) | Worker retries every 5s until camera comes back |
| Permanent stream failure | Worker keeps retrying indefinitely (logs each attempt) |
| Worker needs to stop | `pkill -f 'python -m app.main'` (SIGTERM) |

## Limitations

- The `# Cleanup` / `db_conn.close()` code after the `while True:` loop
  is dead code — resources are cleaned up on process death.
- Ctrl+C won't work in a nohup'd process. Use `pkill` to stop.
- The 5-second reconnect delay is hardcoded. Adjust if the camera needs
  longer to reboot (e.g. 15s for full boot).
