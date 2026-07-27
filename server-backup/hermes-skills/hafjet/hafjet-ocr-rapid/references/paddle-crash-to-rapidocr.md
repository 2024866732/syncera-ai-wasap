# PaddlePaddle Crash → RapidOCR (ONNX) — Root Cause & Fix

**Date:** 2026-07-24
**Machine:** PC Office — Intel i3-2100 (Sandy Bridge, 2011), Ubuntu 26.04

## Symptom

```bash
$ python3 -c "import paddle"
Illegal instruction (core dumped)  # SIGILL, exit code 132

$ python3 << 'EOF'
from paddleocr import PaddleOCR
ocr = PaddleOCR(lang='ms', use_textline_orientation=True)
EOF
Illegal instruction (core dumped)  # exit code 132
```

## Root Cause

PaddlePaddle ≥3.0 wheels are compiled with **AVX2** instruction-set extensions.
The Intel i3-2100 (Sandy Bridge) supports AVX (first-gen) but NOT AVX2, FMA3, or AVX-512.

### CPU flags (i3-2100)
```
avx ✅ | avx2 ❌ | fma ❌ | avx512f ❌
```

## Failed Approaches

| Approach | Result |
|----------|--------|
| `uv pip install paddlepaddle` (3.3.1) | ✅ Install → ❌ SIGILL on import |
| `uv pip install paddleocr` (3.7.0) + torch | ❌ PaddleOCR still triggers paddle internals |
| Official no-AVX wheel | ❌ Dropped after PaddlePaddle v2.x |
| `nopaddle[onnx]` | ✅ Works but PDF-only, no direct image OCR |

## Solution: RapidOCR via ONNX Runtime

```bash
uv venv ~/ocr-env --python 3.13
source ~/ocr-env/bin/activate
uv pip install rapidocr-onnxruntime pillow pypdfium2
```

**Why it works:**
- RapidOCR = PP-OCRv6 models (same accuracy as PaddleOCR) but pre-converted to ONNX
- ONNX Runtime CPU backend uses SSE4.x baseline (all x86_64 CPUs since 2007)
- Zero dependency on PaddlePaddle or PyTorch

**Verified performance (i3-2100):**
- Detection: ~1.2s | Recognition: ~0.3s | Total: ~1.5s
- Accuracy: 94-97% (tested with Malay text)

## General ONNX-backport Pattern

When ML framework wheels require instruction-set extensions your CPU lacks:

1. Check HuggingFace for pre-converted ONNX models (filter: "onnx")
2. If none: convert yourself (`paddle2onnx`, `torch.onnx.export()`)
3. Run inference via `pip install onnxruntime`
4. ONNX Runtime CPU provider = SSE4.x baseline → works on any x86_64 CPU

Applicable to: PaddlePaddle, PyTorch, TensorFlow, JAX.
