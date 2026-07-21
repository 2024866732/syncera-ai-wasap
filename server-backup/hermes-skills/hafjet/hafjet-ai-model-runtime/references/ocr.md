# RapidOCR Deployment — HAFJET PC Office

Verified 2026-07-26 by Hermes-HAFJET. Deployed on hafjet-pc-office (i3-2100, 16GB, CPU-only).

## Why not PaddlePaddle

The PC Office CPU is an **Intel Core i3-2100** (Sandy Bridge, 2011). It supports:
- ✅ AVX (first gen, 256-bit)
- ✅ SSE4.1/4.2
- ❌ **NO AVX2** (Haswell+)
- ❌ **NO AVX-512**
- ❌ **NO FMA**

**PaddlePaddle 3.x** (including `paddlepaddle==3.3.1`) is compiled with AVX2 instructions. Importing it on this CPU triggers **SIGILL (exit 132, Illegal instruction)**. PaddlePaddle no longer ships no-AVX builds (deprecated after v2.x).

**Solution:** Use PaddleOCR models via ONNX Runtime → `rapidocr-onnxruntime`. Zero PaddlePaddle needed.

## Installed Environment

| Item | Detail |
|---|---|
| **Venv** | `~/ocr-env` |
| **Python** | 3.13.14 (via `uv python install 3.13`) |
| **Pakej Utama** | `rapidocr-onnxruntime==1.4.4` |
| **Backend** | ONNX Runtime 1.27.0 (CPU) |
| **Model** | PP-OCRv6 multilingual (50 languages) |
| **Image lib** | opencv-python 5.0.0, pillow 12.3.0 |

## Cara Guna

```python
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
result, elapse = engine('/path/to/image.jpg')

# result: list of [box_coords, text, confidence]
for box, text, conf in result:
    print(f'{text} ({conf:.0%})')

# elapse: [detection_time, cls_time, recognition_time]
print(f'OCR took {sum(elapse):.1f}s')
```

## Performance (i3-2100, CPU-only)

First run downloads model files (~14MB detection + ~2MB recognition). Subsequent runs:

| Metric | Time |
|---|---|
| Text detection | ~1.16s |
| Text recognition | ~0.32s |
| **Total** | **~1.49s/image** |
| Accuracy | 94–97% (on clean synthetic text) |

Actual accuracy on scanned invoices/receipts will vary — test with real documents.

## Malay Language

PP-OCRv6 multilingual model covers 50 languages including Malay (Latin script). No separate language model needed — use the default multilingual model. Tested output:

- Input: `HAFJET (M) SDN BHD\nInvoice No: INV-2026-001\nTotal: RM 1,500.00`
- Output: `HAFJET (M) SDN BHD` (94%), `Invoice No INV-2026-001` (97%), `Total RM 1,500.00` (97%)

## Previous failed approach (don't repeat)

1. ❌ `pip install paddlepaddle paddleocr` → SIGILL crash on `import paddle`
2. ❌ Using PaddleOCR with `use_gpu=False` → still imports PaddlePaddle → same SIGILL
3. ❌ PaddleOCR Transformers backend → still has PaddlePaddle dependency chain
4. ❌ `nopaddle` → works but only `parse_pdf()` (no image OCR)
5. ✅ **`rapidocr-onnxruntime`** → pure ONNX Runtime, no PaddlePaddle at all → works

## Integration with Hermes (future)

To call OCR from Hermes (this Azure server) via SSH Tailscale:

```python
import subprocess, json
result = subprocess.run([
    'ssh', 'hafizi145@100.121.94.41',
    'source ~/ocr-env/bin/activate && python3 -c "
from rapidocr_onnxruntime import RapidOCR
import sys, json
r = RapidOCR()
res, _ = r(sys.argv[1])
print(json.dumps([(t, c) for _, t, c in res]))
" "/path/to/image.jpg"'
], capture_output=True, text=True)
```
