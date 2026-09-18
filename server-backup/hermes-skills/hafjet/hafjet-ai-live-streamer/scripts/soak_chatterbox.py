#!/usr/bin/env python3
"""Soak test driver: claim Hermes queue -> Chatterbox -> /humanaudio -> ACK.

Loops until queue empty or max_runs reached. Records per-job telemetry to
~/hafjet-chatterbox/soak_report.jsonl and prints a compact line per job so the
operator can monitor real-time. skip_lock=True (owner live session lock).

Verified 2026-08-28: 10/10 jobs ok_spoke, ack done, humanaudio code:0,
RTF avg 0.652, VRAM avg ~8.5GB, temp avg 48.8C. Job 1 ~24s (model load+warmup),
steady-state ~5s/job. Queue ends 0/0/0.

Usage on RTX (tunnel 18744 up first):
  VAL_ORCH_URL=http://127.0.0.1:18744 SOAK_MAX_RUNS=12 \
    ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/soak_chatterbox.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

ORCH = os.environ.get("VAL_ORCH_URL", "http://127.0.0.1:18744")
LT = "http://127.0.0.1:8010"
CONSUMER = Path.home() / "hafjet-live" / "bin" / "livetalking_glue" / "speak_queue_consumer.py"
sys.path.insert(0, str(CONSUMER.parent))
import speak_queue_consumer as sqc  # noqa: E402

OUT = Path.home() / "hafjet-chatterbox" / "soak_report.jsonl"
MAX_RUNS = int(os.environ.get("SOAK_MAX_RUNS", "12"))


def get_queue():
    with urllib.request.urlopen(f"{ORCH}/queue", timeout=10) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def claim():
    req = urllib.request.Request(f"{ORCH}/queue/claim", method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode("utf-8", "replace")).get("job")
    except urllib.error.HTTPError as e:
        print("CLAIM_ERR", e.code, flush=True)
        return None


def gpu():
    try:
        out = subprocess.check_output(
            ["/usr/lib/wsl/lib/nvidia-smi",
             "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"], text=True, timeout=10).strip().split(",")
        return {"temp_c": int(out[0].strip()), "util_pct": int(out[1].strip()),
                "vram_used_mb": int(out[2].strip()), "vram_total_mb": int(out[3].strip())}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:100]}


def main() -> int:
    runs = 0
    while runs < MAX_RUNS:
        q = get_queue()
        if q.get("count", 0) == 0:
            print("QUEUE_EMPTY", flush=True)
            break
        g0 = gpu()
        job = claim()
        if not job:
            print("CLAIM_NONE", flush=True)
            time.sleep(1)
            continue
        t0 = time.perf_counter()
        out = sqc.run_once(
            orch_url=ORCH, dry_run=False, require_livetalking=True,
            lock_path=Path.home() / "hafjet-live" / "LIVE_GPU_LOCK",
            lt_base=LT, wav_dir=Path.home() / "hafjet-chatterbox" / "wired",
            skip_cb=False, fake_csv=None, job_override=job,
            hold_session_lock=False, skip_lock=True,
        )
        wall_s = round(time.perf_counter() - t0, 2)
        g1 = gpu()
        rec = {
            "run": runs + 1, "job_id": job.get("id"), "event_id": job.get("event_id"),
            "status": out.get("status"), "ack": out.get("ack"),
            "source": (out.get("tts") or {}).get("engine"),
            "rtf": (out.get("tts") or {}).get("rtf"),
            "duration_s": (out.get("tts") or {}).get("duration_s"),
            "bytes": (out.get("tts") or {}).get("bytes"),
            "text_pre": (out.get("tts") or {}).get("text_pre"),
            "humanaudio_code": ((out.get("avatar") or {}).get("humanaudio") or {}).get("body", {}).get("code"),
            "humanaudio_http": ((out.get("avatar") or {}).get("humanaudio") or {}).get("http"),
            "gpu_before": g0, "gpu_after": g1, "wall_s": wall_s,
            "cb": out.get("cb"), "session_prefix": (out.get("session") or {}).get("prefix"),
        }
        with OUT.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, default=str) + "\n")
        print("JOB", json.dumps({k: rec[k] for k in
              ("run", "event_id", "status", "ack", "source", "rtf", "humanaudio_code", "gpu_after", "wall_s")},
              default=str), flush=True)
        runs += 1
        if out.get("status") != "ok_spoke":
            print("NON_OK", json.dumps(out, default=str)[:300], flush=True)

    qf = get_queue()
    print("FINAL_QUEUE", json.dumps({"count": qf.get("count"), "pending": len(qf.get("pending", [])),
                                     "in_flight": len(qf.get("in_flight", []))}, default=str), flush=True)
    print("REPORT", str(OUT), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
