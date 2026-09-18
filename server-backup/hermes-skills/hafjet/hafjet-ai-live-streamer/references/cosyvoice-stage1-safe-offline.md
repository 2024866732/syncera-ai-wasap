# CosyVoice Stage 1 — safe offline validation on RTX

Use when evaluating a TTS upgrade while an owner-managed LiveTalking session is already active.

## Hard boundary

- Never modify `~/hafjet-live/venv-livetalking`, restart `app.py`, create a WebRTC offer, or call `/human`/`/humanaudio` during Stage 1.
- Use `~/hafjet-cosyvoice/` and `venv-cosyvoice` only. Do not start a service in Stage 1.

## Verified RTX setup (2026-08)

- Official repo checkout: `~/hafjet-cosyvoice/CosyVoice`
- Dedicated runtime: uv Python 3.10.21, `~/hafjet-cosyvoice/venv-cosyvoice`
- Model: `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` → `pretrained_models/Fun-CosyVoice3-0.5B`
- CUDA runtime: torch 2.3.1+cu121.
- Official import requires the checkout plus Matcha submodule on the Python path:
  `from cosyvoice.cli.cosyvoice import AutoModel`; add `third_party/Matcha-TTS` to `sys.path` for a standalone script.

## Dependency installation notes

CosyVoice requirements need Python 3.10. On a PEP-668 host, install `uv` user-local only when separately approved, then create a dedicated venv.

The current requirements have undeclared legacy build dependencies under uv. A working isolated resolution used:

```bash
uv pip install --python ~/hafjet-cosyvoice/venv-cosyvoice/bin/python 'setuptools<81' numpy==1.26.4
uv pip install --python ~/hafjet-cosyvoice/venv-cosyvoice/bin/python -r requirements.txt \
  --no-build-isolation --index-strategy unsafe-best-match
```

Keep this confined to the CosyVoice venv. Do not apply its Torch/version pins to LiveTalking.

## Offline inference result and guard

One 24 kHz Malay WAV was generated successfully with the 0.5B model. Cold path measured 134.98s because it included model load and WeText resource bootstrap; reported synthesis RTF was 1.44. GPU after load/inference was 9628 MiB and 54°C.

This is **not** coexistence approval: it leaves little headroom against the 10752 MiB live circuit-breaker threshold. Before any LiveTalking wiring, require a separate approved warm-latency and VRAM-coexistence test with the active avatar workload, then use generated WAV only through the existing active session's `/humanaudio` path.