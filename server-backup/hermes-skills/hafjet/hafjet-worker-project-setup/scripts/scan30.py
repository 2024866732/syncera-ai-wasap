#!/usr/bin/env python3
"""scan30 — diagnostic: scan 30 frames from RTSP at ~1 FPS and report detections.

Usage:
    source .venv/bin/activate
    python3 scripts/scan30.py

RTSP URL is read from CAMERA_1_RTSP_URL in .env.
Detection threshold is read from VISION_CONFIDENCE (default 0.0 to show ALL signals).
"""

import os, sys, time, cv2, numpy as np
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent  # up from scripts/ -> project root
sys.path.insert(0, str(SCRIPT_DIR))

from dotenv import load_dotenv
load_dotenv(SCRIPT_DIR / ".env")

RTSP_URL = os.environ.get("CAMERA_1_RTSP_URL", "")
CONF_THRESH = float(os.environ.get("VISION_CONFIDENCE", "0.0"))

if not RTSP_URL:
    print("FAIL: CAMERA_1_RTSP_URL not set in .env")
    sys.exit(1)

print(f"Stream: {RTSP_URL.split('@')[-1]}")
print(f"Confidence threshold: {CONF_THRESH}")

from app.vision.detector import Detector, CLASS_LABELS, PERSON_CLASS_ID
from app import config

detector = Detector(config.MODEL_DIR, confidence_threshold=CONF_THRESH)

cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
if not cap.isOpened():
    print("FAIL: Cannot open RTSP stream")
    sys.exit(1)

header = f"{'Frame':<8} {'Time':<20} {'Person?':<8} {'Best class':<18} {'Best conf':<10} {'Notes'}"
print(header); print("-" * len(header))

person_seen = False
for i in range(30):
    ts = time.strftime("%H:%M:%S")
    ret, frame = cap.read()
    if not ret:
        print(f"{i:<8} {ts:<20} STREAM     {'-':<18} {'-':<10} frame read failed")
        continue

    blob = cv2.dnn.blobFromImage(frame, scalefactor=0.007843,
        size=(config.VISION_IMG_SIZE, config.VISION_IMG_SIZE), mean=127.5)
    detector.model.setInput(blob)
    output = detector.model.forward()

    h, w = frame.shape[:2]
    best_conf, best_label, notes, person_this_frame = 0.0, "-", "", False

    for det in output[0, 0, :, :]:
        confidence, class_id = float(det[2]), int(det[1])
        if confidence <= 0.0: continue
        label = CLASS_LABELS.get(class_id, f"cls_{class_id}")
        if confidence > best_conf:
            best_conf, best_label = confidence, label
        if class_id == PERSON_CLASS_ID:
            person_this_frame = person_seen = True
            notes += f" PERSON({confidence:.2f})"

    flag = "YES" if person_this_frame else "NO"
    print(f"{i:<8} {ts:<20} {flag:<8} {best_label:<18} {best_conf:<10.4f} {notes}")
    time.sleep(0.9)

cap.release()
print(f"\n=== Person detected in any frame: {'YES' if person_seen else 'NO'} ===")
