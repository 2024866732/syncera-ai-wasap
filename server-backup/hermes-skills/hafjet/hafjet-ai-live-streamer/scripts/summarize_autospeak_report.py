#!/usr/bin/env python3
"""Summarize ~/hafjet-chatterbox/autospeak_consumer_report.jsonl by event_id prefix.

Replaces the per-run one-off summarizers (soak_summary / g7_summary /
dual_summary / task1_final_stats). Copy to RTX /tmp and run with any python3:

  python3 /tmp/summarize_autospeak_report.py dual-ti-94db1e dual-fb-94db1e
  python3 /tmp/summarize_autospeak_report.py stub-soak-1788136754

Per prefix prints: processed / ok_spoke / ack_done / humanaudio_code0 counts,
RTF list + median, GPU temp max + VRAM max, wall median. Then combined stats
across all given prefixes.
"""
import json
import statistics
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
prefixes = sys.argv[1:] or ["dual-ti-", "dual-fb-"]
recs = {p: [] for p in prefixes}
path = Path.home() / "hafjet-chatterbox" / "autospeak_consumer_report.jsonl"
if not path.exists():
    print("NO_REPORT", str(path))
    sys.exit(1)
with path.open(encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        eid = str(r.get("event_id", ""))
        for p in prefixes:
            if eid.startswith(p):
                recs[p].append(r)


def _nums(rows, key):
    return [r[key] for r in rows if isinstance(r.get(key), (int, float))]


def _gpu(rows, key):
    vals = [r["gpu_after"][key] for r in rows
            if isinstance(r.get("gpu_after"), dict) and key in r["gpu_after"]]
    return max(vals) if vals else None


for p, rows in recs.items():
    rtfs = _nums(rows, "rtf")
    walls = _nums(rows, "wall_s")
    print(p, json.dumps({
        "processed": len(rows),
        "ok_spoke": sum(1 for r in rows if r.get("status") == "ok_spoke"),
        "ack_done": sum(1 for r in rows if r.get("ack") == "done"),
        "code0": sum(1 for r in rows if r.get("humanaudio_code") == 0),
        "rtfs": rtfs,
        "rtf_median": round(statistics.median(rtfs), 3) if rtfs else None,
        "temp_max_c": _gpu(rows, "temp_c"),
        "vram_max_mb": _gpu(rows, "vram_used_mb"),
        "wall_median_s": round(statistics.median(walls), 2) if walls else None,
    }))

allr = [v for rows in recs.values() for v in _nums(rows, "rtf")]
if allr:
    print("COMBINED median", round(statistics.median(allr), 3),
          "min", min(allr), "max", max(allr), "n", len(allr))
