---
name: hafjet-voice-assistant
description: "Voice assistant: Whisper STT + Piper TTS on PC Office."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Voice Assistant — Complete Pipeline

## Overview

Full voice assistant stack untuk HAFJET running on **PC Office** (ARM Ubuntu, i3-2100, 16GB RAM). Combines:
- **STT**: faster-whisper (CTranslate2) — Malay/English, base model (2.8s/9s audio)
- **TTS**: Piper TTS — English voices only (no Malay voice available in Piper)
- **Intent Parsing**: Regex-based untuk HAFJET domain (stock, sales, repairs)
- **Supabase**: Async queries untuk stock, sales, repair status
- **API**: FastAPI di port 8090
- **WhatsApp**: Cloud API webhook untuk voice notes

## Architecture

```
User Voice/Telegram/WhatsApp
        │
        ▼
   FastAPI :8090 (PC Office)
        │
        ├─► /api/v1/voice/process     → STT → Intent → Supabase → TTS
        ├─► /api/v1/text/process      → Intent → Supabase → TTS
        ├─► /api/v1/webhook/whatsapp  → Download ogg → Convert → Process → Reply
        ├─► /api/v1/tts/synthesize    → Direct TTS
        └─► /api/v1/stt/transcribe    → Direct STT
```

## Quick Start

### 1. Environment Setup (PC Office)

```bash
# Install uv
python3 -m pip install --user --break-system-packages uv
export PATH="$HOME/.local/bin:$PATH"

# Python 3.11 for torch CPU wheels
uv python install 3.11

# Create venv
uv venv --python 3.11 ~/voice-assistant-env
source ~/voice-assistant-env/bin/activate

# Install dependencies
uv pip install faster-whisper piper-tts fastapi uvicorn[standard] \
  httpx python-dotenv supabase pydantic onnxruntime aiohttp python-multipart

# Download Piper voices (English only — no Malay in Piper)
mkdir -p ~/projects/hafjet-voice-assistant/models/piper
python3 -m piper.download_voices --download-dir ~/projects/hafjet-voice-assistant/models/piper \
  en_US-lessac-medium en_US-amy-medium
```

### 2. Configure Environment

```bash
# Copy and edit
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
```

### 3. Run Service

```bash
# Manual
cd ~/projects/hafjet-voice-assistant
./start.sh

# Or systemd
sudo cp hafjet-voice-assistant.service /etc/systemd/system/
sudo systemctl enable --now hafjet-voice-assistant
```

### 4. Test

```bash
# Health
curl http://localhost:8090/health

# Text → Intent → TTS
curl -X POST http://localhost:8090/api/v1/text/process \
  -H "Content-Type: application/json" \
  -d '{"text": "HAFJET, berapa stock iPhone 11?"}'

# Direct TTS
curl -X POST http://localhost:8090/api/v1/tts/synthesize \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "text=Hello HAFJET&voice=default" --output test.wav
```

## Supported Voice Commands (Malay/English)

| Intent | Example Commands | Entities Extracted |
|--------|------------------|-------------------|
| `stock_query` | "HAFJET, berapa stock iPhone 11?" | product, model |
| `sales_query` | "HAFJET, jualan hari ini" | timeframe |
| `repair_status` | "HAFJET, status repair ticket ABC123" | repair_ticket |
| `low_stock_alert` | "HAFJET, stock rendah" | — |
| `daily_digest` | "HAFJET, ringkasan harian" | — |

Wake words: `hafjet`, `ha fet`, `half jet`, `hapjet`

## TTS Voices (Piper)

| Voice | Gender | Quality | File |
|-------|--------|---------|------|
| `en_US-lessac-medium` | Male | Medium | ~63MB |
| `en_US-amy-medium` | Female | Medium | ~63MB |

**Note**: No Malay voice available in Piper. For Malay TTS, see `hafjet-tts-deploy` skill (uses mesolitica/Malaysian-TTS but has license/gibberish issues).

## WhatsApp Voice Note Webhook

Endpoint: `POST /api/v1/webhook/whatsapp`

Handles WhatsApp Cloud API voice notes:
1. Downloads media from `MediaUrl0` using `WHATSAPP_TOKEN`
2. Converts ogg/opus → WAV (16kHz mono) via ffmpeg
3. Processes through voice assistant pipeline
4. Sends text reply via WhatsApp API

Required env vars:
- `WHATSAPP_TOKEN` — Cloud API token
- `WHATSAPP_PHONE_NUMBER_ID` — Phone number ID

## Supabase Schema Expectations

| Table | Key Columns |
|-------|-------------|
| `products` | sku, name, quantity, price, category |
| `sales` | amount_total, payment_status, created_at |
| `repairs` | ticket_id, customer_name, device, status, updated_at |

## Project Structure

```
~/projects/hafjet-voice-assistant/
├── src/
│   ├── __init__.py
│   ├── voice_assistant.py    # Core: STT, TTS, Intent, Supabase
│   └── api.py                # FastAPI endpoints
├── models/piper/             # .onnx + .onnx.json voice models
├── tests/test_voice_assistant.py
├── requirements.txt
├── .env.example
├── start.sh
└── hafjet-voice-assistant.service
```

## Performance (PC Office i3-2100)

| Operation | Model | Time |
|-----------|-------|------|
| STT (9s audio) | Whisper base | ~2.8s |
| STT (9s audio) | Whisper tiny | ~1.3s |
| TTS (short phrase) | Piper medium | ~0.5s |
| Intent parse | Regex | <1ms |
| Supabase query | Network | ~200-500ms |

Total voice command latency: **~3-5 seconds** (well under 10s requirement)

## Troubleshooting

### TTS produces empty WAV
Piper's `synthesize()` returns a generator — must consume it. Fixed in `voice_assistant.py`:
```python
audio_chunks = []
for chunk in piper_voice.synthesize(text, syn_config):
    audio_chunks.append(chunk.audio_float_array)
full_audio = np.concatenate(audio_chunks)
# Save as WAV with wave module
```

### Whisper model download slow
First run downloads from HF Hub. Subsequent runs use cache (`~/.cache/huggingface`).

### Supabase connection failed
Check `.env` has correct `SUPABASE_URL` and `SUPABASE_KEY` (anon or service_role).

### WhatsApp webhook 404
Ensure webhook URL in Meta Developer Console points to `https://<domain>/api/v1/webhook/whatsapp` with correct verify token.

### Audio file not served
Don't delete temp audio immediately in background tasks — let `/api/v1/audio/{filename}` serve it first. Cleanup via cron.

## Related Skills

- `hafjet-whisper-stt` — STT-only details, model benchmarks
- `hafjet-tts-deploy` — Alternative Malay TTS (mesolitica/Malaysian-TTS) with caveats
- `hafjet-biz-ops` — Business logic for stock/sales/repair payloads
- `hafjet-worker-project-setup` — General worker project scaffolding on PC Office

## References

- `references/piper-tts-fix.md` — Piper generator consumption fix details
- `references/intent-patterns.md` — Full regex patterns for intent parsing
- `references/whatsapp-webhook.md` — WhatsApp Cloud API webhook flow
- `references/supabase-schema.md` — Expected Supabase tables