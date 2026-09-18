# Chatterbox Multilingual — Offline R&D (2026-08-25)

Status: Task 1 (research) + Task 2 (install plan) done; Task 3 smoke BLOCKED at checkpoint (needs RTX host + Tuan `approve cb smoke rtx`); Task 4 = LAYAK (conditional on smoke passing).

## Verified facts
- Official repo: `github.com/resemble-ai/chatterbox`; HF `ResembleAI/chatterbox`; PyPI `chatterbox-tts`.
- Malay (`ms`) is an official language in Multilingual (23 langs; v3 = 25). `language_id="ms"`.
- License MIT (code + weights). VRAM ~4–6 GB (0.5B Llama backbone) — fits RTX 4070 12GB alongside LiveTalking under lock policy.
- Real-time; streaming fork `chatterbox-streaming` RTF ~0.499, first chunk ~0.47s (4090).
- WAV out: `wav = model.generate(text, language_id="ms"); torchaudio.save("out.wav", wav, model.sr)`.
- Deps risk (medium): `torch/torchaudio/torchvision` CUDA wheel (~2.5–3 GB), `chatterbox-tts` pulls `resemble-perth` watermark (default ON; acceptable for trial).
- Python 3.11 officially developed/tested (`requires-python >=3.10`); create venv with `uv` like other HAFJET venvs.

## Safe install plan (NOT executed)
- Dedicated folder `~/hafjet-chatterbox/` + `.venv` — never touch `venv-livetalking` or cctv venv.
- Target host = **RTX WSL2** only (CUDA). Azure Hermes 1GB/disk-95% box CANNOT run this smoke — do not attempt install there (heavy-install rule).
- Smoke script staged: `scripts/cb_smoke.py` (3 short Malay WAVs + latency/VRAM/summary JSON). Run:
  `~/hafjet-chatterbox/.venv/bin/python scripts/cb_smoke.py` (needs torchaudio + chatterbox.mtl_tts in venv).

## Decision
- Chatterbox Multilingual = **LAYAK** as candidate to replace Edge-TTS Yasmin for a later `/humanaudio` trial — only after RTX smoke passes and Tuan approves the trial separately.
- Edge-TTS `ms-MY-YasminNeural` stays the live default until then.
- Do NOT wire `/humanaudio` during R&D. No LiveTalking restart. No public server.
