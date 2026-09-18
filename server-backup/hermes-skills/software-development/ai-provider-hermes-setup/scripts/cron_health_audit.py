#!/usr/bin/env python3
"""Hermes cron health audit — stdlib only, run with /usr/bin/python3.

Why this exists: `cronjob action='list'` shows `state: scheduled, enabled: true`
for jobs whose every fire has failed for weeks, and a job skipped by the
`[drift_skip]` guard reports nothing at all. This reads the two sources that
actually carry the truth:

    ~/.hermes/cron/jobs.json       per-job model/provider/last_error/failure_streak
    ~/.hermes/cron/executions.db   table `executions` (per-attempt status + error)

Usage:
    /usr/bin/python3 cron_health_audit.py            # report
    /usr/bin/python3 cron_health_audit.py --quiet    # print ONLY unhealthy jobs
                                                     # (empty output = silent, for watchdog use)

Exit code 1 when at least one job is unhealthy, 0 when all good.
"""
import json
import os
import sqlite3
import sys

CRON_DIR = os.path.expanduser("~/.hermes/cron")
JOBS_PATH = os.path.join(CRON_DIR, "jobs.json")
DB_PATH = os.path.join(CRON_DIR, "executions.db")

# error-substring -> (class, short fix hint)
CLASSES = (
    ("drift_skip", "DRIFT_SKIP", "unpinned job + global config drift -> skipped silently; pin --model/--provider"),
    ("is not supported on this endpoint", "BAD_MODEL", "invalid/dead model id -> pin a live id from /models"),
    ("Model is unavailable", "MODEL_GONE", "upstream retired this provider+model -> re-pin"),
    ("not a valid model", "BAD_MODEL", "invalid model id -> pin a live id"),
)
SCRIPT_CLASS = ("script", "SCRIPT", "no_agent/script failure (host offline, auth...) - not a model bug")


def classify(error):
    if not error:
        return None
    for needle, name, hint in CLASSES:
        if needle in error:
            return name, hint
    return SCRIPT_CLASS[1], SCRIPT_CLASS[2]


def load_jobs():
    with open(JOBS_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    return data["jobs"] if isinstance(data, dict) else data


def recent_attempts(per_job=3):
    """job_id -> [(claimed_at, status, error), ...] newest first."""
    if not os.path.exists(DB_PATH):
        return {}
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = con.execute(
            "SELECT job_id, status, error, claimed_at FROM executions "
            "ORDER BY claimed_at DESC LIMIT 1000"
        ).fetchall()
    except sqlite3.Error:
        return {}
    finally:
        con.close()
    out = {}
    for job_id, status, error, claimed_at in rows:
        bucket = out.setdefault(job_id, [])
        if len(bucket) < per_job:
            bucket.append((claimed_at, status, error or ""))
    return out


def main():
    quiet = "--quiet" in sys.argv
    if not os.path.exists(JOBS_PATH):
        print(f"no jobs file at {JOBS_PATH}")
        return 0

    jobs = load_jobs()
    attempts = recent_attempts()
    healthy, problems = [], []

    for job in sorted(jobs, key=lambda j: j.get("name") or ""):
        jid = job.get("id") or job.get("job_id") or "?"
        name = job.get("name") or "(unnamed)"
        model = job.get("model")
        provider = job.get("provider")
        no_agent = bool(job.get("no_agent"))
        err = job.get("last_error") or ""
        streak = job.get("failure_streak") or 0
        enabled = job.get("enabled")

        notes = []
        if enabled is False:
            notes.append("paused")
        if not no_agent and not model and not notes:
            # leading indicator for the next silent drift_skip
            notes.append("UNPINNED agent job -> drift_skip risk")

        cls = classify(err)
        if cls:
            notes.append(f"{cls[0]}: {cls[1]} - {cls[2]}")
        if streak:
            notes.append(f"failure_streak={streak}")
        if job.get("last_delivery_error"):
            notes.append(f"delivery: {str(job['last_delivery_error'])[:80]}")

        row = {
            "id": jid,
            "name": name,
            "model": model or ("script" if no_agent else "-"),
            "provider": provider or "-",
            "streak": streak,
            "notes": notes,
            "enabled": enabled,
        }
        # paused jobs are informational; not counted as failures
        if notes and any(n != "paused" for n in notes):
            problems.append(row)
        else:
            healthy.append(row)

    if not quiet:
        print(f"jobs={len(jobs)}  healthy={len(healthy)}  needs_attention={len(problems)}")
        if healthy:
            print("\n-- ok ---------------------------------------------------------------")
            for r in healthy:
                tag = " [paused]" if r["enabled"] is False else ""
                print(f"  {r['id']}  {r['name'][:38]:38} model={str(r['model'])[:30]}{tag}")
        print("\n-- needs attention --------------------------------------------------")
        for r in problems:
            print(f"  {r['id']}  {r['name'][:38]:38} model={str(r['model'])[:30]} streak={r['streak']}")
            for n in r["notes"]:
                print(f"      - {n}")
            for claimed_at, status, error in attempts.get(r["id"], [])[:2]:
                if error:
                    print(f"      last fire {claimed_at}: {error[:140]}")
        if not problems:
            print("  none")
        print("\nrepair: hermes cron edit <id> --model <live-id> --provider <provider>")
    else:
        for r in problems:
            print(f"{r['id']} | {r['name']} | model={r['model']} | streak={r['streak']} | {'; '.join(r['notes'])}")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
