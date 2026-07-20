---
name: hf-model-vetting
description: "Vet and deploy Hugging Face models for HAFJET — pre-download license/gated/Xet/pipeline_tag triage, plus the working mesolitica Malaysian-TTS (Qwen3 + DistilCodec) pipeline and CPU/PC-Office deployment notes."
version: 1.0.0
author: HAFJET Hermes
license: MIT
tags: [huggingface, hf, tts, speech, model-vetting, malay, hafjet]
platforms: [linux]
---

# HF Model Vetting & Deployment (HAFJET)

Use this whenever Tuan Hafizi wants to **use a Hugging Face model** — TTS,
STT/whisper, LLM, vision — for HAFJET. Covers the mistakes that waste a turn:
trusting `pipeline_tag`, ignoring license for commercial use, and `curl`-ing a
Xet repo.

## When to use
- "cari TTS suara Malay natural", "download model ni", "guna HF untuk bot".
- Any pre-download check before `hf download`.

## Pre-download triage (do this FIRST)
Query the model API; don't trust the card title or `pipeline_tag`:

```bash
curl -s "https://huggingface.co/api/models/<ID>" -o /tmp/m.json
python3 -c "import json;d=json.load(open('/tmp/m.json'));cd=d.get('cardData',{});\
print('license:',cd.get('license'));print('gated:',d.get('gated'));\
print('pipeline:',d.get('pipeline_tag'));print('downloads:',d.get('downloads'))"
```

1. **License for commercial use** — if `cardData.license` is `null`/`None`, the
   card declares NO license → treat as **NOT safe for customer-facing /
   commercial use** until verified with the author. Malay models vary: F5-TTS
   series are `cc-by-nc-4.0` (non-commercial); Qwen3-based <4B are usually
   commercial-OK but READ the card. When in doubt, prefer explicit Apache/MIT.
2. **Gated?** — `gated: true` ⇒ accept license / log in (`hf auth login` or
   `HF_TOKEN`). Non-gated ⇒ anonymous download works.
3. **Xet storage** — if `curl .../resolve/main/<file>` 302-redirects to
   `xet-bridge` / `cas-server.xethub.hf.co`, the repo uses **Xet**. `curl`
   directly returns a tiny redirect body, NOT the file. Use `hf download <ID>`
   (needs `huggingface_hub[cli]` or the `hf` binary). Always `-L` when you DO
   curl README/config.
4. **README usage is ground truth** — `pipeline_tag` can lie. Example:
   `mesolitica/Malaysian-TTS-0.6B-v1` reports `text-generation` but is a
   **Qwen3 LM that GENERATES speech tokens**, decoded by a separate DistilCodec.
   Standard `pipeline("text-to-audio")` will NOT work. Always read "How to use".

## Where it can run (HAFJET topology)
- **Azure server** (1 GB RAM + 4 GB swap): too small to load torch. Never run
  models here.
- **PC Office** (`hafjet-pc-office`, TS `100.121.94.41`, 16 GB RAM, 4-core i3,
  **NO GPU** — Intel iGPU only): fine for dev/batch CPU inference, NOT realtime
  for many concurrent users. Reachable only via TS SSH. Had only Python 3.14.4 —
  if torch lacks a 3.14 wheel, use `uv` for a 3.11 venv.
- **HF Inference Endpoint**: best for production bot — API call, scale-to-zero.

## Working example: mesolitica Malaysian-TTS (Qwen3 + DistilCodec)
See `references/mesolitica-malaysian-tts.md` — full dependency list, download
commands (Xet + DistilCodec weights), minimal CPU inference script, and the
undeclared-license commercial caveat.

## Pitfalls
- Don't `curl | python3` or heredoc on the server — violates `hafjet-command-safety`.
  Write `.py` to `/tmp`, `scp` to PC Office, run there.
- Don't normalize numbers for mesolitica TTS — feed `satu dua tiga`, not `123`.
- `hf models list --search` truncates; use `--no-truncate` to see full IDs/tags.
- Web search for "best Malay TTS" returns mostly SaaS (ElevenLabs clones), not
  HF models — prefer `hf models list --search` + API triage for real options.
