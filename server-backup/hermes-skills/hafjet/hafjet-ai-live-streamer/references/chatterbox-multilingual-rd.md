# Chatterbox Multilingual R&D (offline smoke, 2026-08-25)

Candidate TTS to replace Edge-TTS `ms-MY-YasminNeural` for Aina live. Offline R&D only — **never wire /humanaudio without a separate approval.**

## Verified research
- Official repo: `github.com/resemble-ai/chatterbox`; HF `ResembleAI/chatterbox`; PyPI `chatterbox-tts`.
- **Malay (`ms`) is officially listed** in Multilingual's 23 languages (V2) / 25 (V3: 21 + 4 dialects). `language_id="ms"` required.
- License **MIT** (code + weights; confirmed HF card + NVIDIA model card).
- Architecture 0.5B Llama backbone; real-time; streaming fork `chatterbox-streaming` RTF ~0.499, first chunk ~0.47s (4090).
- WAV output: `wav = model.generate(text, language_id="ms")` → `torchaudio.save(path, wav, model.sr)`.
- Install: Python 3.11 via `uv`; `torch` + `torchaudio` + `torchvision` CUDA wheels; `chatterbox-tts`.

## RTX smoke results (dedicated `~/hafjet-chatterbox/venv-chatterbox`, Python 3.11.15)
- Folder `~/hafjet-chatterbox/` (venv + wav + `smoke_test.py`); script is offline-only, never touches LiveTalking, runs preflight CB/lock checks, and has a `DummyWatermarker` fallback.
- Load: **41.3s** first run (HF fetch 6 files + weights); delta VRAM **+3,256 MB** (2,733 → 5,989 MB).
- Generate 3 short Malay lines: **RTF 0.802 / 0.525 / 0.486** (all < 1 → real-time); gen 4.65/2.98/2.84s; WAV ~0.54–0.56 MB each, 5.7–5.8s audio.
- VRAM peak **6,343 MB**; temp peak **57°C**; cleanup returns to ~3.15 GB idle.
- Auto-recommendation = `TIDAK_LAYAK` **only because `coexistence=N/A`** (LiveTalking :8010 was down during smoke). Not a model failure — the script requires LT-up to mark coexistence PASS.

## Watermarker gotcha (verified)
- `perth.PerthImplicitWatermarker` is `None` and **not callable even after `pip install onnxruntime` (CPU 1.29.0)** in the dedicated venv.
- Smoke script handles it: `from perth import DummyWatermarker; perth.PerthImplicitWatermarker = lambda **kw: DummyWatermarker()` → prints `WARNING: PerthImplicitWatermarker unavailable — using DummyWatermarker`.
- Consequence: offline smoke WAVs have **no watermark**. If content provenance matters, resolve Perth (proper onnxruntime/model placement) before production; do not treat the Dummy fallback as production-equal.

## Coexistence estimate (untested)
- Idle RTX ~2.7 GB + Chatterbox ~6.3 GB ≈ **~9 GB** — under the 11 GB CB stop, but a true coexistence test (LT :8010 up + generate while a LT WebRTC session is held + CCTV skip active) is REQUIRED before any /humanaudio trial. Needs Tuan approval.

## Decision gate (2026-08-25)
- Research + smoke → **LAYAK (conditional)** for a later /humanaudio trial. Blockers: (1) coexistence N/A — needs a real LT-up test; (2) watermarker None/Dummy fallback; (3) Tuan quality review of the 3 WAVs (`smoke-01/02/03.wav` on RTX).
- Compare vs Edge-TTS Yasmin: more natural Malay likely; local low-latency (RTF < 1); cost = ~6.3 GB VRAM + ~3 GB disk + dedicated venv; Edge-TTS stays the live default until an approved coexistence test passes.
