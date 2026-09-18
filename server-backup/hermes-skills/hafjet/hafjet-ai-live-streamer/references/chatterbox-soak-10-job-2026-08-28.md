# Chatterbox 10-job soak — measured (2026-08-28)

Stability evidence for the queue-native pipeline before enabling any TikTok
listener / public live. All numbers from `~/hafjet-chatterbox/soak_report.jsonl`
on RTX.

## Setup
- Enqueue: `POST /events/comment` × 10 (event_id soak-1..soak-10), Aina stub decide → 10 `speak` jobs.
- Consumer: `/tmp/soak_chatterbox.py` (claim Hermes queue → patched `speak_queue_consumer.run_once`
  → `synth_for_consumer` → Chatterbox → `/humanaudio` → ack). `skip_lock=True`
  (owner-managed LT session holds the live lock).
- Tunnel: Hermes→RTX `-J` ProxyJump `-R 127.0.0.1:18744:127.0.0.1:8740`.

## Aggregate (10/10)
| Metric | Value |
|---|---|
| status | 10 × `ok_spoke` |
| ack | 10 × `done` |
| /humanaudio | 10 × body `code:0` |
| source | 10 × chatterbox (0 Edge fallback) |
| RTF | min 0.549 · avg 0.652 · max 0.806 |
| VRAM | min 8498 · avg 8539 · max 8598 MB (below 11 GB stop) |
| GPU temp | min 46 · avg 48.8 · max 53°C (below 88°C stop) |
| wall/job | avg 7.04 s (job 1 = 23.8 s includes model load + warmup) |
| queue end | count 0, pending 0, in_flight 0 |

## Key observations
- First job after idle takes ~20–24 s wall (Chatterbox load + `Hai.` warmup);
  steady state is ~3–6 s/job. Do not use job 1's wall time for latency judgment.
- VRAM during sustained runs sits ~8.5 GB (model + LT session), well under the
  11 GB CB stop. GPU returns to ~4.4 GB idle after ~600 s idle unload.
- Queue ACK `done` is issued inside `run_once`; verify via telemetry
  `~/hafjet-live/logs/tts_wiring.jsonl` (stage speak/ok_spoke/humanaudio code).
- No anomalies in 10-job run: no CB stop, no Edge fallback, no queue leak,
  no double speak.

## Re-run
```
# enqueue
for i in {1..10}; do curl -s -X POST http://127.0.0.1:8740/events/comment \
  -H 'Content-Type: application/json' \
  -d "{\"platform\":\"tiktok\",\"event_id\":\"soak-$i\",\"user\":\"soakuser$i\",\"text\":\"Test soak job $i - Aina check dulu ya\"}"; done
# consume (RTX)
VAL_ORCH_URL=http://127.0.0.1:18744 SOAK_MAX_RUNS=12 ~/hafjet-chatterbox/venv-chatterbox/bin/python /tmp/soak_chatterbox.py
```
