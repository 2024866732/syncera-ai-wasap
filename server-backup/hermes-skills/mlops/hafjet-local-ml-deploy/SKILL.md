---
name: hafjet-local-ml-deploy
description: Deploy and run ML models (TTS / LLM / etc.) locally on the HAFJET PC Office worker — uv/venv setup under PEP 668, CPU-only torch (incl. torchaudio), Hugging Face download quirks, patching CUDA-hardcoded research repos for CPU, detached SSH runs for long generation, and license verification before commercial use.
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Local ML Model Deploy (PC Office worker)

PC Office (`hafjet-pc-office`, TS `100.121.94.41`) is the on-demand, CPU-only worker for
running ML models locally — vs the Azure gateway which is only 1GB RAM. Use this skill
whenever Tuan wants to download / run a Hugging Face model, TTS, or local LLM on PC Office.

## Environment reality (PC Office) — verified 2026-07-20
- **Only Python 3.14** system-wide. `python3-venv` package is NOT installed.
- **PEP 668 externally-managed** → `pip install` (even `--user`) is blocked.
- **No `hf` CLI** on PC Office (only on the Azure gateway). Use the Python `huggingface_hub` API.
- **No GPU** (Intel iGPU only) → CPU inference only. Expect slow generation.

## Setup recipe (uv-based — the ONLY working path)
```bash
# 1) install uv as a single user tool (override PEP 668 for THIS tool only)
python3 -m pip install --user --break-system-packages uv
export PATH="$HOME/.local/bin:$PATH"
# 2) standalone Python 3.11 (has torch wheels; 3.14 often lacks them)
uv python install 3.11
# 3) venv — uv creates it WITHOUT a pip module; use `uv pip install`, never `python -m pip`
rm -rf ~/myenv
uv venv --python 3.11 ~/myenv
# 4) deps via uv pip, CPU torch from the cpu index
uv pip install --python ~/myenv/bin/python torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python ~/myenv/bin/python transformers "huggingface_hub" <other deps>
```
**Pitfall:** `uv pip install torchaudio` WITHOUT the cpu index pulls a **CUDA build** that
fails on a CPU-only box with `libcudart.so.13: cannot open shared object file`. Always pass
`--index-url https://download.pytorch.org/whl/cpu` for **both** torch and torchaudio.

## Hugging Face download quirks
- `hf download --include "a" "b"` often prints `Ignoring --include since filenames have been
  explicitly set` and silently drops files (e.g. `config.json` goes missing). **Use the Python
  `hf_hub_download()` for individual files:**
  ```python
  from huggingface_hub import hf_hub_download
  hf_hub_download(repo_id="org/model", filename="config.json", local_dir="~/mymodel")
  ```
- Models on **Xet storage** can't be `curl`'d directly — use `hf download` / `hf_hub_download`.

## License verification (commercial use — MANDATORY for HAFJET)
Tuan runs HAFJET commercially, so confirm the license BEFORE using any model for the bot.
- **Do NOT trust the `license=mit` search filter** — it matches other tags and returns models
  whose `cardData.license` is actually `None`.
- Verify directly: `curl -sS https://huggingface.co/api/models/<id>` → check `cardData.license`
  AND read the README "License" section.
- ✅ Confirmed commercial-safe: **`openbmb/VoxCPM2`** — `apache-2.0`, README says "free for
  commercial use", **has Malay (`ms`)**, 48 kHz output. Works on CPU.
- ⚠️ **`mesolitica/Malaysian-TTS-0.6B-v1`** — `cardData.license: None` (not confirmed safe)
  AND the model **never emits an EOS token**, so it hallucinates gibberish after the sentence.
  Not recommended.

## Patching CUDA-hardcoded research repos (CPU-only)
Many research TTS repos (`DistilCodec`, etc.) hardcode `.cuda()`. Patch the source in the venv
(grep for `.cuda()` / `torch.device('cuda'`):
- `distil_codec.py` line ~94: `codec.device = torch.device('cuda:{:d}'.format(local_rank))`
  → `torch.device('cpu')`
- `distil_codec.py` line ~588: `.unsqueeze(-1).cuda()` → `.unsqueeze(-1).cpu()`
Also expect **undeclared imports** (librosa, matplotlib, wandb, tensorboard, torchaudio,
einops, vector_quantize_pytorch) — install them one by one as `ImportError`s surface.

## Long-running generation over SSH
Generation can take minutes → the SSH session drops (`exit 255`) and kills the process.
**Detach with `setsid` + redirect to a log file**, then poll the log:
```bash
ssh user@host "source ~/myenv/bin/activate; setsid bash -c 'python /tmp/run.py' >/dev/null 2>&1 & echo LAUNCHED"
# later: ssh user@host "tail -f ~/myenv/run.log"
```
Hermes `terminal(background=true, notify_on_complete=true)` also works, but PC Office SSH idle
can still drop; the `setsid`+log approach is the most robust.

## SCP / SSH approval gate
Commands to `100.121.94.41` (raw IP) trigger a **MEDIUM security-scan approval**. They BLOCK
if Tuan doesn't approve promptly. Batch SCP + run into one approved command when possible, and
tell Tuan to approve fast.

## References
- `references/pc-office-setup.md` — full env facts + verified setup commands.
- `references/malay-tts-models.md` — VoxCPM2 recipe (recommended), Malaysian-TTS gotchas,
  DistilCodec CPU patch lines.
