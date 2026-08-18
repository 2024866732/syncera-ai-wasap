# G5a — Lab private full path (TikTok-only)

**Closed:** 2026-08-18 · Tuan `approve G5` (G5a only) · matrix PASS  
**Not included:** G5b real TikTok.com · G4c · multi-RTMP · public

## Goal
Private/short one-platform lab: comment → Aina brain → speak queue → RTX LiveTalking, stable **≥10 min**, kill switch **&lt;5s**, session-level `LIVE_GPU_LOCK`, no public/RTMP.

## Why injector (not browser)
- PC Office often **headless** (no DISPLAY) — headed TikTok login blocked (G4b Track B).
- HTTP injector on Hermes is the most stable 10 min soak while still exercising full brain+queue+avatar.
- Real TikTok.com = separate **`approve G5b tiktok`**.

## Stack

| Role | Component |
|------|-----------|
| Orch | Hermes `uvicorn orchestrator.api:app --host 127.0.0.1:8740` · `AINA_BRAIN_MODE=stub` · session platforms=`["tiktok"]` |
| Ingress | `scripts/g5a_lab_conductor.py` or inject-only loop · `POST /events/comment` every ~40s |
| Job bridge | `scripts/g5a_push_jobs.py` — claim → `logs/g5a/jobs/` → scp Office → RTX `/tmp/hafjet_g5a_jobs/` |
| Avatar | RTX LT webrtc `:8010` + `scripts/g5a_rtx_worker.py` (session lock + held WebRTC + `run_once(skip_lock=True)`) |
| Consumer | `avatar/livetalking_glue/speak_queue_consumer.py` — deploy RTX bin; `LT_SESSIONID_STR` set by worker |

## Run order
1. Start orch (Hermes background).
2. Deploy latest consumer + `g5a_rtx_worker.py` via Office jump.
3. Start LT on RTX (Hermes `terminal(background=true)` SSH — no nested nohup).
4. Start RTX worker `--duration-s 620` (acquires lock, opens WebRTC).
5. Start `g5a_push_jobs.py` + inject loop `--duration-s 600` with killswitch ~90s.
6. After ≥600s: stop inject → stop LT/worker → `gpu_lock.py release` → stop orch.
7. Fill matrix in repo `docs/runbook-g5a-lab.md`.

## Verified results (2026-08-18)
| Metric | Value |
|--------|--------|
| Inject wall | **600.7s** |
| RTX worker | **621.4s** |
| ok_spoke | **15** · errors **0** |
| pause_latency_s | **0.0094** (pass &lt;5s) |
| Lock after | **LOCK_HELD=0** · LT down |
| Prices | catalog only (e.g. RM29.90 / 79 / 169 / 35) |

## Evidence
- Hermes: `~/projects/hafjet-ai-live-streamer/logs/g5a/inject_only.jsonl`, `last_summary.json`, `jobs/`
- RTX: `~/hafjet-live/logs/g5a_rtx.jsonl`
- Repo runbook: `docs/runbook-g5a-lab.md`
- Plan: `~/docs/superpowers/plans/2026-08-18-hafjet-ai-live-streamer-g5.md`

## Pitfalls
1. If conductor **claims+acks** without successful push, jobs vanish — split inject vs push.
2. `/humanaudio` needs **held** WebRTC sessionid; HTTP 200 + `code:-1` = fail.
3. Do not release lock per-speak during G5a — session-level hold while LT up.
4. Never mark G5b pass from injector/mock alone.
5. One platform only under `approve G5` / G5a.
