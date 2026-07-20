---
name: hafjet-ai-model-runtime
description: "Run/serve Hugging Face ML models (TTS, LLM, whisper, vision) on HAFJET's on-demand PC Office worker (hafjet-pc-office). Covers env bootstrap when venv fails (uv + pinned py3.11), model download via `hf` (Xet storage), and the mesolitica/Malaysian-TTS Qwen3+DistilCodec workflow. Use whenever Tuan wants to self-host/test an AI model instead of paying for an API or running it on the 1GB Azure box."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET AI Model Runtime (PC Office worker)

Class of work: download, install deps for, and run/sandbox ML models from Hugging Face on HAFJET's on-prem PC Office worker. Trigger this when Tuan asks to test a TTS/LLM/STT/vision model, replace a paid API (Edge TTS, OpenAI), or benchmark a checkpoint before deploying.

## Target: hafjet-pc-office
- Reachable ONLY via Tailscale SSH: `ssh hafizi145@100.121.94.41` (raw IP → MEDIUM security-scan approval every time; see `hafjet-command-safety`).
- Confirmed profile (2026-07-20): Ubuntu, **4-core i3, 16GB RAM, NO GPU** (Intel iGPU only → CPU inference only), ~78G free on `/`.
- On-demand: may be asleep; first `ssh` wakes/probes it. If SSH times out, Tuan must power it on.
- **NEVER format/delete the 320GB HDD (`/dev/sdb1`)** — customer docs live there.

## Step 0 — Environment bootstrap (venv FAILS here)
PC Office ships **Python 3.14.4 ONLY**, with **no `python3.14-venv`** and **no `uv`**. `python3 -m venv` fails: *"ensurepip is not available"*. `sudo` is blocked (same as Azure). Fix: user-install `uv` and pin Python 3.11 (torch ships wheels for 3.11; 3.14 often has none).

```bash
python3 -m pip install --user uv
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.11
uv venv --python 3.11 ~/tts_venv
source ~/tts_venv/bin/activate
# now pip install normally
```

Pitfall: never suggest `apt install python3.14-venv` — sudo is blocked. `uv` user-install is the ONLY path.

## Step 1 — Download models via `hf` (NOT curl)
Modern HF repos use **Xet storage**. `curl .../resolve/main/model.safetensors` returns a 302 to an `xet-bridge` CDN and will NOT yield the file (and `-L` just fetches a redirect stub). Use the `hf` CLI inside the venv:

```bash
pip install "huggingface_hub[cli]"
hf download mesolitica/Malaysian-TTS-0.6B-v1 --local-dir ~/tts/Malaysian-TTS-0.6B-v1
```

## Step 2 — Run (concrete: Malaysian-TTS-0.6B-v1)
This is a **Qwen3 causal LM that emits speech tokens**, decoded to 24kHz audio by **DistilCodec** — NOT a standard `pipeline("text-to-speech")`. Full recipe + speaker list in `references/malaysian-tts.md`. Key facts:
- Needs `git+https://github.com/mesolitica/DistilCodec` + IDEA-Emdoor/DistilCodec-v1.0 weights (`model_config.json`, `g_00204000`).
- Prompt format: `<|im_start|>{speaker}: {text}<|speech_start|>`.
- **License: None declared on the HF card** → do NOT use commercially until verified. The 2026-07-20 test run was approved personal-use only.
- CPU inference on PC Office: ~10–30s per short sentence. Fine for dev/single-file, NOT realtime multi-user.

## Approval & safety notes
- SCP/SSH to `100.121.94.41` triggers a MEDIUM approval each time (raw IP). Write scripts to `/tmp` locally, SCP them, then run remotely — never inline heredocs/pipe-to-python (see `hafjet-command-safety`).
- For **commercial** TTS, prefer models with explicit Apache/MIT license (e.g. parler-tts) over unlicensed mesolitica checkpoints. Tuan currently uses Edge TTS Yasmin (ms-MY-YasminNeural) for production — keep that until a licensed self-hosted option is validated.

## References
- `references/malaysian-tts.md` — full run recipe, dependency list, speaker list, limitations, license status.
