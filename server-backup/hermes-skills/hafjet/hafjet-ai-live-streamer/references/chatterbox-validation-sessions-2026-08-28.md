# Chatterbox wiring validation sessions (2026-08-28) — V1/V2 detail

Session-specific evidence and gotchas for the Chatterbox→`/humanaudio` production path. Parent: `references/chatterbox-production-wiring.md`.

## Run sequence that worked (V1, repeatable for V2/V3)

1. Preflight from Hermes: `ssh hafjet@100.119.32.87` → `GET /api/admin/sessions` → exactly 1 session, expected avatar; `ss -tln | grep 8010` up; `LIVE_GPU_LOCK` absent.
2. Orchestrator gate prerequisites:
   - Orchestrator on Hermes: `cd ~/projects/hafjet-ai-live-streamer && AINA_BRAIN_MODE=stub nohup .venv/bin/uvicorn orchestrator.api:app --host 127.0.0.1 --port 8740 > /tmp/orch_8740.log 2>&1 &` (use terminal background=true, not nested nohup via SSH). It does NOT auto-start — a gate run against a dead orchestrator cancels the job (`cancelled_postgen_pause`, telemetry `http:null`).
   - Reverse tunnel from Hermes: `ssh -o BatchMode=yes -f -N -R 127.0.0.1:18740:127.0.0.1:8740 hafjet@100.119.32.87` → verify from RTX `curl http://127.0.0.1:18740/health` = 200, `ss -tln` shows `127.0.0.1:18740` loopback only.
   - Validation session: `POST /session/start {"platforms":["tiktok"],"title":"private_chatterbox_v1_validation","read_only":false}` from Hermes localhost. `platforms` schema requires non-empty (allowed: shopee/tiktok/fb/ig); the label carries no listener. Verify `GET /session`: `active:true, is_paused:false, event_count:0, queue_pending:0`.
3. One job: `~/hafjet-chatterbox/venv-chatterbox/bin/python ~/hafjet-chatterbox/run_validation_job.py --job-id V1` (consumer `run_once` with `job_override`, `orch_url` default `http://127.0.0.1:18740`, lock lifecycle + postgen gate inside the patched consumer).
4. Poll `POST /is_speaking {sessionid}` until `data:false` naturally; verify GPU temp/VRAM back near baseline, `LIVE_GPU_LOCK` absent, telemetry last line `stage:speak status:ok_spoke`.

## Jobs and results

| Job | Text (raw) | Preprocess verified | Source | RTF | WAV | `/humanaudio` | Result |
|---|---|---|---|---|---|---|---|
| V1 | "Hai korang, selamat datang ke live HAFJET. Ada promo aksesori phone hari ini, jangan lepaskan peluang." | n/a (no numbers) | chatterbox | 0.577 | 844,880 B / 8.8s | HTTP 200 `code:0` | **PASS**, Tuan confirmed audio + lipsync |
| V2 | "Casing iPhone 15 Pro kat harga promo cuma RM25 tau, ada warna hitam dan biru ready stock." | exact: "iPhone lima belas" + "dua puluh lima ringgit" | chatterbox | 0.565 | 829,520 B / 8.64s | HTTP 200 `code:0` | **PASS**, Tuan confirmed clarity |
| V3 | "Korang yang nak order, tekan link kat bawah live ni. Stok terhad, jangan lambat!" | — | — | — | — | — | pending approval |

Load+warmup ~13.6–28.3s cold; VRAM peak ~8.7k MiB alongside LiveTalking; CB nominal throughout; lock always released in `finally`.

## Gotchas learned

- **`cancelled_postgen_pause` on first V1 was correct behavior** — dead orchestrator = fail-safe pause. Do not bypass with `VAL_SKIP_ORCH`; restore the orchestrator + tunnel instead.
- **`orch_session()` field check:** consumer gate reads `active` + `is_paused`; a started-but-empty validation session (`event_count:0`) satisfies it.
- **Job override ack 404:** injected jobs have no orchestrator queue row, so `orch_ack` returns HTTP 404 (`ack_error`). Expected for file-bridge style; do not "fix" by creating queue rows.
- **Avatar substitution:** sessions may show `avatar_id:sarah` instead of `Aina` (Tuan switched visual runtime due to lagging). Voice/persona stays Aina via Chatterbox. Substitution requires explicit Tuan confirmation per session; never auto-select among multiple sessions (rule: >1 → `ambiguous_sessions`, stop).
- **TTS intermediate artifacts** land in `~/hafjet-chatterbox/wired/speak_<jobid>.wav` (job-id-sanitized filename = idempotent overwrite on re-run).
- **Telemetry** at `~/hafjet-live/logs/tts_wiring.jsonl`: one line per speak (`ts, job_id, stage, status, source, rtf, duration_s, bytes, session_prefix, humanaudio body`) plus a `stage:postgen_gate` line on any gate cancel.

## Cleanup expectations (still open at session end)

- Orchestrator validation session `private_chatterbox_v1_validation` left ACTIVE per approval; must be explicitly stopped (`POST /session/stop`) at cleanup approval.
- SSH tunnel + uvicorn orchestrator are temporary processes; stop at cleanup approval.
- V3 pending separate approval.
