# CCTV evidence chain and controlled-restart record

## Exact-event evidence chain

Use one event ID / UTC timestamp throughout. Record only the minimum necessary facts:

| Layer | Read-only evidence | Meaning |
|---|---|---|
| Worker journal | `Face attr:` output or exception | D.6 invocation outcome |
| SQLite, read-only URI | `face_snapshot_path`, `gender`, `age_range` | Persistence result |
| Live API | Same event fields | API serialization result |
| Dashboard source/HTML | Same fields rendered by the server | Server template/query result |
| Browser screenshot/DOM | Event ID and visible card | Client cache/selection/rendering result |

Never compare different events. A crop may exist while attributes are correctly absent because the confidence/crop/D.6 path did not run for that event.

## Restart evidence record

### Pre

```text
UTC / MYT:
PID:
MemoryCurrent / MemoryPeak:
smaps: Rss / Pss_Anon / Private_Dirty:
health:
face GET status + content type:
full snapshot GET status + content type:
dashboard / CSV status:
tracker lines:
journal-window path:
explicit escalation reason:
```

### Post

```text
helper exit code:
service active / new PID:
new MemoryCurrent / MemoryPeak:
health + dashboard/CSV/face/snapshot checks:
restart and reconnect timestamps:
tracker at agreed +30 / +60 minute points:
first successful Face attr after restart, if any:
```

A helper's own marker check may be narrower or staler than the worker's actual health. Report it honestly, then verify independently; never use that distinction to authorize a retry.
