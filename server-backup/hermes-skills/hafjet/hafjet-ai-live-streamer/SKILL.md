---
name: hafjet-ai-live-streamer
description: "Use when HAFJET AI live stream / LiveTalking / Aina host / multi-RTMP live commerce work."
version: 1.4.0
author: HAFJET (M) SDN BHD
---

# HAFJET AI Live Streamer (Track 2 Self-Hosted)

Class-level skill for the **self-hosted AI live commerce host**: digital human avatar + orchestrator/agent ("Aina") + TTS + OBS multi-RTMP + browser comment listeners.

## Triggers

- "Live Stream AI", LiveTalking, digital human, AI live host, Aina live
- Shopee Live / TikTok Live / FB Live / IG Live automation
- Avatar hijab train, MuseTalk/Wav2Lip, multi-RTMP OBS
- Live sales persona / comment reply → speak pipeline
- Repo `hafjet-ai-live-streamer` or gates `approve G1`…`approve G7 public`

## Hard placement rules (do not violate) — Approach B hybrid

| Workload | Where | Why |
|----------|--------|-----|
| LiveTalking / TTS / real-time avatar | **RTX 4070 WSL2** `hafjet@100.119.32.87` | NVIDIA only |
| OBS multi-RTMP | **RTX Windows host** (native OBS, not WSL2) | Stable virtual-cam + RTMP |
| Orchestrator + Aina brain + catalog | **Azure Hermes** light code only | `127.0.0.1:8740`; no weights |
| Fixture/headless listener work | **PC Office** `100.121.94.41` | CPU browser plumbing; not suitable for HITL when headless |
| **G5b real TikTok HITL listener** | **Windows browser node** `100.73.190.96` | Headed GUI + Tuan manual login; profile must stay local to this node |
| Heavy install / train / VRAM | **Never** Azure Hermes-Server | 1GB RAM, disk often ≥95% |
| Avatar inference | **Never** PC Office alone | i3-2100, no NVIDIA |

**GPU coexistence:** On live start create `LIVE_GPU_LOCK` on RTX; CCTV YOLO batch (`hafjet-cctv-gpu-offload`) **must skip** and log `SKIP_LIVE_LOCK`. Reuse thermal/VRAM CB spirit (warn >80°C, stop >88°C).

## Product decisions locked (2026-08-15)

| Decision | Lock |
|----------|------|
| Approach | **B Hybrid split** (not monolith-on-RTX) |
| Ownership | Full self-host Track 2 (no HeyGen primary) |
| Platforms (arch day-1) | Shopee + TikTok + FB + IG via OBS multi-RTMP |
| Avatar v0.1 | **Synthetic first**; custom hijab train later |
| Catalog | **Static JSON/SQLite** curated pre-live (not Loyverse live) |
| Persona | **Aina** — BM casual HAFJET, short TTS lines, never admits AI |
| Comments v0.1 | **Auto AI reply all 4 platforms** (browser listeners) — high ToS risk accepted with rate-limit + kill switch |
| Control bind | Orchestrator `127.0.0.1:8740` only unless separate expose approval |

## Canonical paths (verified G1 2026-08-15)

| Artifact | Path |
|----------|------|
| Design spec | `~/docs/superpowers/specs/2026-08-15-hafjet-ai-live-streamer-design.md` |
| G1–G3 plans | `~/docs/superpowers/plans/2026-08-15-*-g1.md`, `*-g2.md`, `2026-08-17-*-g3.md` |
| G2 closed note | repo `docs/G2-CLOSED.md` |
| **Code repo** | `~/projects/hafjet-ai-live-streamer` |
| Persona | `persona/aina_system.md` |
| Catalog | `catalog/products.json` |
| Orchestrator | `orchestrator/api.py` + `db.py` + `queue.py` (G3) |
| Aina brain | `agent/aina_brain.py`, `price_guard.py`, `llm_client.py`, `catalog_tools.py` |
| Hermes venv | `~/projects/hafjet-ai-live-streamer/.venv` |

