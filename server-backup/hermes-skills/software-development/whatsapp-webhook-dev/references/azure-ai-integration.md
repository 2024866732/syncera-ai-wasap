# Azure AI Integration for WhatsApp Bots

## Problem
Azure App Service Linux containers do NOT have:
- Hermes CLI binary
- Local API servers (localhost:3000)
- Guaranteed fast outbound connectivity to external APIs

## Solution: HTTP-First AI Architecture

### Pattern
```python
async def ask_hermes(user_message: str, sender_name: str) -> Optional[str]:
    # Method 1: OpenRouter HTTP API (primary — works everywhere)
    if OPENROUTER_API_KEY:
        reply = await _ask_openrouter(prompt)
        if reply:
            return reply
    
    # Method 2: Hermes CLI (local dev only)
    reply = await _ask_hermes_cli(prompt)
    if reply:
        return reply
    
    # Method 3: None (caller uses default fallback)
    return None
```

### Required Environment Variables
| Variable | Example | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | OpenRouter auth key |
| `OPENROUTER_MODEL` | `openrouter/owl-alpha` | Model to use |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | API base URL |
| `AI_TIMEOUT` | `30` | Timeout in seconds |

### Required Azure App Settings
```bash
az webapp config appsettings set \
  --resource-group hafjet-bot-rg \
  --name hafjet-whatsapp-bot \
  --settings \
    OPENROUTER_API_KEY=*** \
    OPENROUTER_MODEL="openrouter/owl-alpha" \
    OPENROUTER_BASE_URL="https://openrouter.ai/api/v1" \
    AI_TIMEOUT="30"
```

### Model Selection — VERIFY BEFORE USE

**Always verify model availability for your specific key:**
```python
import urllib.request, json
url = "https://openrouter.ai/api/v1/models"
req = urllib.request.Request(url)
req.add_header("Authorization", f"Bearer {key}")
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
for m in data.get("data", []):
    p = m.get("pricing", {})
    if float(p.get("prompt", "1") or "1") == 0:
        print(f"{m['id']:50s} ctx={m.get('context_length', 0):>8d}")
```

**Recommended free models (widely available):**
| Model | Context | Notes |
|---|---|---|
| `openrouter/owl-alpha` | 1,048,756 | Best free option, huge context |
| `qwen/qwen3-coder:free` | 1,048,576 | Good for code + text |
| `google/gemma-4-26b-a4b-it:free` | 262,144 | Google model, reliable |

**⚠ Common mistake:** `google/gemini-2.0-flash-001` is DEPRECATED/UNAVAILABLE. Always verify.

### Graceful Degradation
The caller (`generate_reply()`) must always have a default fallback:
```python
ai_reply = await ask_hermes(message, sender_name)
if ai_reply:
    return ai_reply
# Fallback — webhook never breaks
return "Terima kasih! Sila tulis *menu* untuk pilihan."
```
### Azure Free Tier Network Issues

- External API calls may hang or timeout (>30s)
- Set aggressive **fail-fast** timeouts for AI calls — do NOT use single `timeout=30` value
- Always have default fallback — never let AI timeout break the webhook
- If AI is consistently slow, consider upgrading to Basic tier

### Fail-Fast Timeout Pattern (REQUIRED)

The single `timeout=30` does NOT fail fast on network issues. Use granular `httpx.Timeout()`:

```python
timeout_cfg = httpx.Timeout(
    connect=5.0,   # TCP handshake — should be fast
    read=10.0,     # Time to wait for response body
    write=5.0,     # Time to send request body
    pool=5.0,      # Time to acquire connection from pool
)
async with httpx.AsyncClient(timeout=timeout_cfg) as client:
    resp = await client.post(url, json=payload, headers=headers)
```

This ensures total max wait is ~20s instead of 30s+, and network blocking is caught in 5s.

### AI Timeout Diagnosis (DON'T ASSUME — TEST)

See `references/ai-timeout-diagnosis.md` for the complete methodology. Key lesson from production: A valid API key doesn't guarantee the model is available — `google/gemini-2.0-flash-001` is deprecated (404) while the key itself is perfectly valid. Always verify model IDs against `/v1/models` for your specific key tier.
