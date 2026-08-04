# Hermes Cron Job for HAFJET Content Generation

**Session:** 2026-08-02 to 2026-08-04  
**Status:** Tested & Working (with prompt refinement needed)

---

## Cron Job Created

| Field | Value |
|-------|-------|
| **Job ID** | `66795abdaf9a` |
| **Name** | `hafjet-content-generator` |
| **Schedule** | `1d` (once in 1d — manual trigger via `/api/cron/fire`) |
| **Provider** | `xai-oauth` (falls back to DeepSeek → Nemotron) |
| **Model** | `grok-4.5` (pinned) |
| **Deliver** | `local` |
| **Prompt** | See template below |

---

## Trigger Endpoint

```
POST http://host.docker.internal:8787/api/cron/fire
Headers:
  Authorization: Bearer <HERMES_API_KEY>
  Content-Type: application/json
Body:
{
  "job_id": "66795abdaf9a",
  "payload": {
    "topic": "...",
    "platform": "threads|instagram|tiktok",
    "tone": "santai_kelantan",
    "content_type": "caption|image_prompt|script",
    "additional_context": "..."
  }
}
```

**Hermes API Key:** From `config.yaml` → `providers.fallback_providers[0].api_key` (sk-b5d... or sk-or-...)

---

## Test Results (2026-08-04)

### Successful Run Output
```json
{
  "success": true,
  "content": {
    "option_1": "Rosak skrin iPhone? Jangan risau, HAFJET di Raub ada pakar selamatkan goni anda! 📱✨ Pakai part asli, garansi 3 bulan, process cepat tak sampai 1 jam. Cubalah rasa tenang balik guna phone tanpa retak-retak. WhatsApp kami: wa.me/60198021500",
    "option_2": "Battery cepat habis? Phone panas macam nak meletup? Datang je HAFJET Raub, kami swap battery baru original, harga bersahabat, tak paksa beli barang mahal. Santosai kami, puas hati pelanggan. Hubungi: wa.me/60198021500"
  },
  "image_prompt": "A friendly phone repair shop in Raub, Pahang - cozy interior with HAFJET branding, technician repairing iPhone screen with professional tools, warm lighting, Malaysian local shop vibe, clean and trustworthy atmosphere",
  "hashtags": ["#HAFJET", "#Raub", "#PhoneRepair", "#iPhoneRepair", "#RaubPahang", "#TeknisiHandphone", "#OriginalParts"],
  "character_count": 187,
  "platform": "threads",
  "tone": "santai_kelantan"
}
```

### Issues Found
1. **Model fallback** — xAI OAuth doesn't support direct API calls; fell back to DeepSeek → Nemotron
2. **Payload variables NOT interpolated** — prompt used literal `{{topic}}` etc.
3. **Output schema correct** but need proper variable substitution

---

## Corrected Prompt Template (for v2)

```markdown
You are HAFJET Content Generator. Read payload from session context variables: topic, platform, tone, content_type, additional_context. Output ONLY valid JSON:

{
  "success": true,
  "content": {
    "option_1": "caption 1",
    "option_2": "caption 2"
  },
  "image_prompt": "prompt for image",
  "hashtags": ["#tag1", "#tag2"],
  "character_count": 150,
  "platform": "threads",
  "tone": "santai_kelantan"
}

Brand: HAFJET Raub, phone repair. CTA: wa.me/60198021500. Tone: casual Kelantan dialect (sohor, goni, pacak megah, santosai). No hard sell. Normalize problems. 2 caption options under 2200 chars each.
```

---

## n8n HTTP Request Node Config

```yaml
URL: http://host.docker.internal:8787/api/cron/fire
Method: POST
Headers:
  Authorization: Bearer {{ $credentials.Hermes_API }}
  Content-Type: application/json
Body (JSON):
  {
    "job_id": "{{ $vars.CRON_JOB_ID }}",
    "payload": {
      "topic": "={{ $json.topic }}",
      "platform": "={{ $json.platform }}",
      "tone": "santai_kelantan",
      "content_type": "caption",
      "additional_context": "={{ $json.context }}"
    }
  }
Options:
  Response Format: JSON
  Timeout: 300000ms
```

**n8n Secure Storage:**
- Credentials → Header Auth: `Hermes_API` → `Authorization: Bearer <KEY>`
- Workflow Variables: `CRON_JOB_ID` = `66795abdaf9a`

---

## Error Handling & Fallback

| Error | Handling |
|-------|----------|
| Timeout / 5xx | Retry 2x (5s, 15s) via n8n node settings |
| 401 Auth | Alert owner, check API key |
| 404 Job | Verify job_id, recreate |
| Invalid JSON | Log raw response, retry once |
| **Fallback** | Create OpenRouter cron job: `--provider openrouter --model x-ai/grok-2-latest` |

### Fallback Cron Job
```bash
hermes cron create "1d" "<SAME_PROMPT>" --name "hafjet-content-generator-fallback" --provider "openrouter" --model "x-ai/grok-2-latest" --deliver local
```

---

## Key Learnings

1. **Schedule syntax:** Use `1d` (one-shot duration), NOT `once in 1min`
2. **Port 8787** is Hermes gateway (not 9119)
3. **xAI OAuth ≠ xAI API** — SuperGrok OAuth doesn't work for programmatic API calls
4. **Payload interpolation** requires prompt that reads session context variables
5. **Model pinning** with `--provider xai-oauth --model grok-4.5` works but falls back if API not supported
6. **Authentication:** Cron fire endpoint requires `Authorization: Bearer <HERMES_API_KEY>` from config.yaml
7. **Deliver: local** keeps output in `~/.hermes/cron/output/<job_id>/` — no Telegram delivery during test

---

## Next Steps

1. Create v2 cron job with corrected prompt (variable interpolation)
2. Test v2 with payload via `hermes cron run <new_id>`
3. Update n8n node with new job_id
4. Test end-to-end from n8n
5. Create fallback OpenRouter cron job
6. Integrate with approval flow (Telegram buttons)