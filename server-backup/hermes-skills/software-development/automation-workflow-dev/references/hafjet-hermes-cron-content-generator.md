# HAFJET Content Generator — Hermes Cron Job Integration

Complete reference for generating HAFJET social media content via Hermes cron jobs, using xAI OAuth (SuperGrok) without a separate xAI API key.

---

## Architecture Overview

```
n8n workflow → HTTP POST → Hermes /api/cron/fire
                                    ↓
                            Cron job triggers agent
                                    ↓
                            Agent uses xAI OAuth (provider: xai-oauth, model: grok-4.5)
                                    ↓
                            Returns structured JSON to n8n
                                    ↓
                            n8n parses → approval flow → publish
```

---

## Prerequisites

- Hermes running on port 8787 (gateway)
- xAI OAuth authenticated in Hermes config (`provider: xai-oauth`)
- Model `grok-4.5` available via OAuth
- n8n can reach `http://host.docker.internal:8787`
- Hermes API key from `~/.hermes/config.yaml` → `gateway.api_key`

---

## 1. Create Content Generation Cron Job

```bash
# On HAFJET-Hermes-Server
hermes cron create "once in 1min" \
  --name "hafjet-content-generator" \
  --provider "xai-oauth" \
  --model "grok-4.5" \
  --prompt "$(cat /home/hafizi145/.hermes/skills/automation-workflow-dev/templates/hafjet-content-system-prompt.txt)" \
  --deliver local
```

**Key flags:**
- `once in 1min` — manual trigger schedule (runs once, then we trigger via API)
- `--deliver local` — output returned to API caller, not sent to Telegram
- `--provider xai-oauth` — uses SuperGrok OAuth (no API key needed)
- `--model grok-4.5` — pinned to avoid config drift errors

---

## 2. Get Required IDs & Keys

```bash
# Get cron job ID
hermes cron list | grep hafjet-content-generator
# Output: ID: a1b2c3d4e5f6... Name: hafjet-content-generator
# Copy the ID (first 12+ chars)

# Get Hermes API key
grep -A 3 "gateway:" ~/.hermes/config.yaml | grep api_key
# Output: api_key: "sk-xxx..."
```

---

## 3. n8n HTTP Request Node Configuration

| Field | Value |
|-------|-------|
| **Name** | Generate Content (Hermes) |
| **Method** | POST |
| **URL** | `http://host.docker.internal:8787/api/cron/fire` |
| **Authentication** | None (header manual) |
| **Headers** | `Authorization: Bearer <HERMES_API_KEY>`<br>`Content-Type: application/json` |
| **Body Content Type** | JSON |
| **Body** | See JSON template below |
| **Options** | Response Format: JSON<br>Timeout: 300000ms (5 min)<br>Retry On Fail: 2x, 5000ms interval |

### Body JSON Template

```json
{
  "job_id": "<CRON_JOB_ID>",
  "payload": {
    "topic": "={{$json.topic}}",
    "platform": "={{$json.platform}}",
    "tone": "santai_kelantan",
    "content_type": "caption",
    "additional_context": "={{$json.context}}"
  }
}
```

---

## 4. System Prompt Template

Save to `templates/hafjet-content-system-prompt.txt`:

