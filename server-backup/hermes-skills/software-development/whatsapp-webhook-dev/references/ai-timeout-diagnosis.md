# AI Timeout Diagnosis for WhatsApp Webhook on Azure

Diagnosis and resolution for external AI API calls (OpenRouter, OpenAI, etc.) timing out or hanging when deployed to Azure App Service.

## Symptoms

- Webhook POST received (visible in logs) but NO reply sent
- No error logs — async handler still waiting for external API
- `az webapp log tail` shows no new entries after the webhook
- OpenRouter/API call works from local machine but hangs from Azure

## Root Causes

1. **Azure Free F1 tier outbound network restrictions** — Some external IPs/ports are throttled or blocked
2. **DNS resolution delays** — Linux containers in Azure may have slow DNS for external domains
3. **AI provider rate limiting** — Free tiers may reject or slow down requests from datacenter IPs
4. **No fail-fast timeout** — Default httpx timeout (30s) too generous, blocks webhook response

## Diagnostic Steps

### Step 1: Test API connectivity from local
```bash
# Test key validation
curl -s https://openrouter.ai/api/v1/key

# Test model availability
curl -s https://openrouter.ai/api/v1/models | python3 -m json.tool | grep -i "owl-alpha"

# Test chat completion with short timeout
curl -s --connect-timeout 5 --max-time 10 \
  https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openrouter/owl-alpha","messages":[{"role":"user","content":"hi"}],"max_tokens":50}' \
  -w "\nHTTP %{http_code} | Time: %{time_total}s\n"
```

### Step 2: Test from Azure Kudu console
```bash
curl -v --connect-timeout 5 https://openrouter.ai/api/v1/key
```

### Step 3: Interpret results

| Result | Meaning | Action |
|--------|---------|--------|
| `curl: (28) Operation timed out` | Network blocked by Azure | Use fail-fast timeout, always have fallback |
| `HTTP 401` | Key invalid/expired | Check Azure App Settings |
| `HTTP 404` | Model name wrong | Verify model via `/api/v1/models` |
| `HTTP 429` | Rate limited | Backoff or switch provider |
| `HTTP 503` | Provider down | Use fallback reply |
| `HTTP 200` (from Kudu) | Network OK, code issue | Check httpx timeout config in code |
| `HTTP 200` (from local, timeout from Kudu) | Azure-specific block | Consider proxy or switch provider |

## Fail-Fast Timeout Pattern

```python
import httpx

timeout_cfg = httpx.Timeout(
    connect=5.0,   # Max 5s to establish TCP connection
    read=10.0,    # Max 10s to receive response
    write=5.0,    # Max 5s to send request
    pool=5.0,     # Max 5s to get connection from pool
)

async with httpx.AsyncClient(timeout=timeout_cfg) as client:
    resp = await client.post(url, json=payload, headers=headers)
```

## Model Verification Checklist

Before deploying AI-powered bot:

1. `curl -s https://openrouter.ai/api/v1/key` → Check `status: Active`, credits > 0
2. `curl -s https://openrouter.ai/api/v1/models | python3 -m json.tool` → Verify target model exists
3. Test actual chat call with `max_tokens=50` → Confirm response format and speed
4. Set `OPENROUTER_MODEL` env var (not hardcoded) → Enable model switching without deploy

## Azure Log Streaming Workaround

`az webapp log tail` often shows stale output. Use download instead:

```bash
# Download all logs as zip
az webapp log download --resource-group <rg> --name <app> --log-file /tmp/app_logs.txt

# Extract and read
cd /tmp && python3 -c "
import zipfile
with zipfile.ZipFile('app_logs.txt', 'r') as z:
    z.extractall('logs')
    import os
    for root, dirs, files in os.walk('logs'):
        for f in files:
            if 'containerStream' in f and f.endswith('.log'):
                path = os.path.join(root, f)
                print(f'\\n=== {path} ===')
                with open(path) as lf:
                    lines = lf.readlines()
                    for line in lines[-30:]:
                        print(line.rstrip())
"
```

## Real-World Resolution (June 2026)

**Outcome:** OpenRouter API confirmed unreachable from Azure Free F1 tier — `curl` from Kudu hangs indefinitely. Not a code bug, not a key issue, not a model name issue. The bot's fallback chain (canonical greeting → static menu → default response) handles all production traffic correctly without AI. AI enhancement is deferred until Basic tier or alternative hosting.

**Key takeaway:** The fallback chain is NOT a degraded mode — it IS the production mode for Free tier deployments. AI is a bonus layer that works when network permits.