```bash
cd ~/projects/hafjet-ai-live-streamer && source .venv/bin/activate
export AINA_BRAIN_MODE=stub   # default CI / golden
pytest -q                     # expect 55+ after G4a (40 G1–G3 + listener tests)
uvicorn orchestrator.api:app --host 127.0.0.1 --port 8740
curl -s http://127.0.0.1:8740/health   # gate G3, brain_mode, llm_configured, queue_pending
```

**Brain modes:** `AINA_BRAIN_MODE=stub` (deterministic default) or `llm` (OpenAI-compatible via `AINA_LLM_*` env). **Price guard always on** — never disable.

**Closure notes:** repo `docs/G2-CLOSED.md`, `docs/G3-CLOSED.md`.

## Ship gates (use these phrases)

| Gate | Deliverable | Approval |
|------|-------------|----------|
| G0 | Design spec | Sections OK + file review |
| G1 | Repo + persona + catalog + orchestrator stub + tests | `approve G1` |
| G2 | Synthetic + TTS → virtual cam on RTX | `approve G2` |
| G3 | Agent/LLM + catalog golden offline | `approve G3` (core = Hermes T1–4) |
| Polish | RTX speak-queue e2e + G2 T7–9 leftovers | `approve polish` (Task 8 = diff only) · `OK Task 8 apply` · `approve polish done` |
| G4a | 4 listeners **fixtures** ≥90% CI | bare `approve G4` = **G4a only** |
| G4b | One platform Office live dry-run | `approve G4b shopee` (or tiktok/fb/ig) |
| G4c | Four platforms private soak | `approve G4c` |
| G5a | Lab private full path 10 min (injector/mock + real orch + real RTX) | bare `approve G5` = **G5a only** |
| G5b | Real TikTok.com private short | `approve G5b tiktok` (GUI+HITL+live URL required) |
| G5 done | Formal G5 close docs | `approve G5a done` / `approve G5 done` |
| G6 | Private multi-platform 15 min | `approve G6` |
| G7 | Public HAFJET live | `approve G7 public` |

**Status (2026-08-18 end — G5a lab):**
- **G0–G3 CORE CLOSED** · **POLISH CLOSED** (`approve polish done`) including G3 Task5 e2e + G2 T7–9.
- **G2 Task 8 CCTV `SKIP_LIVE_LOCK`:** **APPLIED + verified** on RTX `~/cctv-analysis/cctv_analyze.py` (backup `*.bak.polish-task8`).
- **G4a CLOSED** · **G4b TikTok CLOSED (mock)** — real TikTok.com still deferred (Office no DISPLAY).
- **G5a lab CLOSED (PASS)** — injector + file-bridge push + RTX worker · 600s+ · 15× `ok_spoke` · pause **0.009s** · session `LIVE_GPU_LOCK` · clean shutdown. See `references/g5a-lab-private-fullpath.md` + repo `docs/runbook-g5a-lab.md`.
- **G5b real TikTok.com / G4c / G6 multi-RTMP / G7 public:** not started — need separate approve. G5b Stage 1 HITL target is Windows browser node `100.73.190.96`; require headed GUI + local-only profile + a working approved management/browser path before attach.
- Do not start a gate or heavy subtask without matching phrase / `OK Task N` / `approve G#`.

## Design / approval gate (mandatory)

Pairs with `brainstorming` + `writing-plans` + HAFJET audit→approve→deploy.

1. No LiveTalking clone/CUDA train/public live without matching `approve G#`.
2. G1 scaffold may proceed only after design sections approved (done 2026-08-15).
3. Never paste stream keys / platform cookies into Telegram or git.
4. HITL: `/live_pause` `/live_resume` `/live_stop` `/say` `/status` — owner chat only (pattern `1485374469`).

## Target architecture (Approach B)