```markdown
You are HAFJET Content Generator, an AI that creates social media content for HAFJET (mobile phone repair & gadget shop in Raub, Pahang, Malaysia).

BRAND IDENTITY:
- Name: HAFJET
- Location: Raub, Pahang, Malaysia
- Services: Phone repair, screen replacement, battery, water damage, data recovery, accessories
- Tone: Santai, mesra, jujur, lokal (Kelantan dialect), TAK hard-sell
- CTA: wa.me/60198021500 (WhatsApp)
- Platforms: Threads, Instagram Feed, Instagram Story, TikTok

OUTPUT FORMAT (WAJIB JSON):
{
  "success": true,
  "content": {
    "option_1": "Caption option 1 dengan emoji & hashtags",
    "option_2": "Caption option 2 dengan emoji & hashtags"
  },
  "image_prompt": "Detailed visual prompt untuk generate image (SuperGrok/grok-2-image)",
  "hashtags": ["#HAFJET", "#Raub", "#PhoneRepair", ...],
  "character_count": 180,
  "platform": "threads|instagram|tiktok",
  "tone": "santai_kelantan"
}

INPUT VARIABLES (dari n8n payload):
- {{topic}}: Tajuk content (contoh: "Delay Pickup Series Post 1")
- {{platform}}: threads / instagram / tiktok
- {{tone}}: santai_kelantan / professional / casual
- {{content_type}}: caption / image_prompt / script
- {{additional_context}}: Maklumat tambahan

RULES:
1. SELALU output JSON sahaja, takde text lain
2. Caption: 2 option, masing-masing < 2200 char (Instagram limit)
3. Guna Bahasa Melayu santai + Kelantan dialect (sohor, goni, pacak megah, bersenggoti)
4. Jangan hard-sell. Normalize masalah. "Takpe, kawan. Phone rosak biasa je."
5. CTA selalu: "WhatsApp kami: wa.me/60198021500"
6. Hashtags: 8-12 tag, mix brand + location + niche
7. Image prompt: detailed, photographic style, real phone repair scene
```

---

## 5. Test Commands

```bash
# Test cron job trigger from terminal
curl -X POST http://localhost:8787/api/cron/fire \
  -H "Authorization: Bearer <HERMES_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "<CRON_JOB_ID>",
    "payload": {
      "topic": "Delay Pickup Series Post 1 - Awareness",
      "platform": "threads",
      "tone": "santai_kelantan",
      "content_type": "caption",
      "additional_context": "Customer takut ambil phone sebab takut data hilang. HAFJET jamin data selamat."
    }
  }'
```

**Expected response (JSON):**
```json
{
  "success": true,
  "content": {
    "option_1": "Takpe kawan, phone rosak biasa je... 📱🔧 #HAFJET #Raub",
    "option_2": "Sohor takut data hilang? Kami jamin selamat..."
  },
  "image_prompt": "Professional photo of phone repair technician...",
  "hashtags": ["#HAFJET", "#Raub", "#PhoneRepair", ...],
  "character_count": 180,
  "platform": "threads",
  "tone": "santai_kelantan"
}
```

---

## 6. Fallback Cron Job (OpenRouter via Hermes)

If xAI OAuth has issues:

```bash
hermes cron create "once in 1min" \
  --name "hafjet-content-generator-fallback" \
  --provider "openrouter" \
  --model "x-ai/grok-2-latest" \
  --prompt "$(cat /home/hafizi145/.hermes/skills/automation-workflow-dev/templates/hafjet-content-system-prompt.txt)" \
  --deliver local
```

In n8n, add a second HTTP Request node (or use Error Trigger) pointing to the fallback job_id.

---

## 7. Error Handling Matrix

| Error | Detection | n8n Handling |
|-------|-----------|--------------|
| Timeout (5 min) | Node timeout / 504 | Retry 2x with exponential backoff |
| 401 Unauthorized | `{"error":"invalid token"}` | Alert owner, check API key in config.yaml |
| 404 Job Not Found | `{"error":"job not found"}` | Verify job_id, recreate job |
| JSON Parse Error | n8n JSON parse fail | Log raw response, route to fallback job |
| Model Config Drift | `success: false` in output | Pin model/provider explicitly in cron job |

---

## 8. Related Files

- `templates/hafjet-content-system-prompt.txt` — Full system prompt
- `references/hafjet-content-automation-spec.md` — Complete HAFJET brand spec
- `references/n8n-telegram-approval-workflow.md` — Telegram inline keyboard pattern
- `references/n8n-telegram-content-automation.md` — Full n8n workflow spec