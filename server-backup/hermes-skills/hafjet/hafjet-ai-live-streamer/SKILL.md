---
name: hafjet-ai-live-streamer
description: "Use when HAFJET AI live stream / LiveTalking host work."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET AI Live Streamer (Track 2 Self-Hosted)

Class-level skill for the **self-hosted AI live commerce host**: digital human avatar + Hermes/LangGraph sales agent ("Aina") + TTS + OBS multi-output to marketplace lives.

## Triggers

- "Live Stream AI", LiveTalking, digital human, AI live host
- Shopee Live / TikTok Live / FB Live / IG Live automation
- Avatar hijab train, MuseTalk/Wav2Lip, multi-RTMP OBS
- Live sales persona / comment reply → speak pipeline
- Blueprint or repo `hafjet-ai-livestream`

## Hard placement rules (do not violate)

| Workload | Where | Why |
|----------|--------|-----|
| LiveTalking / MuseTalk / real-time avatar | **RTX 4070 WSL2 only** `hafjet@100.119.32.87` (`desktop-rhdusf3-1`) | Needs NVIDIA GPU; MuseTalk class needs ~3080Ti+ |
| Agent orchestration, catalog, n8n hooks | Hermes / existing n8n (`n8n.hafjet.my`) | Light CPU OK |
| Heavy install / train / VRAM | **Never** Azure Hermes-Server | 1GB RAM, disk often ≥95% |
| Heavy avatar inference | **Never** PC Office alone | i3-2100, **no NVIDIA** (CPU-only) |
| Malay TTS experiments (non-live) | PC Office possible (see `hafjet-local-tts`) | Live path prefers low-latency TTS colocated with LiveTalking on RTX |

**GPU coexistence:** RTX already runs CCTV YOLO offload hourly (`hafjet-cctv-gpu-offload`). Live sessions must schedule around batch windows or pause YOLO for the live window — never assume exclusive VRAM. Respect circuit-breaker thresholds from that skill.

## Product decisions locked (2026-08-15 design session)

Update this section when Tuan changes direction.

| Decision | Lock |
|----------|------|
| Ownership model | Full self-host, no vendor lock-in (Track 2) |
| Platforms (architecture day-1) | Shopee + TikTok + Facebook + Instagram via OBS multi-RTMP |
| Avatar v0.1 | **Synthetic face first** (fast PoC); custom hijab train later |
| Product knowledge | **Static JSON/SQLite curated** — manual refresh pre-live (not live Loyverse) |
| Persona | **Aina** — santai uni-girl Manglish (BM+EN), honest soft-sell |
| Comment interaction v0.1 | **Still open** as of 2026-08-15 (timeout) — ask before building listeners |

## Design / approval gate (mandatory)

Follow HAFJET audit→gap→present→approve→deploy. This skill pairs with `brainstorming` + `writing-plans`.

1. **Do not scaffold, clone LiveTalking, train avatar, or install CUDA stacks** until design/spec approved and a numbered execution plan is approved.
2. Spec path convention: `docs/superpowers/specs/YYYY-MM-DD-hafjet-ai-live-streamer-design.md` (or Tuan-preferred docs root).
3. Plan path: `docs/superpowers/plans/YYYY-MM-DD-hafjet-ai-live-streamer.md`.
4. Separate approvals for: repo scaffold, RTX install, avatar train, public live, any systemd/cron, any browser scrape of marketplace UIs.
5. Never paste stream keys / platform secrets into Telegram; use `.env.example` + Tuan fills secrets offline.

## Target architecture (reference)

```
Product catalog (JSON/SQLite) ←→ Knowledge base
        ↓
Hermes Live Sales Agent (LangGraph) — persona Aina
  script gen + (optional) comment reply
        ↓
TTS (CosyVoice2 / GPT-SoVITS local preferred; Edge-TTS fallback)
        ↓
LiveTalking digital human (lipku/LiveTalking; MuseTalk/Wav2Lip)
        ↓
Virtual camera / WebRTC → OBS (scenes, overlays, multi-RTMP)
        ↓
Shopee Live | TikTok Live | FB Live | IG Live
```

Comment path (when approved): Listener → filter → agent → short reply → TTS → LiveTalking interrupt → OBS.

Full blueprint notes: `references/track2-blueprint-and-locks.md`  
Persona prompt: `references/aina-live-sales-persona.md`  
Repo skeleton: `references/repo-structure.md`

## Recommended phased delivery (even if multi-platform is the architecture target)

Architecture can be multi-platform day-1 (OBS scenes + 4 RTMP slots). **Runtime maturity still phases:**