```
PC Office: 4× browser listeners ──comment──► Hermes orchestrator :8740
                                              │ Aina decide (G3+ LLM)
                    typed_reply ◄─────────────┤
RTX WSL2: TTS + LiveTalking ◄── speak queue ──┘
        virtual cam → Windows OBS multi-RTMP → 4 platforms
Telegram HITL → pause/stop/say
LIVE_GPU_LOCK → CCTV YOLO skip
```

Details: `references/track2-blueprint-and-locks.md`  
Persona: `references/aina-live-sales-persona.md` + repo `persona/aina_system.md`  
Repo tree: `references/repo-structure.md` + **`references/canonical-repo-and-locks-g1.md`** (authoritative post-G1)  
G1 verification notes: `references/g1-orchestrator-stub.md`  
G2 RTX Task3–4 bootstrap: **`references/g2-rtx-bootstrap-task3-4.md`** (SSH jump, venv cu128, gdown, smoke)  
G2 Task5 speak/WebRTC: **`references/g2-task5-webrtc-speak-capture.md`**  
G2 Task6 OBS: **`references/g2-task6-obs-preview.md`**  
G3 brain/queue/guard: **`references/g3-hermes-brain-and-queue.md`**  
G4a listeners fixtures: **`references/g4a-listeners-fixtures.md`**  
G4b TikTok Office dry-run: **`references/g4b-tiktok-office-dryrun.md`** (tunnel, headless block, mock live)  
Polish speak-queue e2e: **`references/polish-speak-queue-e2e.md`** (file bridge, WebRTC session hold, humanaudio)  
G5a lab 10 min: **`references/g5a-lab-private-fullpath.md`** (injector, push jobs, session lock, kill switch)  
G5b Windows HITL node: **`references/g5b-windows-hitl-node.md`** (Stage 0 management/browser proof; local-only profile)

## Orchestrator API (G3+)

`GET /health` · `GET /session` · `POST /session/{start,pause,resume,stop}` · `POST /events/comment`  
`GET /queue` · `POST /queue/claim` · `POST /queue/ack` `{id, status: done|cancelled}`

Comment ingress: `event_id, platform, user, text, ts?, live_id?`  
Decision: `event_id, actions[{type: speak|typed_reply|ignore, ...}], is_paused_honored`

Rules:
- pause → **no LLM**, ignore only, **cancel pending+in_flight** queue; decision path ≤2s
- `speak` actions → enqueue TTS text jobs
- dedup `event_id`; never invent prices; `promo_price_rm` wins when set
- **price_guard** strips any `RM` amount not in active catalog prices before return/enqueue

## Safety & compliance

- Catalog is sole price source of truth.
- Comment UI scrape = fragile + ToS risk — per-platform health, backoff, no retry storm, kill switch.
- Do not touch Frigate/CCTV live detect path.
- Stop speak on OBS/RTMP down by default; typed_reply only if chat still up and not paused.

## Agent workflow checklist

1. Load this skill + `hafjet-command-safety` (+ `hafjet-cctv-gpu-offload` if RTX).
2. Read current gate from repo README / plan checkboxes — do not re-scaffold G1 if already green.
3. Next incomplete gate only; stop for approval phrase between gates.
4. Long artifacts → file + `MEDIA:`; short TG summary.
5. After G2 first green: patch this skill with measured VRAM/latency + virtual-cam bridge chosen.

## Hermes → RTX access (verified 2026-08-17)

Hermes has **no** `id_ed25519_office2rtx`. Direct `ssh hafjet@100.119.32.87` → `Permission denied (publickey)` even when Tailscale online.

**Working jump (always use unless Hermes key installed later):**

```bash
ssh -o BatchMode=yes hafizi145@100.121.94.41 \
  'ssh -i ~/.ssh/id_ed25519_office2rtx -o BatchMode=yes hafjet@100.119.32.87 '"'"'CMD'"'"
```

