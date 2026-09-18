# Chatterbox pipeline — queue-native e2e + soak (verified 2026-08-28)

Full recipe for running the REAL queue-native pipeline (not manual-inject):
`/events/comment` → Aina decide → queue → RTX claim → Chatterbox generate →
`/humanaudio` → queue ACK done.

## Preconditions

- Hermes orchestrator up on `127.0.0.1:8740` (stub brain OK; price guard on).
- RTX Tailscale online; LiveTalking `:8010` up; **owner-managed WebRTC session**
  exists (read `/api/admin/sessions` — expect exactly 1 session, avatar `sarah` or Aina).
- GPU idle + CB `run`; no `LIVE_GPU_LOCK` needed for validation because the owner
  session already holds the live window — consumer must use `skip_lock=True`.

## 1. Reverse tunnel (the critical piece)

RTX consumer must reach Hermes orchestrator. **Use ProxyJump `-J`, NOT
`ssh office 'ssh rtx'`** — the two-command jump does not reliably bind the
remote `-R` port on RTX and leaves limbo listeners that `Connection reset`.

```bash
# from Hermes
ssh -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -f -N \
  -R 127.0.0.1:18744:127.0.0.1:8740 -J hafizi145@100.121.94.41 hafjet@100.119.32.87
```

Tunnel gotchas (all hit this session):
- `-f` dies after the calling shell exits — for long runs use
  `terminal(background=true)` without `-f`.
- If a prior `-R` socket lingers on RTX (`ss -lntp | grep 1874` shows LISTEN with
  no visible process; `fuser -k` no-op), do NOT fight it — **use a fresh port**
  (18741/18742/…).
- `ss -lntp` shows LISTEN but `curl` → `Connection reset` = the tunnel process died;
  the socket is limbo. Fresh port + background tunnel fixes it.
- Office is NOT a usable relay: RTX cannot reach Office loopback ports; Office
  cannot SSH Hermes.
- Verify from RTX before running: `curl -s http://127.0.0.1:18744/health` must
  return `"status":"ok"` (and show `queue_pending`).

## 2. Enqueue (queue-native, NOT manual-inject)

```bash
# Hermes
curl -s -X POST http://127.0.0.1:8740/session/start \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["tiktok"],"title":"chatterbox_soak","read_only":false}'
for i in {1..10}; do
  curl -s -X POST http://127.0.0.1:8740/events/comment \
    -H 'Content-Type: application/json' \
    -d "{\"platform\":\"tiktok\",\"event_id\":\"soak-$i\",\"user\":\"soakuser$i\",\"text\":\"Test soak job $i - Aina check dulu ya\"}"
done
curl -s http://127.0.0.1:8740/queue   # expect count 10, all pending
```

Stub Aina turns generic text into `speak` ("Item tu ambo check dulu ya...").
Each `/events/comment` enqueues one job — that IS the queue-native path.

## 3. Claim loop on RTX

Use `scripts/soak_chatterbox.py` (this skill) — scp to `/tmp/`, then:

```bash
# RTX
VAL_ORCH_URL=http://127.0.0.1:18744 SOAK_MAX_RUNS=12 \
  ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/soak_chatterbox.py
```

Key design points:
- The driver claims ONE job from the real Hermes queue per iteration, then feeds
  it to the patched consumer as `job_override` (so it does not double-claim).
- `skip_lock=True` — the owner LT session already holds the lock window;
  consumer must NOT acquire/release it (would disturb the live runtime).
- Per-job record appended to `~/hafjet-chatterbox/soak_report.jsonl` with
  status/ack/source/rtf/duration/bytes/humanaudio code/gpu before+after/wall_s/cb.
- Runs until `QUEUE_EMPTY` (or max runs). Prints compact `JOB` lines for live
  monitoring.

## 4. Expected results (2026-08-28 baseline)

| Metric | Observed |
|---|---|
| Jobs processed | 10/10 |
| Status / ACK | 10 × `ok_spoke` / 10 × `ack: done` |
| `/humanaudio` body | 10 × `code:0` (HTTP 200 alone is NOT success) |
| Source | 10 × `chatterbox`, 0 Edge fallback |
| RTF | min 0.549 · avg 0.652 · max 0.806 |
| VRAM | min 8,498 · avg 8,539 · max 8,598 MB |
| GPU temp | min 46 · avg 48.8 · max 53°C |
| Wall/job | avg 7.04s; job 1 ≈ 24s (model load+warmup), steady ≈ 5s |
| Queue final | count 0 / pending 0 / in_flight 0 |
| GPU after | idle ~42°C / 4.4GB (idle unload after 600s) |

## 5. Verification checklist (report after soak)

1. Hermes `/queue`: `count 0, pending [], in_flight []`.
2. Hermes `/session`: active, `event_count` matches enqueued, `queue_pending 0`.
3. RTX: LT `:8010` still UP (never restarted); GPU idle temp/VRAM; CB `run`.
4. Telemetry `~/hafjet-live/logs/tts_wiring.jsonl` tail: all `ok_spoke` +
   `humanaudio body {code:0}`.
5. Aggregate from `~/hafjet-chatterbox/soak_report.jsonl`: all ok/ack done/code0,
   RTF < 1, VRAM < 11GB, temp < 88°C.
6. Anomaly watch: no Edge fallback, no queue leak, no double-speak, no CB stop,
   no `code:-1`.

## Pitfalls that bit this session

- **POST `/queue/claim` through a dead `-f` tunnel** → HTTP 405 / connection
  reset. The API is fine; the tunnel died. Rebuild tunnel on a fresh port.
- **`curl | python3` / `python3 -c` in jump SSH** → shell-escaping + security
  scanner failures. Write a `.py` to `/tmp`, scp it, run it. Never inline `-c`
  over double-SSH.
- **Running the wrong python** — the second hop (`ssh rtx`) must invoke
  `~/hafjet-chatterbox/venv-chatterbox/bin/python`; the first hop (Office) has no
  such path. Always verify host with `hostname` first.
- **In-flight job from an earlier claim** — if you claimed a job manually during
  debugging, the driver can resume it via `job_override` and still ACK done; the
  pipeline treats it correctly. No need to reset the session.
- **Do not restart LiveTalking** to "fix" anything during validation — the owner
  session UUID must stay stable; read it fresh from `/api/admin/sessions`.
