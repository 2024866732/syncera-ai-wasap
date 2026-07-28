---
name: hafjet-malaysian-tts
description: "Evaluate and deploy natural Malay TTS on the HAFJET PC Office worker, including commercial-safe VoxCPM2 and legacy Mesolitica experiments. Covers CPU feasibility, licensing, voice QA, and WhatsApp/media integration boundaries."
version: 1.0.0
author: HAFJET (M) SDN BHD
tags: [tts, malay, huggingface, distilcodec, qwen3, pc-office, cpu-inference]
platforms: [linux]
---

# HAFJET Malaysian TTS — PC Office CPU Deploy

Deploy `mesolitica/Malaysian-TTS-0.6B-v1` (a Qwen3 causal-LM that emits `speech_NNNNN` tokens) together with `IDEA-Emdoor/DistilCodec-v1.0` (decodes those codes → 24 kHz waveform) on the on-prem **PC Office** worker. PC Office is **CPU-only (no GPU)**, so every CUDA hardcode in DistilCodec must be patched to CPU.

## When to use
- Tuan wants a natural Malay TTS (less robotic than Edge Yasmin YasminNeural).
- Running any HF speech/ML model on the PC Office CPU worker.
- Selecting a customer-facing Malay TTS where explicit commercial licensing matters.
- Adding audio to the WhatsApp bot or producing HAFJET announcements/content.

## Commercial-safe option: VoxCPM2
- `openbmb/VoxCPM2` explicitly declares **Apache-2.0** and lists Malay support; it is the preferred customer-facing candidate.
- It generates high-quality 48 kHz Malay audio and supports voice design with a text prefix.
- CPU feasibility is the constraint: a short sample took minutes on the PC Office i3. Use it for approved pre-rendered clips/content locally, not synchronous dynamic WhatsApp replies. GPU hosting is required for live dynamic audio.
- See `references/voxcpm2-commercial-malay.md` for validated facts and the WhatsApp integration design.

## Architecture
- `Malaysian-TTS-0.6B-v1` = `Qwen3ForCausalLM` (0.6B). Prompt format:
  `<|im_start|>{speaker}: {text}<|speech_start|>` → generates `speech_NNNNN` tokens.
- `DistilCodec-v1.0` (`g_00204000` + `model_config.json`) decodes codes → audio @ 24 kHz.
- 7 built-in speakers: `husein`, `idayu`, `singaporean`, `DisfluencySpeech`, `singlish-speaker2050`, `singlish-speaker2202`, `haqkiem`.

## ⚠️ License caveat (CRITICAL)
- HF card declares **no license** (`license: None`). mesolitica models are generally research/commercial-friendly but UNVERIFIED here.
- **Use for personal/dev only until license is confirmed.** Do NOT wire into the customer-facing WhatsApp bot yet.
- The mesolitica **F5-TTS** series are `cc-by-nc-4.0` = NON-COMMERCIAL. Avoid for business.

## Workflow (full recipe in references/)
1. Bootstrap env on PC Office (uv + Python 3.11 — host py3.14 is PEP 668 / no venv). See `references/pc-office-tts-deploy.md`.
2. Download model + codec via `hf_hub_download()` (NOT `hf download --include`). See pitfall #6.
3. Patch DistilCodec source: 2 CUDA hardcodes → CPU. See `references/pc-office-tts-deploy.md`.
4. Run `scripts/test_tts.py` (greedy + EOS early-stop). Tweak speaker/text.

## Pitfalls (learned the hard way — 20+ tool calls)
1. **`python3 -m venv` FAILS** on PC Office (no ensurepip, no `python3-venv` pkg) and `pip install --user` is blocked (PEP 668). Fix: `python3 -m pip install --user --break-system-packages uv`, then `uv python install 3.11` + `uv venv --python 3.11 ~/tts_venv`.
2. **uv-created venv has NO pip module** → always `uv pip install --python ~/tts_venv/bin/python ...`. Never `python -m pip`.
3. **torchaudio installs CUDA build by default** → crashes on CPU box (`libcudart.so.13 missing`). Reinstall from CPU index: `uv pip install --python ... --reinstall torchaudio --index-url https://download.pytorch.org/whl/cpu`.
4. **DistilCodec does NOT declare its deps.** Manually install: librosa, matplotlib, wandb, tensorboard, torchaudio, einops, vector_quantize_pytorch.
5. **DistilCodec hardcodes CUDA** in two spots → patch source (see references). Without it: `AssertionError: Torch not compiled with CUDA enabled`.
6. **`hf download --include` is IGNORED** when filenames are explicitly set (warning "Ignoring --include since filenames have been explicitly set"). Use `hf_hub_download(repo_id, filename, local_dir=...)` per file. `config.json` and DistilCodec `model_config.json` both got missed this way and broke loading.
7. **`hf` CLI is NOT on PC Office** (only on Azure gateway). Use `hf_hub_download()` from the venv, not the `hf` binary.
8. **Post-sentence hallucination — Mesolitica blocker**: the model rarely emits `<|endoftext|>` (id 151643). Both sampled and greedy tests ran to the token cap; greedy + EOS config did **not** reliably solve it. It can create intelligible speech followed by gibberish. Treat this model as a personal/dev experiment only; do not use it for customer-facing HAFJET audio without a separately validated trim/stop solution.
9. **Text normalization**: model trained on normalized text. `123` must become `one two three` / `satu dua tiga` or it mispronounces. Use Malaya normalizer for production.

## Verification
- Output mp3 ≈ real sentence length (not 10s of karut). Check: `soundfile.info(f)` → 24000 Hz, `frames/samplerate` ≈ expected seconds.
- If audio after the sentence is garbage → EOS early-stop not applied; re-check pitfall #8.
- Speaker sanity: `idayu` = female-ish, `husein` = male-ish.

## Support files
- `references/pc-office-tts-deploy.md` — exact command recipe + DistilCodec CPU patch.
- `scripts/test_tts.py` — ready-to-run generator (greedy + EOS early-stop).
