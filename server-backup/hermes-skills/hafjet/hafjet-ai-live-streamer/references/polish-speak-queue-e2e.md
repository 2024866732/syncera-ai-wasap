# Polish — speak-queue consumer e2e (2026-08-18)

**Approve:** `approve polish`  
**Result:** A1–A3 + B1 + D PASS · Task 8 **diff only** (not applied)

## Goal
One speak line: **orchestrator queue text** → Edge-TTS → LiveTalking lipsync on RTX, with CB + `LIVE_GPU_LOCK`.

## Connectivity (file bridge)

Office cannot pubkey-SSH Hermes. Working path:

1. Hermes: `uvicorn` `:8740`, `AINA_BRAIN_MODE=stub`
2. Hermes: `scripts/polish_e2e_enqueue.py` or `POST /events/comment` → speak enqueued
3. Hermes: `POST /queue/claim` → write job JSON
4. `scp` job → Office → RTX `/tmp/polish_job.json`
5. RTX consumer `--job-json` (orch ack optional if no tunnel)

Do **not** require RTX→Hermes HTTP for first e2e proof.

## LiveTalking session (critical)

```
WebRTC: createOffer → POST /offer → sessionid
Keep RTCPeerConnection open
edge-tts → wav
POST /humanaudio multipart (sessionid + file)
Expect: HTTP 200 and body {"code": 0, "msg": "ok"}
```

| Response | Meaning |
|----------|---------|
| `code: 0` | Success — audio accepted (log may show 静音→说话) |
| `code: -1` session not found | Peer closed or wrong sessionid — **fail** |
| HTTP 200 alone | Insufficient — always parse body code |

Consumer helper: `_lt_ok()` rejects `code == -1`.

## Verified e2e sample

| Field | Value |
|-------|--------|
| status | `ok_spoke` |
| text | stub brain charger line **RM29.90** (from queue) |
| TTS | `ms-MY-YasminNeural`, wav ~77KB under `~/hafjet-live/wav/` |
| CB pre/post | `run`, ~42–44°C, VRAM ~3.6GB with LT loaded |
| lock after | `LOCK_HELD=0` |
| LT cleanup | stop app.py; `:8010` down |

## CB idle (Task 7)

Before LT: ~43°C, ~1273 MiB, `action=run`.

## Task 8 (not applied)

Target: `~/cctv-analysis/cctv_analyze.py`  
At start of `main()`:

```python
live_lock = Path(os.path.expanduser("~/hafjet-live/LIVE_GPU_LOCK"))
if live_lock.is_file():
    print("SKIP_LIVE_LOCK")
    log_line({..., "status": "SKIP_LIVE_LOCK"})
    sys.exit(0)
```

Optional same check in `run_batch.sh`.  
Full diff: repo `docs/runbook-g2-task8-cctv-diff.md`  
Apply only after Tuan: `OK Task 8 apply`.

## Deploy consumer to RTX

```bash
# from Hermes via Office jump
scp consumer.py office:/tmp/
ssh office 'scp -i ~/.ssh/id_ed25519_office2rtx /tmp/speak_queue_consumer.py hafjet@100.119.32.87:~/hafjet-live/bin/livetalking_glue/'
```

Use existing `venv-livetalking` (edge-tts already present). No weight download.

## Out of scope
G4c, TikTok.com GUI, RTMP, public live, LiveTalking reinstall.