| Phase | Deliverable | Gate |
|-------|-------------|------|
| P0 | Design spec + plan approved | Tuan review |
| P1 | Repo scaffold + Aina prompt + sample `products.json` on gateway or git | No GPU install yet |
| P2 | LiveTalking + synthetic avatar offline on RTX; text→TTS→talk→preview | CUDA smoke, VRAM log |
| P3 | OBS scenes + multi-RTMP **keys present**, private/test stream | No public commerce yet |
| P4 | Comment path (per locked choice) + short private live 1 platform | HITL if auto-reply |
| P5 | Public multi-platform + n8n schedule/report | Explicit "go public" approval |

Do **not** jump to browser auto-reply on 4 platforms before P2–P3 are green. Multi-platform **push** ≠ multi-platform **comment automation**.

## Tech stack defaults

| Layer | Default | Notes |
|-------|---------|--------|
| Digital human | [lipku/LiveTalking](https://github.com/lipku/LiveTalking) | Real-time; virtual cam + RTMP |
| Avatar train later | Custom hijab 1–3 min video + photos | Soft hijab colors; clear face/audio |
| Orchestration | Hermes / LangGraph | Extend; don't fork Hermes core lightly |
| TTS | CosyVoice2 or GPT-SoVITS on RTX; Edge-TTS fallback | Clone Malay female when assets exist |
| Streaming | OBS + obs-websocket + multi-output | One machine → 4 platforms |
| Comments | TBD — Playwright/API only after explicit lock | ToS + ban risk high |
| Automation | Existing n8n | Schedule live, post-stream report |
| Catalog | `agent/knowledge/products.json` + FAQs | Pre-live curator script |

LiveTalking install hint (RTX): Python 3.10 env; match PyTorch to `nvidia-smi` CUDA (WSL path often `/usr/lib/wsl/lib/nvidia-smi`). Prefer documented conda/pytorch pins from upstream README over guessing.

## Safety & compliance

- No false specs, fake reviews, or invented stock/prices — catalog is source of truth.
- No politics/religion/sensitive topics in persona.
- Watermark/attribution: LiveTalking license may require project credit on published videos — check upstream before public lives.
- Comment scraping may violate platform ToS — treat as high-risk; prefer official APIs when available; require explicit approval per platform.
- Do not disrupt CCTV production path on PC Office or Frigate while setting up live stack.
- RTX thermal/VRAM: reuse CCTV GPU circuit-breaker spirit (warn/stop on high temp/VRAM); no silent infinite retry on OOM.

## Agent workflow checklist

1. Load this skill + `hafjet-command-safety` (+ `hafjet-cctv-gpu-offload` if touching RTX schedule).
2. Confirm open locks (especially **comment mode**) with Tuan if not in memory/skill.
3. Design/spec first if behavior or architecture changes.
4. Propose numbered commands for RTX work; no silent SSH install.
5. Keep Azure disk/RAM out of the heavy path; deliver long artifacts as files (`MEDIA:`) not walls of Telegram text.
6. After first successful offline pipeline, offer skill patch with measured VRAM/latency.

## Pitfalls

1. **Wrong host:** Installing LiveTalking on Azure or PC Office wastes hours and will fail real-time — always RTX WSL2 user `hafjet`.
2. **Multi-platform day-1 ≠ auto-comment day-1:** OBS can fan-out video early; comment bots are a separate risk class.
3. **GPU fight with CCTV YOLO:** Hourly offload can spike VRAM mid-live — coordinate schedule.
4. **Catalog drift:** Static JSON means wrong price on stream if not refreshed pre-live — add a preflight checklist script later.
5. **Synthetic→custom swap:** Keep avatar id/path configurable (`hafjet_hijab` vs `synthetic_poc`) so train later doesn't rewrite the whole pipeline.
6. **WSL2 quirks:** sshd may be down after Windows reboot; `nvidia-smi` not always on PATH — see `hafjet-cctv-gpu-offload`.
7. **Secrets in chat:** Stream keys, Shopee/TikTok tokens never in Telegram replies.
8. **Brainstorming hard-gate:** Creative build still needs design approval before scaffold when starting greenfield — don't skip because blueprint was pasted once.

## Related skills

- `hafjet-cctv-gpu-offload` — RTX node access, CUDA checks, coexistence
- `hafjet-local-tts` / `hafjet-malaysian-tts` / `hafjet-tts-deploy` — TTS options (live prefers RTX-side)
- `hafjet-command-safety` — banned command patterns, approval boundaries
- `hafjet-worker-project-setup` — only if a **CPU** side-car lands on PC Office (not LiveTalking core)
- `brainstorming` + `writing-plans` — design then plan before code
- `hafjet-sales-advisor-prompt` — WhatsApp sales tone; live persona is separate (Aina) but brand consistency matters
