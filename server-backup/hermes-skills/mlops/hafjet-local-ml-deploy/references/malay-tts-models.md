# Malay TTS Models — Evaluation & Recipes (2026-07-20)

## RECOMMENDED: openbmb/VoxCPM2  (Apache-2.0, commercial-safe, has Malay)
- License: `apache-2.0` (explicit in cardData, tags, and README: "free for commercial use").
- Languages: 30 incl. **Malay (`ms`)** — no lang tag needed, type Malay directly.
- Quality: 48 kHz studio output (AudioVAE V2, 16k→48k super-res).
- Size: 2B params, ~4.7 GB download (model.safetensors + audiovae.pth + tokenizer).
- Runs on **CPU** (confirmed: "Running on device: cpu, dtype: bfloat16").
- Install: `uv pip install --python $V voxcpm`  (pulls ~72 deps; torch CPU kept).
- Voice Design: prefix text with `(A young Malay woman, gentle voice)` — no ref audio needed.
- Minimal generate:
  ```python
  from voxcpm import VoxCPM
  import soundfile as sf, torch, os
  torch.cuda.is_available = lambda: False
  os.environ['CUDA_VISIBLE_DEVICES'] = ''
  m = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
  wav = m.generate(text="(A young Malay woman, gentle voice)Selamat datang ke HAFJET.",
                   cfg_value=2.0, inference_timesteps=10)
  sf.write("out.wav", wav, m.tts_model.sample_rate)
  ```

## NOT recommended: mesolitica/Malaysian-TTS-0.6B-v1
- `cardData.license: None` → **not confirmed commercial-safe**.
- Architecture: Qwen3 LM generates `speech_N` tokens → DistilCodec decodes to 24 kHz audio.
- **Fatal flaw:** model NEVER emits `<|endoftext|>` (EOS) → keeps generating past the
  sentence → **gibberish / hallucinated speech** after the real text. Greedy + early-stop
  did not help (EOS simply not produced).
- If ever needed anyway (e.g. personal/dev), DistilCodec needs CPU patches:
  - `distil_codec.py` ~L94: `torch.device('cuda:0')` → `torch.device('cpu')`
  - `distil_codec.py` ~L588: `.unsqueeze(-1).cuda()` → `.unsqueeze(-1).cpu()`
  - Undeclared deps: librosa, matplotlib, wandb, tensorboard, torchaudio(cpu), einops,
    vector_quantize_pytorch.
  - Also need `config.json` + `IDEA-Emdoor/DistilCodec-v1.0/model_config.json` fetched
    separately (hf download --include drops them).

## License check rules
- `hf` search `license=mit` is unreliable (matches other tags) — always verify
  `cardData.license` via the API + README "License" section.
- For HAFJET commercial use, only deploy models with explicit `apache-2.0` / `mit` / permissive
  license confirmed in BOTH the API and the README.