- Office: `hafizi145@100.121.94.41` + `~/.ssh/id_ed25519_office2rtx`
- RTX user: **`hafjet`** on `desktop-rhdusf3-1` / `100.119.32.87`
- Offline Tailscale node → BLOCKED (power WSL + `sudo service ssh start`); do not retarget G2 to PC Office

## G2 RTX layout + LiveTalking (Task3–4 done)

```
~/hafjet-live/
  LiveTalking/              # lipku clone
  venv-livetalking/         # uv Python 3.12 — NEVER cctv-analysis/.venv
  bin/livetalking_glue/     # gpu_lock, circuit_breaker, speak_local_demo, health_avatar
  models_dl/gdrive/         # gdown cache
  wav/ logs/ synthetic/
  LIVE_GPU_LOCK
```

| Piece | Verified value |
|-------|----------------|
| Venv | `uv venv --python 3.12 ~/hafjet-live/venv-livetalking` |
| Torch | `2.9.1+cu128` + matching torchvision/torchaudio |
| Weights | `models/wav2lip.pth` from `wav2lip256.pth`; avatar `data/avatars/wav2lip256_avatar1` |
| gdown | `python -m gdown --folder <README Drive URL> -O models_dl/gdrive` (no `--remaining-ok` on gdown 6.x) |
| Smoke | `timeout 45s python app.py --transport webrtc --model wav2lip --avatar_id wav2lip256_avatar1 --listenport 8010` → load ckpt, warmup, http server; RC 124 OK |
| CB | temp warn≥80 stop≥88; VRAM warn≥8192 stop≥10752 MiB |
| CCTV | Prove `.venv` mtime unchanged after LiveTalking work |

Detail: `references/g2-rtx-bootstrap-task3-4.md`

## Execution preference (Tuan)

- **`approve G2` alone** still allows Tuan to narrow: “Task 3 only”, “jangan Task 4”.
- After each heavy task: **stop + scannable table report**; wait for `OK Task N` / next phrase.
- Prefer short tables over long prose on Telegram.

## Pitfalls

