---
name: hafjet-ai-live-streamer
description: "Use when HAFJET AI live stream / LiveTalking / Aina host / multi-RTMP live commerce work."
version: 1.1.0
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
| Comment listeners ×4 (Playwright) | **PC Office** `100.121.94.41` | CPU browsers; isolate crashes from GPU |
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
| G1 plan | `~/docs/superpowers/plans/2026-08-15-hafjet-ai-live-streamer-g1.md` |
| **Code repo** | `~/projects/hafjet-ai-live-streamer` |
| Persona | `persona/aina_system.md` (in repo) |
| Catalog | `catalog/products.json` |
| Orchestrator | `orchestrator/api.py` + `db.py` |
| G1 venv | `~/projects/hafjet-ai-live-streamer/.venv` |

```bash
cd ~/projects/hafjet-ai-live-streamer && source .venv/bin/activate
pytest -q
uvicorn orchestrator.api:app --host 127.0.0.1 --port 8740
curl -s http://127.0.0.1:8740/health   # expect status ok, gate G1
```

G1 brain is a **deterministic stub** (catalog match + spam/pause rules) — **not** external LLM yet. LLM wiring = G3.

## Ship gates (use these phrases)

| Gate | Deliverable | Approval |
|------|-------------|----------|
| G0 | Design spec | Sections OK + file review |
| G1 | Repo + persona + catalog + orchestrator stub + tests | `approve G1` |
| G2 | Synthetic + TTS → virtual cam on RTX | `approve G2` |
| G3 | Agent/LLM + catalog golden offline | `approve G3` |
| G4 | 4 listeners on fixtures | `approve G4` |
| G5 | Private 1-platform short live | `approve G5` |
| G6 | Private multi-platform 15 min | `approve G6` |
| G7 | Public HAFJET live | `approve G7 public` |

**Status after 2026-08-15 session:** Spec written; **G1 implemented and verified** (17 pytest passed, `/health` ok). Await Tuan `approve G1` before G2. Do not start G2 on a mere scaffold complete without the phrase.

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

## Orchestrator API minimum (G1+)

`GET /health` · `GET /session` · `POST /session/{start,pause,resume,stop}` · `POST /events/comment` · `GET /queue`

Comment ingress JSON: `event_id, platform, user, text, ts?, live_id?`  
Decision JSON: `event_id, actions[{type: speak|typed_reply|ignore, ...}], is_paused_honored`

Rules: pause → ignore only; dedup `event_id`; never invent prices; promo_price_rm wins over price_rm when set.

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

## Related skills

- `hafjet-cctv-gpu-offload` — RTX access, CUDA, coexistence
- `hafjet-local-tts` / Malay TTS skills — non-live TTS; live prefers RTX-side low-latency
- `hafjet-command-safety` — approval boundaries
- `hafjet-worker-project-setup` — PC Office listener workers only
- `brainstorming` + `writing-plans` — design then plan
- `hafjet-sales-advisor-prompt` — WhatsApp tone; live persona is Aina (separate file)
