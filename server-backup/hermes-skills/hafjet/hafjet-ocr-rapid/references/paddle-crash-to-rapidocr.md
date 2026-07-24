# PaddlePaddle SIGILL → RapidOCR Migration (i3-2100)

## The Problem

`import paddle` or `PaddleOCR()` crashes with **`Illegal instruction (core dumped)`** (exit code 132) on the i3-2100.

### Root cause

- **CPU:** Intel Core i3-2100 (Sandy Bridge, 2011)
- **Instruction sets:** AVX ✅, SSE4.2 ✅, **AVX2 ❌** (Haswell 2013+)
- **PaddlePaddle 3.3.1 wheel:** Compiled with `-mavx2` — requires AVX2
- PaddlePaddle no longer publishes no-AVX builds (dropped after v2.x)
- Even PaddleOCR 3.7.0 with `Transformers` backend cannot load models without `paddle` modules crashing internally

### Fix

Replace PaddlePaddle-based pipeline with ONNX Runtime equivalents:

| Purpose | Package | Backend |
|---------|---------|---------|
| Image OCR | `rapidocr-onnxruntime` | ONNX Runtime |
| PDF OCR | `nopaddle[onnx]` | ONNX Runtime |

### Debug path

```bash
# 1. Confirm AVX2 is missing
cat /proc/cpuinfo | grep flags | head -1 | grep -o 'avx2\|avx'
# → "avx" found, "avx2" NOT found

# 2. Confirm PaddlePaddle crashes
python3 -c 'import paddle; print(paddle.__version__)'
# → Illegal instruction (core dumped)

# 3. Test RapidOCR
python3 -c 'from rapidocr_onnxruntime import RapidOCR; r=RapidOCR(); print("OK")'
# → OK
```

### Install

```bash
uv venv ~/ocr-env --python 3.13
source ~/ocr-env/bin/activate
uv pip install rapidocr-onnxruntime pillow pypdfium2
```

## Pattern generalisation

Any PyPI wheel that hardcodes AVX2 (most ML frameworks: PaddlePaddle, some builds of TensorFlow/PyTorch) will SIGILL on Sandy Bridge / Ivy Bridge CPUs. The fix is always the same:

1. Check for an ONNX Runtime backend of the same model
2. Use a no-AVX build if the project publishes one (rare for new versions)
3. Switch to a CPU-agnostic alternative that uses ONNX Runtime directly