1. **Wrong host** for LiveTalking (Azure/PC Office) — always RTX WSL2 `hafjet`.
2. **Arch multi-platform ≠ skip private gates** — still G5 then G6 before G7.
3. **Monolith temptation** — 4 Chromium + LiveTalking on 11GB WSL2 fights CCTV; stay hybrid B.
4. **GPU fight** — without `LIVE_GPU_LOCK`, YOLO batch mid-live OOMs avatar.
5. **Catalog drift** — static JSON; pre-live edit + session start reload snapshot.
6. **G1 stub ≠ production brain** — do not claim LLM Aina until G3.
7. **WSL2 sshd / nvidia-smi PATH** — see `hafjet-cctv-gpu-offload`.
8. **Secrets in chat/git** — keys stay in OBS/local profiles only.
9. **Persona paste corruption** — clean Aina prompt lives in repo; strip garbage tokens if user paste glitches.
10. **Brainstorming hard-gate** — still design-approve before new subsystems even if blueprint was pasted once.
11. **Hermes direct SSH to RTX** — publickey fail; use Office jump.
12. **Reuse CCTV venv for LiveTalking** — forbidden; dedicated `venv-livetalking` only.
13. **Auto-chain install tasks** — Tuan gates Task3/Task4/Task5 separately.
14. **WebRTC smoke ≠ OBS preview** — Task4 http:8010 does not complete virtualcam/OBS G2 exit.
15. **System python 3.14 on RTX** — no torch; always dedicated 3.12 venv.
16. **LiveTalking `/record` at session start** — ffmpeg `video_size 0x0` → BrokenPipeError in `process_frames`. Do **not** use early `/record` for evidence; use client WebRTC frame capture (`speak_capture_mp4.py`).
17. **Virtual cam on bare WSL** — no `/dev/video*`; pyvirtualcam not viable until Windows OBS Virtual Camera bridge. Prefer WebRTC browser on Windows host or MP4 capture.
18. **MP4 enough-frames threshold** — at 25fps require `frames >= min_s * 25` **and** wall clock `>= min_s`. Using `* 15` stops ~20s early.
19. **Detach LiveTalking server** — Hermes blocks remote `nohup` in foreground SSH; use Python `Popen(start_new_session=True)` launcher on RTX (see Task5 ref).
20. **TTS voice for live PoC** — `ms-MY-YasminNeural` via edge-tts in `venv-livetalking` (already in LiveTalking requirements).
21. **OBS formal preview without virtual cam** — Scene collection `HAFJET-Aina-Preview`, Media Source of Task5 MP4 under `Videos\HAFJET-Live\`; launch `obs64.exe --collection HAFJET-Aina-Preview --scene "Aina Preview" --startrecording`. Windows `powershell.exe` full path from WSL: `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`.
22. **G2 close hygiene** — On formal `approve G2` / core closed: stop `app.py --transport webrtc`, `gpu_lock.py release`, confirm HTTP :8010 down and VRAM drops (~770 MiB idle).
23. **G3 price_guard is non-negotiable** — even if LLM struggles, never set a flag to bypass guard; fix prompt/tests instead.
24. **G3 Hermes-first** — Tasks 1–4 (brain+queue+golden) before RTX `speak_queue_consumer`; report and wait before Task 5.
25. **test fixtures must rebind queue** — when patching `store` in pytest, also rebind `api.speak_queue` + `orchestrator.queue.speak_queue` or tests share global queue state.
26. **`approve G4` ≠ live Office** — bare approve is **G4a fixtures only**. Live needs `approve G4b <platform>` after manual login profiles on Office.
27. **Listener fixture contract** — synthetic HTML uses `.hfj-comment` + `data-id`/`data-user`; live G4b must normalize real DOM into the same parse path or update parsers with dual mode.
28. **G4 listeners never on Azure Hermes** — Playwright/Chromium on 1GB box is forbidden; Office only (`requirements-listeners.txt`).
29. **Gate workflow for multi-day builds** — brainstorm/design → `writing-plans` plan file → Tuan `approve Gn` → execute only approved sub-gate → scannable report → stop. Do not auto-chain next gate.
30. **M2U/E-PAY expenses (side track)** — JomPAY biller 2360 → vendor `6c8e862b…`, category `utilities`, idempotent `receipt_number` (M2U Ref ID); not part of live-streamer gates.
31. **Office → Hermes orch reachability** — Office often **cannot** `ssh` Hermes (no pubkey). Prefer **reverse tunnel from Hermes**: `ssh -f -N -R 8740:127.0.0.1:8740 hafizi145@100.121.94.41` then Office uses `ORCH_BASE_URL=http://127.0.0.1:8740`. Do not open orch on `0.0.0.0` without explicit approve.
32. **PC Office is often headless** — no `/tmp/.X11-unix`, empty `DISPLAY`. Real platform **HITL login + headed Playwright will fail**. Prove G4b plumbing first with **private localhost mock live** (`scripts/g4b_mock_live_server.py` + `LISTENER_HEADLESS=1`). Real TikTok.com needs GUI session (`DISPLAY=:0` or Windows host) — report BLOCKED honestly; do not fake TikTok.com pass.
33. **G4b one-platform only** — `ENABLED_PLATFORMS` / runner must be single platform (e.g. tiktok). Never auto-start Shopee/FB/IG under a tiktok-only approve.
34. **G4b evidence bar** — ≥10 comments **POST** to orchestrator + optional 1–2 typed_reply with `LISTENER_SLEEP=1` (real 1.5–4s delay). Log JSONL under Office `~/hafjet-live-listeners/logs/`. Profiles stay on Office — never scp cookies to Hermes/Telegram.
35. **Sync code to Office** — `rsync` repo (exclude `.venv`) to `hafizi145@100.121.94.41:~/projects/hafjet-ai-live-streamer/`; Office listener venv is separate: `~/hafjet-live-listeners/.venv` + `playwright install chromium`.
36. **Telegram gate reports** — after each Task/sub-gate: short tables (PASS/BLOCKED/deferred), copy-paste commands, hard STOP line. Prefer scannable bullets over long prose.
37. **Hermes→RTX speak queue path** — Office usually cannot SSH Hermes. Prefer **file bridge**: Hermes enqueue+claim → job JSON → scp Office→RTX → `speak_queue_consumer.py --job-json ...`.
38. **LiveTalking `/humanaudio` needs a live WebRTC session** — hold `RTCPeerConnection` open across TTS+upload. Body `code:-1` session not found = **fail**; only `code:0` is success (HTTP 200 alone is not enough).
39. **Consumer lock hygiene** — always release lock in `finally`. After e2e: stop LT, confirm `:8010` down, `LOCK_HELD=0`.
40. **Task 8 CCTV patch is diff-first** — never silent-edit `~/cctv-analysis/cctv_analyze.py`. Show diff → wait `OK Task 8 apply` → apply + prove `SKIP_LIVE_LOCK`. **Status:** applied 2026-08-18 (early `main()` gate before YOLO import; backup `cctv_analyze.py.bak.polish-task8`).
41. **No LiveTalking reinstall during polish** — reuse `venv-livetalking` + existing weights.
42. **Background LT/orch from Hermes** — `terminal(background=true)` for long-lived `ssh ... python app.py`; do not nest `nohup` in foreground SSH.
43. **`approve polish` order** — A1 unit → A2 path → B1 idle CB → A3 e2e → B1 mid → C diff STOP → D matrix.
44. **`approve G5` = G5a lab only** — not real TikTok.com. G5b needs `approve G5b tiktok` + **Windows HITL browser node `100.73.190.96`** with a headed GUI + local-only profile + Tuan manual login + `TIKTOK_LIVE_URL`; PC Office is headless and remains for fixture/headless plumbing only.
45. **G5a stable ingress = HTTP injector** — more reliable than Office Playwright mock for 10 min soak. Still full path: comment → brain → queue → RTX avatar. Platform field **tiktok only**.
46. **G5a job delivery** — conductor must not claim+ack without a working push. Prefer dedicated `scripts/g5a_push_jobs.py` (claim → archive → scp Office → RTX `/tmp/hafjet_g5a_jobs/`). Fragile multi-hop rsync loops lose jobs silently.
47. **G5a session-level lock** — acquire `LIVE_GPU_LOCK` for whole LT-up window (worker start); consumer uses `--skip-lock` / `hold_session_lock`; release only on session cleanup so CCTV SKIP stays true mid-live.
48. **G5a kill switch measure** — `POST /session/pause` then probe comment; assert `is_paused` and no new speak enqueue; target **&lt;5s** (lab measured ~0.01s). Resume optional; always clean stop LT+lock+orch after matrix.
49. **G5a worker holds WebRTC** — `g5a_rtx_worker.py` opens offer once and keeps PC alive while draining job dir; do not open/close peer per speak.
50. **Telegram file delivery for plans** — non-media: copy to `~/.hermes/cache/documents/*.txt` + `MEDIA:` + chat ≤3 lines (`telegram-file-delivery` skill). User renames `.txt`→`.md`.
51. **G5b Stage 0 is a real gate, not a formality** — after `approve G5b tiktok`, do only preflight: check Hermes `:8740`; create a zero-event TikTok-only session and measure `/session/pause` then `/session/stop`; prove the **Windows HITL node `100.73.190.96`** is reachable through an approved management/browser path and that its headed GUI/browser is usable; confirm its profile stays local without opening/exporting cookies; prove node→Hermes delivery and fresh RTX CB/lock state. Write a preflight table and wait for explicit `G5b preflight OK` before opening TikTok.com or asking Tuan to HITL-login. Node online on Tailscale is not enough: SSH refusal means GUI/browser remain unverified and Stage 1 is blocked.

