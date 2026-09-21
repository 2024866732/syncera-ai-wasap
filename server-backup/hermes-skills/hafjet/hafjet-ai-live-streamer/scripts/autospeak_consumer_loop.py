#!/usr/bin/env python3
"""HAFJET autospeak consumer loop — claim orch queue → speak_queue_consumer.run_once.

Copy to RTX /tmp/ after a WSL reboot (that tmpfs wipes the previous copy).

VAL_ORCH_URL=http://127.0.0.1:18744 MAX_JOBS=300 MAX_SEC=14400 \
  ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/autospeak_consumer_loop.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ORCH = os.environ.get("VAL_ORCH_URL", "http://127.0.0.1:18744")
LT = os.environ.get("LT_BASE", "http://127.0.0.1:8010")
MAX_JOBS = int(os.environ.get("MAX_JOBS", "300"))
MAX_SEC = int(os.environ.get("MAX_SEC", "14400"))
POLL_S = float(os.environ.get("POLL_S", "10"))
GPU_VRAM_STOP_MB = int(os.environ.get("GPU_VRAM_STOP_MB", "11000"))
GPU_TEMP_STOP_C = float(os.environ.get("GPU_TEMP_STOP_C", "80"))

CONSUMER = Path.home() / "hafjet-live" / "bin" / "livetalking_glue" / "speak_queue_consumer.py"
sys.path.insert(0, str(CONSUMER.parent))
import speak_queue_consumer as sqc  # noqa: E402

OUT = Path.home() / "hafjet-chatterbox" / "autospeak_consumer_report.jsonl"


def http_json(method: str, url: str, timeout: int = 12):
    req = urllib.request.Request(url, method=method)
    last = None
    for _attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2)
    raise last  # type: ignore[misc]


def get_queue():
    return http_json("GET", f"{ORCH}/queue")


def claim():
    try:
        body = http_json("POST", f"{ORCH}/queue/claim")
    except Exception as e:  # noqa: BLE001
        print("CLAIM_ERR", type(e).__name__, str(e)[:120], flush=True)
        return None
    return (body or {}).get("job")


def gpu():
    try:
        out = subprocess.check_output(
            [
                "/usr/lib/wsl/lib/nvidia-smi",
                "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=10,
        ).strip().split(",")
        return {
            "temp_c": float(out[0].strip()),
            "util_pct": int(out[1].strip()),
            "vram_used_mb": int(out[2].strip()),
            "vram_total_mb": int(out[3].strip()),
        }
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:100]}


def main() -> int:
    t0 = time.time()
    jobs = 0
    print(
        json.dumps(
            {
                "event": "start",
                "orch": ORCH,
                "max_jobs": MAX_JOBS,
                "max_sec": MAX_SEC,
                "vram_stop": GPU_VRAM_STOP_MB,
                "temp_stop": GPU_TEMP_STOP_C,
            }
        ),
        flush=True,
    )
    stop_reason = "limit"
    while jobs < MAX_JOBS and (time.time() - t0) < MAX_SEC:
        g = gpu()
        vram = int(g.get("vram_used_mb") or 0)
        temp = float(g.get("temp_c") or 0)
        if vram >= GPU_VRAM_STOP_MB or temp >= GPU_TEMP_STOP_C:
            print("GPU_STOP", json.dumps(g), flush=True)
            stop_reason = "gpu_stop"
            break
        try:
            q = get_queue()
        except Exception as e:  # noqa: BLE001
            print("QUEUE_ERR", type(e).__name__, str(e)[:120], flush=True)
            time.sleep(POLL_S)
            continue
        if int(q.get("count") or 0) == 0:
            time.sleep(POLL_S)
            continue
        job = claim()
        if not job:
            time.sleep(1)
            continue
        g0 = gpu()
        t_job = time.perf_counter()
        out = sqc.run_once(
            orch_url=ORCH,
            dry_run=False,
            require_livetalking=True,
            lock_path=Path.home() / "hafjet-live" / "LIVE_GPU_LOCK",
            lt_base=LT,
            wav_dir=Path.home() / "hafjet-chatterbox" / "wired",
            skip_cb=False,
            fake_csv=None,
            job_override=job,
            hold_session_lock=False,
            skip_lock=True,
        )
        wall_s = round(time.perf_counter() - t_job, 2)
        g1 = gpu()
        rec = {
            "job_id": job.get("id"),
            "event_id": job.get("event_id"),
            "status": out.get("status"),
            "ack": out.get("ack"),
            "rtf": (out.get("tts") or {}).get("rtf"),
            "humanaudio_code": ((out.get("avatar") or {}).get("humanaudio") or {}).get(
                "body", {}
            ).get("code"),
            "gpu_before": g0,
            "gpu_after": g1,
            "wall_s": wall_s,
            "cb": out.get("cb"),
            "session_prefix": (out.get("session") or {}).get("prefix"),
        }
        with OUT.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, default=str) + "\n")
        print("JOB", json.dumps(rec, default=str)[:500], flush=True)
        jobs += 1
        if out.get("status") != "ok_spoke":
            print(
                "NON_OK_STOP",
                json.dumps({"status": out.get("status"), "cb": out.get("cb")}, default=str)[:400],
                flush=True,
            )
            stop_reason = "non_ok_status"
            break
    try:
        qf = get_queue()
        fq = {
            "count": qf.get("count"),
            "pending": len(qf.get("pending") or []),
            "in_flight": len(qf.get("in_flight") or []),
        }
    except Exception as e:  # noqa: BLE001
        fq = {"error": str(e)[:80]}
    print(
        "FINAL",
        json.dumps(
            {
                "jobs": jobs,
                "stop_reason": stop_reason,
                "elapsed_s": round(time.time() - t0, 1),
                "final_queue": fq,
            }
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
