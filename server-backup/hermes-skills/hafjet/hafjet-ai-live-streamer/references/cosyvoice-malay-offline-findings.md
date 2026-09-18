# CosyVoice3 Malay Offline Findings

Use for offline-only evaluation of CosyVoice3 on the RTX node; never treat this as approval to wire LiveTalking.

## Verified setup

- Dedicated root: `~/hafjet-cosyvoice/`
- Dedicated runtime: `venv-cosyvoice` using Python 3.10 and Torch 2.3.1+cu121.
- Official model tested: `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`.
- Correct checkout import:
  ```python
  import sys
  sys.path.insert(0, str(ROOT))
  sys.path.append(str(ROOT / "third_party" / "Matcha-TTS"))
  from cosyvoice.cli.cosyvoice import AutoModel
  ```
- `AutoModel` expects the local model directory and `inference_zero_shot` yields `tts_speech`, which can be written with `torchaudio.save`.

## CosyVoice3 prompt-format requirement

CosyVoice3 requires the literal control token `<|endofprompt|>` in either target or prompt text. A Malay reference transcript alone fails with:

```text
AssertionError: <|endofprompt|> not detected in CosyVoice3 text or prompt_text
```

Use the model-required control prefix followed by the exact reference transcript:

```python
prompt_text = (
    "You are a helpful assistant.<|endofprompt|>"
    "Hai, selamat datang ke HAFJET. Kami ada aksesori telefon dan servis repair."
)
```

The prefix is required model syntax, not an English-language instruction for the output.

## Malay quality gate

A Malay Edge-TTS Yasmin reference can be generated offline as:

```text
Hai, selamat datang ke HAFJET. Kami ada aksesori telefon dan servis repair.
```

with `ms-MY-YasminNeural`, then supplied with the matching transcript for zero-shot inference. However, CosyVoice3 does not list Malay as an official supported language. Successful WAV creation and a synthesis log are not evidence of correct Malay pronunciation. Require a human listening review before calling it acceptable.

Observed warning to record in test results:

```text
synthesis text ... too short than prompt text ..., this may lead to bad performance
```

## Deployment decision rule

Do **not** wire `/humanaudio` when any of these apply:

- Malay pronunciation has not been human-reviewed and approved.
- The model emits the short-target/reference warning and quality is uncertain.
- GPU coexistence has not been measured against the owner-managed LiveTalking session.

Keep `ms-MY-YasminNeural` Edge-TTS as live fallback. A Malay-supported TTS candidate with explicit `ms` language support is preferable for further R&D.
