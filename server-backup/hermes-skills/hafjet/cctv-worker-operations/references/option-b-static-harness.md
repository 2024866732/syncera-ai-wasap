# Option B Stage 1 — Static all-model harness

## Purpose
Separate a one-time OpenCV native workspace allocation from recurrent production RSS accumulation without opening RTSP or importing the worker.

## Required isolation
- One disposable process, low priority (`nice` + idle I/O scheduling).
- No production app import, no `VideoCapture`, no RTSP, no DB writes and no artifact images.
- Use stored full snapshots known to have been person events and face crops.
- Load the exact production MobileNet-SSD Caffe detector, Haar parameters, and age/gender Caffe models with CPU backend/target.

## Required checkpoints
- `after_model_load` before a forward, then cycle 0/1/5/10/25/50.
- At cycles 1 and 50: after detector forward, Haar crop, gender forward, age forward, and explicit `del`/GC.
- At each point: RSS, PSS, Pss_Anon, Private_Dirty; include production service state as a guard.

## Interpretation rule
A large first-forward increase that remains flat from cycle 5 to cycle 50 indicates cached native workspace allocation, not a reproduced continuous leak. Do not call it a cure or eliminate DNN entirely; it shifts suspicion to production-only interaction such as decode/FFmpeg/frame/event lifecycle. Stage 2 decode/VideoCapture isolation requires new approval.

## 2026-07-30 evidence pattern
Exact production model trio on one stored frame:
- Before forward: RSS 203.2 MiB; Pss_Anon/Private_Dirty 173.5 MiB.
- Cycle 1: RSS 416.5 MiB; Pss_Anon/Private_Dirty 383.8 MiB.
- Cycle 5: RSS 420.9 MiB.
- Cycle 10/25: RSS 420.9 MiB.
- Cycle 50: RSS 421.0 MiB.
- At cycle 50 every detector/Haar/gender/age/deletion boundary remained 421.0 MiB.

This is a documented plateau after first use, not the historical production recurrence to 600+ MiB.