## Speak-queue consumer (polish / G3 Task5)

| Piece | Path |
|-------|------|
| Consumer | `avatar/livetalking_glue/speak_queue_consumer.py` (+ RTX `~/hafjet-live/bin/livetalking_glue/`) |
| Enqueue helper | `scripts/polish_e2e_enqueue.py` |
| Unit tests | `tests/test_speak_queue_consumer_unit.py` |
| Runbooks | `docs/runbook-polish-speak-e2e.md`, `docs/runbook-g2-task8-cctv-diff.md` |
| Detail | `references/polish-speak-queue-e2e.md` |

```bash
# RTX after job JSON + LT up + WebRTC session held:
export LT_SESSIONID_STR="<sessionid-from-offer>"
~/hafjet-live/venv-livetalking/bin/python \
  ~/hafjet-live/bin/livetalking_glue/speak_queue_consumer.py \
  --require-livetalking --job-json "$(cat /tmp/polish_job.json)"
# expect status ok_spoke; humanaudio body code 0
```

## Listeners (G4a+)

| Piece | Path / note |
|-------|-------------|
| Adapters | `listeners/{shopee,tiktok,fb,ig}.py` + `adapter_base.py` |
| Runner | `listeners/runner.py` — isolation, restart backoff |
| Fixtures | `listeners/fixtures/<platform>/comments.html` + `expected_comments.json` |
| Safety | `base.py` delay 1.5–4s, rate 6/min, dedup 60s; pause skips typed_reply |
| Live flag | `LISTENER_LIVE=1` required; else `LiveNotEnabled` |
| Profiles | gitignored `listeners/profiles/`, `*.storage_state.json` |

