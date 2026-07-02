# OpenRouter Free Model Verification

## Why Verify?

OpenRouter model names change frequently. Free models (`:free` suffix) may:
- Be deprecated entirely (404)
- Be rate-limited (429) — free tier quota exceeded
- Require particular account tier or API key
- Return `No endpoints found` due to model name changes

**Never assume a model name is valid** — verify before deploying.

## Verification Process

### 1. List Available Free Models

```bash
curl -s https://openrouter.ai/api/v1/models | python3 -c "
import sys, json
data = json.load(sys.stdin)
free = [m['id'] for m in data.get('data', []) if ':free' in m['id']]
print(f'Found {len(free)} free models:')
for m in free:
    print(f'  {m}')
"
```

### 2. Test a Completion (Actual API Call)

Write a Python script to test (never embed API key in shell):

```python
import urllib.request, json

API_KEY = "sk-or-..."  # From Azure App Settings or env

payload = json.dumps({
    "model": "nvidia/nemotron-3-super-120b-a12b:free",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hi, what time do you open?"}
    ],
    "max_tokens": 80
}).encode()

req = urllib.request.Request(
    "https://openrouter.ai/api/v1/chat/completions",
    data=payload,
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        print(f"Status: {resp.status}")
        print(f"Reply: {content}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"Error {e.code}: {body[:300]}")
```

### 3. Key Indicators

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Model works | Use it |
| 404 | Not found / deprecated | Try next model |
| 429 | Rate limited | Wait 1 min, retry, or choose different model |
| 401 | Invalid key | Check Azure App Settings |
| 402 | Insufficient credits | Add credit or use free model |

### 4. Verified Working Free Models (July 2026)

| Model | Status | Notes |
|-------|--------|-------|
| `nvidia/nemotron-3-super-120b-a12b:free` | ✅ Works | 120B params, good for Malay/English chat |
| `liquid/lfm-2.5-1.2b-instruct:free` | ✅ Works | Small (1.2B), fast but limited |
| `openai/gpt-oss-120b:free` | ⚠️ 429 common | 120B model via Cerebras, rate limits heavy |
| `qwen/qwen3-coder:free` | ⚠️ 429 common | Good coder, rate-limited |
| `meta-llama/llama-3.3-70b-instruct:free` | ⚠️ 429 | Rate-limited via Venice |

### 5. Rate Limit Handling

Free models have ~20 req/min and ~50 req/day limits. Always:

1. **Log 429 explicitly** — distinguish from other errors
2. **Return fallback message** — never crash or hang
3. **Consider fallback chain** — try model A, on 429 try model B

```python
if resp.status_code == 429:
    log.warning("Rate limited — switching to fallback message")
    return FALLBACK_MESSAGE
```

### 6. Historical Lessons

- `openrouter/owl-alpha` does NOT exist as of Jul 2026 (404 - No endpoints found)
- `deepseek/deepseek-chat-v3-0324:free` — no longer free (404 - use paid slug instead)
- `deepseek/deepseek-r1:free` — same, no longer free
- Many Google/Gemma models are 429 locked due to rate limits
- Free model availability changes WEEKLY — re-verify before long-term deployments