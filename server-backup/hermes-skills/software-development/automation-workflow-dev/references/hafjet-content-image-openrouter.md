# HAFJET Content Image — OpenRouter path (current, Aug 2026)

## Why OpenRouter (not xAI / not Google-first)
- **xAI**: often no `XAI_API_KEY` on host; do not paste keys in chat.
- **Google AI Studio**: `GOOGLE_API_KEY` may exist but image models frequently **429 quota**.
- **OpenRouter**: captions already use OR; image works via **chat completions + modalities** when `/v1/images` is credit-blocked.

## Production endpoint (content-api)
```http
POST http://host.docker.internal:9119/api/generate-image
X-API-Key: <CONTENT_API_TOKEN>
Content-Type: application/json

{"prompt":"<visual_prompt>","aspect_ratio":"1:1"}
```

Implementation: `~/.n8n/content-api/app.py` · systemd `hafjet-content-api.service`.

## Working OpenRouter call shape
```json
POST https://openrouter.ai/api/v1/chat/completions
{
  "model": "google/gemini-2.5-flash-image",
  "messages": [{
    "role": "user",
    "content": "Generate a single high-quality square marketing photo. No text overlay. Scene: ..."
  }],
  "modalities": ["image", "text"],
  "max_tokens": 2048
}
```

Response: `choices[0].message.images[0].image_url.url` as `data:image/png;base64,...`  
content-api saves file → `static/images/<ts>_<id>.png` → returns `image_url` for n8n.

## Pin list (do not chain random Flux)
1. `google/gemini-2.5-flash-image` (**primary**)
2. Avoid defaulting to `black-forest-labs/flux.*` for `modalities: image,text` — many return **404 no endpoints for those modalities**.

## Failure modes
| Code | Meaning | Agent action |
|------|---------|----------------|
| **402** on `/v1/images` | Image-credits path empty | Use chat+modalities path |
| **402** on chat “requested ~29k tokens, can afford N” | Default max_tokens too high | Set **`max_tokens: 2048`** (proven fix) |
| **404** flux + modalities | Model not image-capable that way | Remove from chain; pin Gemini image |
| **502** from content-api | Upstream OR failed after retries | n8n **continueOnFail** → text draft |

## n8n requirements
- Image HTTP node: `continueOnFail: true`, `onError: continueRegularOutput`, timeout ≥ 180s
- Merge Code: see `n8n-code-node-runonce-foreach-pitfall.md` (return object, not array)
- Photo: download binary from `host.docker.internal:9119/static/...` then Telegram sendPhoto (URL not public to TG CDN)

## Ops checks
```bash
curl -s http://127.0.0.1:9119/health
# expect image_provider=openrouter, image_model=google/gemini-2.5-flash-image

# smoke image (needs OPENROUTER_API_KEY + credits)
curl -sS -X POST http://127.0.0.1:9119/api/generate-image \
  -H "X-API-Key: $CONTENT_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"phone on desk, no text"}'
```

## Cost note
~1 image per draft; New Visual = +1. Monitor OpenRouter balance — when credits die, fallback text must still ship (Merge fix is mandatory).