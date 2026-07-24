---
name: hafjet-ocr-rapid
description: OCR untuk HAFJET guna RapidOCR/ONNX Runtime atas PC Office (i3-2100, CPU-only). PP-OCRv6 models, 40+ languages, ~1.5s/image. Remote SSH via Tailscale.
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET RapidOCR Skill — PC Office

## Overview

Guna **RapidOCR** (PP-OCRv6 model via ONNX Runtime) untuk OCR dokumen/invois kat **PC Office** (`100.121.94.41` Tailscale).  
Zero GPU, zero PaddlePaddle. Jalan guna onnxruntime.

### Lokasi

- **Server:** `hafizi145@100.121.94.41` (PC Office, Tailscale)
- **Env:** `~/ocr-env` (Python 3.13, uv)
- **Package:** `rapidocr-onnxruntime==1.4.4`

---

## Cara Guna dari Hermes Server

### OCR Satu Gambar

```bash
ssh hafizi145@100.121.94.41 \
  "export PATH=\$HOME/.local/bin:\$PATH && \
   source ~/ocr-env/bin/activate && \
   python3 -c \"
from rapidocr_onnxruntime import RapidOCR
import sys, json
r = RapidOCR()
res, _ = r(sys.argv[1])
for box, text, conf in res:
    print(json.dumps({'text': text, 'conf': round(conf, 3), 'box': box}, ensure_ascii=False))
\" '/path/to/image.jpg'"
```

### OCR dengan Output Ringkas

```bash
ssh hafizi145@100.121.94.41 \
  "export PATH=\$HOME/.local/bin:\$PATH && \
   source ~/ocr-env/bin/activate && \
   python3 -c \"
from rapidocr_onnxruntime import RapidOCR
r = RapidOCR()
res, _ = r('/path/to/image.jpg')
for _, t, c in res:
    print(f'{t} ({c:.0%})')
\""
```

### OCR PDF (convert ke images dulu)

```bash
# Convert PDF page ke image, then OCR
ssh hafizi145@100.121.94.41 \
  "export PATH=\$HOME/.local/bin:\$PATH && \
   source ~/ocr-env/bin/activate && \
   python3 -c \"
from rapidocr_onnxruntime import RapidOCR
from pypdfium2 import PdfDocument
import tempfile, os

pdf = PdfDocument('/path/to/doc.pdf')
r = RapidOCR()
for i in range(len(pdf)):
    page = pdf[i].render(scale=2)
    img = page.to_pil()
    res, _ = r(img)
    print(f'--- Page {i+1} ---')
    for _, t, c in res:
        print(f'  {t} ({c:.0%})')
\""
```

---

## Cara Guna Terus (Local PC Office)

```bash
source ~/ocr-env/bin/activate
python3 -c "
from rapidocr_onnxruntime import RapidOCR
r = RapidOCR()
res, _ = r('invois.jpg')
for _, t, c in res:
    print(f'{t} ({c:.0%})')
"
```

Atau guna script `/tmp/ocr.py`:

```python
#!/usr/bin/env python3
"""OCR tool - guna: python3 ocr.py image.jpg"""
import sys
from rapidocr_onnxruntime import RapidOCR
r = RapidOCR()
res, _ = r(sys.argv[1])
for _, t, c in res:
    print(f'{t} ({c:.0%})')
```

---

## Bahasa (Language Support)

PP-OCRv6 support **50 languages** dalam satu model — tak perlu tukar2. Default dah termasuk:

- 🇲🇾 Malay (ms)
- 🇬🇧 English (en)
- 🇨🇳 Chinese (zh)
- 🇯🇵 Japanese (ja)
- 🇰🇷 Korean (ko)
- +45 Latin-script languages

Tak perlu specify `lang` parameter — model multilingual terus detect.

---

## Performance

| Metric | Value |
|--------|-------|
| **CPU** | Intel i3-2100 @ 3.10GHz |
| **RAM** | ~500MB semasa OCR |
| **Detection** | ~1.2s |
| **Recognition** | ~0.3s |
| **Total/image** | ~1.5s (simple text) |
| **Supported format** | JPG, PNG, BMP, TIFF, numpy array |

---

## Troubleshooting

**"Illegal instruction (core dumped)"** — CPU terlalu lama (tak support AVX2).  
✅ Jangan guna PaddlePaddle — guna RapidOCR/ONNX je.

**"No module named 'rapidocr_onnxruntime'"** — env tak aktif.  
✅ `source ~/ocr-env/bin/activate`

**Result terlalu slow** — pastikan CPU tak throttle:  
✅ Check `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` — set ke `performance` kalau nak laju.

**Tak detect text** — gambar terlalu kecil atau text terlalu kecil.  
✅ Guna resolution ≥300 DPI. Crop lebih zoom kalau perlu.

---

## Install Semula (kalau perlu)

```bash
uv venv ~/ocr-env --python 3.13
source ~/ocr-env/bin/activate
uv pip install rapidocr-onnxruntime pillow pypdfium2
```

Tak perlu PaddlePaddle, torch, atau GPU.

---

## Reference

`references/paddle-crash-to-rapidocr.md` — Full debug log and root cause analysis of the PaddlePaddle SIGILL crash on i3-2100 (Sandy Bridge AVX2 gap), plus the ONNX-backport pattern applicable to any ML framework with hardcoded AVX2 wheels.
