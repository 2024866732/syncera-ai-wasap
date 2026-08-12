# HAFJET Content Image Generation — Google AI Studio (Aug 2026)

## Decision
- **Use**: Google Gemini image via `GOOGLE_API_KEY` (AI Studio / Generative Language API).
- **Do not use by default**: xAI (`XAI_API_KEY` often missing); OpenRouter image endpoints (credits 402 observed) even if OpenRouter chat works for captions.

## Never collect keys in chat
- Keys only in `~/.hermes/.env` and `~/.n8n/.env`.
- If Tuan Hafizi asks “bagi API key kat sini?” → **No** — edit server env only.

## Content API
- Service: `~/.n8n/content-api/app.py` · port `9119` · unit `hafjet-content-api.service`
- `POST /api/generate-image` body: `{ "prompt" | "visual_prompt": "..." }`
- Header: `X-API-Key: <CONTENT_API_TOKEN>`
- Success: `{ success, image_url, filename, mime, bytes, model, provider: "google-ai-studio" }`
- Files: `~/.n8n/content-api/static/images/<ts>_<id>.png`
- Internal URL: `http://host.docker.internal:9119/static/images/<file>`

## Google call shape
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=GOOGLE_API_KEY
{
  "contents": [{"parts": [{"text": "Generate one square photo... Scene: <visual_prompt>"}]}],
  "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
}
```
Parse `candidates[0].content.parts[].inlineData|{mimeType,data}` (base64).

### Models observed on key (listModels)
- `gemini-2.5-flash-image` (generateContent)
- `gemini-3.1-flash-image` / `lite` / `preview`
- `gemini-3-pro-image` (+ preview)
- Imagen `predict` models may 404 for new users

Default try order in content-api: configured `CONTENT_IMAGE_MODEL` → `gemini-2.5-flash-image` → 3.1 flash lite/image variants.

## n8n wiring
1. Generate Content (`/api/generate`)
2. Generate Image (Gemini) → `/api/generate-image` · **continueOnFail**
3. Merge Content + Image (Code)
4. IF `image_success`
   - true: HTTP GET `image_url` as **file** → Telegram **sendPhoto** + caption + inline keyboard
   - false: Telegram **sendMessage** text draft + same keyboard
5. Approve checklist includes `image_url` when present

## Pitfalls
| Symptom | Cause | Action |
|---------|--------|--------|
| 429 on all image models | Google quota/billing | Keep text fallback; fix billing/quota; don't tear down pipeline |
| n8n `$env.CONTENT_API_TOKEN` empty | `N8N_BLOCK_ENV_ACCESS_IN_NODE` not false / env not in container | Fix compose + recreate |
| `host.docker.internal` ENOTFOUND | missing `extra_hosts: host-gateway` | Add to compose, recreate |
| Photo never shows, only text | Image node fail OR sendPhoto by non-public URL | Download binary in n8n then upload |
| Schedule fires while testing image | Schedule left enabled | Disable **Schedule Trigger node only** (`disabled: true`); keep workflow active for TG callbacks |

## Smoke tests
```bash
curl -sS http://127.0.0.1:9119/health   # google:true, image_provider:google-ai-studio
curl -sS -X POST http://127.0.0.1:9119/api/generate-image \
  -H "Content-Type: application/json" -H "X-API-Key: $CONTENT_API_TOKEN" \
  -d '{"prompt":"phone repair bench, no text"}'
```

## Related
- Brand/HITL spec: `references/hafjet-content-automation-spec.md`
- Phase 1 ops/publish SQLite: `references/hafjet-content-phase1-ops.md`
