---
name: hafjet-whisper-stt
description: "Local Malay/English speech-to-text atas PC Office guna faster-whisper (CTranslate2 + ONNX). CPU-only, model sizes: tiny(1.3s), base(2.8s), small(9.9s)."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Whisper STT Skill — PC Office

## Overview

Guna **faster-whisper** (OpenAI Whisper via CTranslate2) untuk speech-to-text kat PC Office (`100.121.94.41` Tailscale).  
CPU-only, INT8 quantization, 4x lebih laju dari original Whisper.

### Lokasi

- **Server:** `hafizi145@100.121.94.41` (PC Office, Tailscale)
- **Env:** `~/whisper-env` (Python 3.13, uv)
- **Package:** `faster-whisper==1.2.1`, `ctranslate2==4.8.1`

---

## Cara Guna dari Hermes Server (SSH)

### Transkrip Audio Fail

```bash
ssh hafizi145@100.121.94.41 \
  "export PATH=\$HOME/.local/bin:\$PATH && \
   source ~/whisper-env/bin/activate && \
   python3 -c \"
from faster_whisper import WhisperModel
import json, sys
model = WhisperModel('base', device='cpu', compute_type='int8')
segments, info = model.transcribe(sys.argv[1], beam_size=5)
print(json.dumps({'lang': info.language, 'prob': info.language_probability}, ensure_ascii=False))
for seg in segments:
    print(json.dumps({'start': seg.start, 'end': seg.end, 'text': seg.text}, ensure_ascii=False))
\" '/path/to/audio.wav'"
```

### Output Ringkas

```bash
ssh hafizi145@100.121.94.41 \
  "export PATH=\$HOME/.local/bin:\$PATH && \
   source ~/whisper-env/bin/activate && \
   python3 -c \"
from faster_whisper import WhisperModel
model = WhisperModel('tiny', device='cpu', compute_type='int8')
segs, info = model.transcribe('/path/to/audio.wav')
for s in segs:
    print(f'[{s.start:.1f}s] {s.text}')
\""
```

---

## Cara Guna Terus (Local PC Office)

```python
from faster_whisper import WhisperModel

model = WhisperModel('base', device='cpu', compute_type='int8')

segments, info = model.transcribe('audio.wav', beam_size=5)
print(f'Language: {info.language} ({info.language_probability:.0%})')

for seg in segments:
    print(f'[{seg.start:.1f}s -> {seg.end:.1f}s] {seg.text}')
```

---

## Model Sizes and Performance (CPU i3-2100)

| Model | RAM | 9s Audio | Lang Acc | Notes |
|-------|-----|----------|----------|-------|
| tiny | ~1GB | 1.3s | 82% | Fast, real-time |
| base | ~1.5GB | 2.8s | 100% | Sweet spot |
| small | ~2.5GB | 9.9s | 100% | Most accurate |
| medium | ~5GB | ~30s+ | 100% | Heavy |
| large-v3 | ~10GB | - | Best | Too heavy |

**Cadangan:** Guna **base** untuk harian. **tiny** untuk real-time.

---

## Supported Audio Format

faster-whisper guna `av` (ffmpeg) — support WAV, MP3, FLAC, M4A, OGG, OPUS.

```bash
sudo apt install -y ffmpeg
```

---

## Troubleshooting

- **No module 'faster_whisper'** — env tak aktif. Run `source ~/whisper-env/bin/activate`
- **HF Hub warning** — tiada token. Run `huggingface-cli login`
- **Out of memory** — model terlalu besar. Guna `tiny` atau `base`

---

## Install Semula

```bash
uv venv ~/whisper-env --python 3.13
source ~/whisper-env/bin/activate
uv pip install faster-whisper scipy edge-tts
sudo apt install -y ffmpeg
```
