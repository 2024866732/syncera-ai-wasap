# WhatsApp Voice / Audio Clip Integration (v2.2.1+)

Send voice audio to WhatsApp users as a complement to text replies. Meta Cloud
API supports `"type": "audio"` when the audio is hosted at a **publicly
accessible HTTPS URL**. This reference covers the pre-rendered approach used for
HAFJET VoxCPM2 integration — generate clips offline, serve via FastAPI
StaticFiles, and send via Graph API.

## Why pre-rendered (not live generation per reply)

Live TTS on a CPU server is too slow for webhook timeouts. VoxCPM2 measured
~4.5 minutes for a single 3.2-second clip on the PC Office i3. Pre-render fixed
clips (greeting, menu, location, contact) and serve them as static files. Dynamic
AI replies stay text-only in Layer 1.

## Meta Graph API payload — `type: audio`

```python
payload = {
    "messaging_product": "whatsapp",
    "to": "60123456789",
    "type": "audio",
    "audio": {"link": "https://your-domain.com/audio/greeting.wav"},
}
```

- `link` **MUST be HTTPS**, publicly reachable, no auth.
- Meta fetches the file once and caches it; subsequent sends even from different
  phone numbers reuse the cached media.
- Supported formats: WAV, MP3, OGG. VoxCPM2 generates 48 kHz WAV natively.
- There is **no inline base64 mode** — always a public URL.

## Serving clips from FastAPI

Mount a `StaticFiles` directory at the same domain as the webhook:

```python
from fastapi.staticfiles import StaticFiles

_VOICE_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "assets", "audio")
if os.path.isdir(_VOICE_AUDIO_DIR):
    app.mount("/audio", StaticFiles(directory=_VOICE_AUDIO_DIR), name="voice_audio")
```

Clips are served at `https://<your-domain>/audio/<filename>.wav`.

The mount is **conditional** (`if os.path.isdir`) so the app starts cleanly on
Azure even if the directory was not created yet.

## Env var: `VOICE_PUBLIC_BASE_URL`

The code uses one env var to build the absolute public link:

```python
VOICE_PUBLIC_BASE_URL = os.getenv("VOICE_PUBLIC_BASE_URL", "")
```

This **must** be set in Azure App Settings (not `.env` on Azure) to the bot's
public URL, e.g. `https://hafjet-bot.azurewebsites.net`.

If the var is unset, voice sending is silently skipped — the text reply still
goes through. Voice is an enhancement, never a requirement for the bot to work.

## Clean helper: `build_whatsapp_audio_payload()`

```python
import json, urllib.parse
from typing import Optional

def build_whatsapp_audio_payload(to_number: str, public_base_url: str, clip_filename: str) -> Optional[str]:
    if not public_base_url or not public_base_url.startswith(("http://", "https://")):
        return None
    safe_url = f"{public_base_url.rstrip('/')}/audio/{urllib.parse.quote(clip_filename)}"
    return json.dumps({"messaging_product": "whatsapp", "to": to_number, "type": "audio", "audio": {"link": safe_url}})
```

Rejects empty/malformed base URLs → `None`. The caller logs a warning and
falls back to text-only reply.

## `send_whatsapp_audio()` async helper

Mirrors the existing `send_whatsapp_audio()` pattern — reuses the same
`WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` and the same `httpx.AsyncClient`
error-handling structure (log, return bool, never crash the webhook).

## Clip routing via `get_voice_clip()`

```python
VOICE_CLIPS = {"greeting": "greeting.wav", "menu": "menu.wav", ...}
def get_voice_clip(intent: str) -> Optional[str]:
    return VOICE_CLIPS.get(intent)
```

In `_process_message()`, after `send_whatsapp_message()` succeeds:

```python
if reply_text:
    await send_whatsapp_message(from_number, reply_text)
    _voice_clip = get_voice_clip(user_message.lower().strip())
    if _voice_clip:
        await send_whatsapp_audio(from_number, _voice_clip)
```

The user gets the text first, then the pre-rendered voice clip right after.
If voice sending fails, the text was already delivered — no user-visible
breakage.

## Brand pronunciation fix (TTS-specific)

VoxCPM2 pronounces `HAFJET` as "half-jad." Always use **`HAF JET`**
(with a space) in the text sent to the TTS model. A one-line normalizer:

```python
def normalize_tts_text(text: str) -> str:
    return text.replace("HAFJET", "HAF JET")
```

This lives in `voice_reply.py`, used by the content generator script but NOT
by the live webhook handler (which never generates TTS).

## File structure (what ships to Azure)

```
bots/hafjet-azure/
  voice_reply.py          # helpers (normalize, clip map, payload builder)
  webhook_listener.py     # +send_whatsapp_audio, StaticFiles mount
  assets/audio/
    README.md             # clip manifest (exact text per clip)
    *.wav                 # git-ignored; generated offline by Tuan
  scripts/
    generate_voxcpm_content.py  # run on PC Office to produce assets/audio/*.wav
```

## Pitfalls

- **Meta does NOT accept redirects for audio links.** The URL must serve the
  file directly (200 OK, no 301/302).
- **File size matters.** WhatsApp plays audio inline up to ~16 MB. VoxCPM2
  48 kHz WAV clips are ~300 kB for a short greeting — well within limits.
- **Cold start on Azure Free tier.** The `/audio` mount may take seconds
  on first request after idle. Meta fetches async so this is fine, but monitor.
- **Do NOT generate TTS inside the webhook handler.** Even a short text would
  block the event loop for minutes. Keep generation as a separate offline step
  on PC Office.
