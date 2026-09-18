# Chatterbox → `/humanaudio` production wiring (verified 2026-08-28)

Class: HAFJET AI Live Streamer TTS production path. Status: **patch applied + static-verified; live 3-speak validation pending separate approval.**

## Outcome chain (what was proven, in order)

1. **Offline smoke PASS** — RTX 4070, `~/hafjet-chatterbox/venv-chatterbox` (uv Python 3.11.15; RTX system Python 3.14 is outside Chatterbox `>=3.10,<3.14`).
2. **Watermark FIXED** — `resemble-perth==1.0.1` PyPI wheel leaves `PerthImplicitWatermarker=None` even with `onnxruntime==1.29.0` installed. Verified fix: `uv pip install --no-deps --force-reinstall "resemble-perth @ git+https://github.com/resemble-ai/Perth.git"`; verify `callable(perth.PerthImplicitWatermarker)`. DummyWatermarker shims are eval-only.
3. **Female Malay voice** — default voice is MALE. Voice-clone Edge-TTS `ms-MY-YasminNeural` 9.24s reference via `audio_prompt_path`; tuned lock **`exaggeration=0.5, cfg_weight=0.7`** (9.24s ref beat a 20.86s long ref in A/B listening).
4. **Coexistence PASS** — LiveTalking running (no restart): VRAM peak 8812 MiB / 12282, temp 65°C, RTF 0.50–0.62.
5. **Micro-lab `/humanaudio` PASS** — on Tuan's EXISTING WebRTC session (exactly 1 from `/api/admin/sessions`): one speak, HTTP 200 body `{"code":0,"msg":"ok"}`, `/is_speaking` true→false naturally, Tuan confirmed audio + lip movement. Load 28.3s + warmup "Hai." 4.0s; WAV 8.2s @ RTF 0.607; LIVE_GPU_LOCK created→released by the test itself; no fallback, no retry.
6. CosyVoice path is **superseded** (no official `ms` language; see cosyvoice reference).

## Files (RTX)

- `~/hafjet-chatterbox/hafjet_tts_adapter.py` — NEW. Chatterbox primary + Edge-TTS fallback. BM preprocessing (RM25→dua puluh lima ringgit, iPhone 15→lima belas) INSIDE the adapter. 120-char post-preprocess limit with sentence-boundary truncate. Lazy load, one-time "Hai." warmup, idle unload 600s. CB stop 88°C/11GB → unload + 120s cooldown, and the CB-triggering job gets NO Edge fallback (`no_fallback` flag). WAV validation (exists, >1KB, readable, 0.3–60s) before any POST.
- `~/hafjet-live/bin/livetalking_glue/speak_queue_consumer.py` — PATCHED (backup `speak_queue_consumer.py.bak.chatterbox-wiring`, marker `HAFJET_CHATTERBOX_WIRING_V1`):
  - `discover_session()` reads `/api/admin/sessions` per job: 0 → cancel `no_active_session`; >1 → cancel `ambiguous_sessions` (report prefixes only); 1 → use that UUID. Stale `LT_SESSIONID`/`LT_SESSIONID_STR` env removed. Never spawns `/offer` in production.
  - TTS block calls `synth_for_consumer(text, job_id)`; fail → `tts_fail` or `blocked_circuit_breaker`, job acked `cancelled`.
  - Exactly ONE `/humanaudio` POST per job; no auto-retry; body `code!=0` → `avatar_http_fail` + cancel.
  - Telemetry JSONL appended per speak: `~/hafjet-live/logs/tts_wiring.jsonl` (ts, job_id, status, source, rtf, duration_s, bytes, session_prefix, humanaudio body).
- `~/hafjet-chatterbox/preprocess_bm_tts.py` + warmup behavior reused unchanged.

## Contract notes (`/humanaudio`, from LiveTalking source `server/routes.py`)

- `POST /humanaudio`, multipart/form-data, fields exactly `sessionid` (text) + `file` (WAV bytes).
- Success is the JSON BODY `{"code":0,"msg":"ok"}` — HTTP 200 alone is not success.
- Unknown session → `{"code":-1,"msg":"session not found"}`; session lifetime = its WebRTC holder's lifetime (empirically confirmed: closing the aiortc holder removed the session from admin list).
- WAV decode via soundfile; first-channel only; auto-resample to avatar SR — plain 24kHz mono WAV is fine.
- Related endpoints: `POST /is_speaking {sessionid}` → `data: true/false`; `POST /interrupt_talk` exists but wiring never calls it; session discovery `GET /api/admin/sessions` → `data.sessions[]` with `sessionid, speaking, recording, model, avatar_id, transport`.

## Ownership rule

- Tuan-owned live session (Aina captured in Live Studio): use the existing UUID, never create sessions, never restart `app.py`.
- Private lab tests: launch LiveTalking only with explicit approval phrase, pid-file-scoped launcher/stopper scripts, verify port 8010 CLEAR after stop.

## Pending next gate

Separate approval for private bounded 3-speak validation (greeting / RM-price line exercising preprocessing / CTA), each verified for source, latency, RTF, VRAM, temp, and `/humanaudio` body `code:0`, with orchestrator paused (no auto-ingress) and no typed replies.