```bash
# G4a CI
cd ~/projects/hafjet-ai-live-streamer
AINA_BRAIN_MODE=stub LISTENER_SLEEP=0 .venv/bin/pytest -q
# expect 55+ after G4a
```

## G4b TikTok dry-run (Office)

| Piece | Path / note |
|-------|-------------|
| Live adapter | `listeners/tiktok.py` — Playwright persistent profile; `LISTENER_LIVE=1` |
| Dry-run runner | `scripts/g4b_tiktok_dryrun.py` (tiktok-only loop, min 10 posts) |
| Private mock live | `scripts/g4b_mock_live_server.py` → `http://127.0.0.1:8765/` (not public) |
| Office layout | `~/hafjet-live-listeners/{.venv,profiles/tiktok,logs}` |
| Profile | `TIKTOK_PROFILE_DIR=~/hafjet-live-listeners/profiles/tiktok` (gitignored) |
| Runbook | repo `docs/runbook-g4b-tiktok.md` + skill `references/g4b-tiktok-office-dryrun.md` |

```bash
# Hermes: start orch + reverse tunnel (see ref)
# Office mock plumbing:
export LISTENER_LIVE=1 LISTENER_SLEEP=1 LISTENER_HEADLESS=1
export TIKTOK_LIVE_URL=http://127.0.0.1:8765/
export ORCH_BASE_URL=http://127.0.0.1:8740
export TIKTOK_PROFILE_DIR=$HOME/hafjet-live-listeners/profiles/tiktok
~/hafjet-live-listeners/.venv/bin/python \
  ~/projects/hafjet-ai-live-streamer/scripts/g4b_tiktok_dryrun.py
```

Real TikTok.com: only when Office has GUI + Tuan HITL login + `TIKTOK_LIVE_URL=https://www.tiktok.com/@…/live`. Stop on captcha/ban/selector collapse.

## Related skills

- `hafjet-cctv-gpu-offload` — RTX access, CUDA, coexistence
- `hafjet-local-tts` / Malay TTS skills — non-live TTS; live prefers RTX-side low-latency
- `hafjet-command-safety` — approval boundaries
- `hafjet-worker-project-setup` — PC Office listener workers only
- `brainstorming` + `writing-plans` — design then plan
- `hafjet-sales-advisor-prompt` — WhatsApp tone; live persona is Aina (separate file)
