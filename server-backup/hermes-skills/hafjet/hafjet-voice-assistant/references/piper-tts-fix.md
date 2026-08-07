# Piper TTS Fix — Generator Consumption

## Problem

Piper's `synthesize()` method returns a **generator** of `AudioChunk` objects, not raw audio bytes. Writing the generator directly to a file produces empty WAV files (0 bytes).

## Root Cause

```python
# WRONG — produces empty file
with open(output_path, "wb") as f:
    piper_voice.synthesize(text, f)

# WRONG — BytesIO also gets 0 bytes
f = io.BytesIO()
piper_voice.synthesize(text, f)
```

The `synthesize()` signature:
```python
def synthesize(
    self,
    text: str,
    syn_config: Optional[SynthesisConfig] = None,
    include_alignments: bool = False,
) -> Iterable[AudioChunk]:
```

## Solution

Consume the generator, concatenate audio arrays, save as WAV:

```python
from piper import PiperVoice, SynthesisConfig
import numpy as np
import wave

piper_voice = PiperVoice.load(onnx_path, json_path)
syn_config = SynthesisConfig()

audio_chunks = []
for chunk in piper_voice.synthesize(text, syn_config):
    audio_chunks.append(chunk.audio_float_array)

if not audio_chunks:
    raise RuntimeError("No audio generated")

full_audio = np.concatenate(audio_chunks)
audio_int16 = (full_audio * 32767).astype(np.int16)

with wave.open(output_path, 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(piper_voice.config.sample_rate)
    wf.writeframes(audio_int16.tobytes())
```

## Key Points

- `chunk.audio_float_array` is `np.ndarray` of float32 samples (-1.0 to 1.0)
- Sample rate from `piper_voice.config.sample_rate` (22050 for medium voices)
- Convert to int16: multiply by 32767, clip to [-1, 1]
- Use `wave` module for proper WAV header

## Performance

| Text Length | Chunks | Duration | File Size |
|-------------|--------|----------|-----------|
| "Hello HAFJET" | 1 | ~1s | ~45KB |
| "Stock iPhone 11 ada 3 unit, harga RM 1,299" | 1 | ~2s | ~88KB |

## Reference

- Piper source: `piper/voice.py` → `synthesize()` method
- `AudioChunk` has: `audio_float_array`, `sample_rate`, `phonemes`, `phoneme_ids`