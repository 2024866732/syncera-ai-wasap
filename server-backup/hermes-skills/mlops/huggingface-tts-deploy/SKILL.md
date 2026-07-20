---
name: huggingface-tts-deploy
description: "Deploy & run Hugging Face TTS models on a CPU-only Linux box (esp. HAFJET PC Office). Covers the DistilCodec undeclared-dependency chain, torchaudio CPU-build trap, DistilCodec cuda:0 source patch, and the hf download --include silent-drop bug. Use when downloading/testing any mesolitica/Malaysian-TTS or DistilCodec-based TTS model."
version: 1.0.0
author: HAFJET (M) SDN BHD
---
# Hugging Face TTS Deploy (CPU worker)

Run Qwen3/DistilCodec-based Malay TTS (e.g. `mesolitica/Malaysian-TTS-0.6B-v1`)
on a GPU-less machine. The model is NOT a normal TTS: a Qwen3 LM generates
speech tokens, then DistilCodec decodes them to 24 kHz audio.

## Anatomy of the model
- `mesolitica/Malaysian-TTS-0.6B-v1` = Qwen3ForCausalLM (text→speech tokens).
- `IDEA-Emdoor/DistilCodec-v1.0` = `model_config.json` + `g_00204000` (1.6 GB codec).
- Speaker is selected by prefixing the prompt: `idayu: <text>`.
- 7 speakers: husein, idayu, singaporean, DisfluencySpeech, singlish-speaker2050/2202, haqkiem.

## Environment prerequisite
Target box (HAFJET PC Office) has ONLY Python 3.14 system-wide, NO `python3-venv`,
and is PEP 668 externally-managed. Standard `python3 -m venv` and `pip --user` BOTH fail.
Use `uv` (see `references/pc-office-uv-setup.md`). On a normal box with venv+pip, skip to download.

## Steps (see references/ for scripts)
1. Create venv + install deps — `references/pc-office-uv-setup.md`.
2. Download model + codec — `scripts/download_tts.sh`.
3. Patch DistilCodec source (`cuda:0` → `cpu`) — `scripts/patch_codec.py`.
4. Run inference — `scripts/test_tts.py`.

## Pitfalls (learned the hard way — all real)
- **DistilCodec has NO declared deps.** Importing it fails progressively:
  librosa → matplotlib → wandb → tensorboard → torchaudio → einops →
  vector_quantize_pytorch. Install ALL of them or you'll loop.
- **torchaudio pulls a CUDA build by default** even when torch is CPU-only →
  `libcudart.so.13: cannot open shared object file`. Reinstall from the CPU index:
  `uv pip install --python VENV torchaudio --index-url https://download.pytorch.org/whl/cpu`
- **`DistilCodec.from_pretrained()` hardcodes `codec.device = torch.device('cuda:0')`
  and calls `.to(device)` → crashes on CPU-only.** `monkeypatch torch.cuda.is_available`
  is NOT enough (cuda device object still lazy-inits). Patch the source line instead
  (see `scripts/patch_codec.py`). `torch.device` is a C type and cannot be subclassed.
- **`hf download --include "*.json" ...` silently drops files** with a
  "Ignoring --include since filenames have been explicitly set" warning. `config.json`
  and `model_config.json` get SKIPPED → later `Unrecognized model` / missing-config errors.
  Download those two explicitly via `hf_hub_download(..., filename='config.json')`.
- **Read remote files with `sed -n` over SSH**, not via the local `read_file` tool
  (which only sees the gateway's filesystem).

## License caveat
`mesolitica/Malaysian-TTS-0.6B-v1` card declares **no license** (license: None).
Safe for PERSONAL/dev use; do NOT use commercially until license is confirmed.
(F5-TTS series is explicitly `cc-by-nc-4.0` = non-commercial, never for business.)
