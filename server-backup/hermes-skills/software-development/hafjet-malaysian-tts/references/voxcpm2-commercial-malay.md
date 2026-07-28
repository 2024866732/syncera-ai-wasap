# VoxCPM2 commercial Malay TTS — validated session notes

## Decision-grade facts
- Model: `openbmb/VoxCPM2`.
- HF model card explicitly declares `license: apache-2.0`; README says commercial-ready / free for commercial use.
- Malay (`ms`) is explicitly listed among its 30 supported languages.
- Output is 48 kHz. Voice design works by prefixing the text, e.g. `(A young Malay woman, gentle and clear voice)...`.
- PC Office CPU test generated a natural Malay sample but pronounced `HAFJET` as approximately “half-jad”. Use a phonetic rendering such as `HAF-JET` / `Haf Jet` in synthesis input and audition brand names before production.

## PC Office evaluation
- `voxcpm` installed in the existing Python 3.11 `~/tts_venv`; it retained CPU-only Torch.
- Model artifacts downloaded to `~/voxcpm/` totalled about 4.7 GB.
- VoxCPM2 loaded successfully on CPU (`bfloat16`) and generated a valid 48 kHz WAV.
- It is unsuitable for live, arbitrary WhatsApp replies on the i3 CPU: a short ~3.2-second sample took several minutes after warm-up. Use pre-rendered clips for bot flows, or GPU hosting for dynamic speech.

## WhatsApp integration architecture
1. Azure bot is presently text-only: `webhook_listener.py` has `send_whatsapp_message()` but no media upload/send helper.
2. Layer 1 (safe/local): generate and approve fixed clips on PC Office (greeting, menu, status acknowledgement); Azure bot uploads them to Meta Graph API and sends type `audio`.
3. Keep dynamic AI answers as text on the CPU worker. Do not queue long synchronous TTS work in the webhook path.
4. Layer 2 (only if needed): host VoxCPM2 on a GPU endpoint / worker, then add an async generation queue and fallback to text. HF dedicated endpoints require a subscription/card and charge by active instance time; scale-to-zero can avoid idle charges. Verify current pricing before proposing a budget.

## Implementation guardrails
- Treat custom voice descriptions and cloned voices as generated content; do not imitate a real person without permission.
- Keep a text fallback for every audio flow: media upload or generation can fail.
- Before any customer-facing deployment: show code diff, test media upload/send with a controlled recipient, then obtain explicit deployment approval.
