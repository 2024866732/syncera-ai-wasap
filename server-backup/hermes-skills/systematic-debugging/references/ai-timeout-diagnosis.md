# AI Timeout Diagnosis — Azure App Service

Diagnosing external AI API call failures (OpenRouter, OpenAI, etc.) from Azure App Service.

## Symptom

- Webhook received (200 OK from Meta) but no reply sent
- No error logs visible (async handler still waiting)
- `/health` shows `configured: true`
- `az webapp log tail` shows stale output

## Root Cause Investigation Flow

### Step 1: Verify Network Connectivity from Azure

From Kudu console orPSCm terminal:
```bash
# Test 1: DNS resolution + TLS handshake
curl -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s\n" \
  --connect-timeout 5 \
  https://api.openrouter.ai/api/v1/key

# Test 2: Full API call with your key
curl -s https://api.openrouter.ai/api/v1/key \
  -H "Authorization: Bearer YOUR_KEY" \
  -w "\nHTTP %{http_code}" | head -5

# Step 3: Verify model availability
curl -s https://api.openrouter.ai/api/v1/models \
  -H "Authorization: Bearer YOUR_KEY" \
  | python3 -c "import sys,json; [print(m) for m in json.load(sys.stdin)['data'][:5]]"
```

### Step 2: Test from Local Machine

```bash
# Compare response time from local vs Azure
time curl -s https://api.openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openrouter/owl-alpha","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' \
  -o /dev/null
```

### Step 3: Check API Key Validity

```bash
curl -s https://openrouter.ai/api/v1/key | python3 -m json.tool
```

**Interpret response:**

| Field | Meaning |
|-------|---------|
| `data.key` valid + `data.credits` > 0 | ✅ Key OK, proceed to model check |
| `data.key` valid + `data.credits` = 0 | ⚠️ Key OK but no credits — check rate limits |
| `HTTP 401` | ❌ Key expired/regenerated — regenerate in Meta portal |
| `HTTP 429` | ⏱️ Rate limit hit — back off or queue |
| `HTTP 503` | 🔧 Service unavailable — try again later |
| `curl exit 28` | 🚫 Network blocked — Azure outbound restriction |

### Step 4: Verify Model Name

Common mistake: model name from documentation may be deprecated for your key tier.

```bash
# List available models
curl -s https://openrouter.ai/api/v1/models | python3 -c "
import sys,json
data = json.load(sys.stdin)['data']
for m in data:
    print(f\"{m['id']:50} context: {m.get('context_length', '?')}\")
"
```

| Result | Action |
|--------|--------|
| Model found in list | ✅ Use this exact model name |
| Model NOT in list | ❌ Deprecated — switch to available model |

### Step 5: Interpret HTTP Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Good — check response body for actual reply |
| 401 | Unauthorized | Check API key in Azure App Settings |
| 402 | Payment required / credits exhausted | Top up or switch to free model |
| 404 | No endpoints found for model | Wrong model name — verify via API |
| 429 | Rate limited | Back off, reduce concurrency, or queue |
| 503 | Service unavailable | External issue — use fallback |
| Timeout (exit 28) | Network blocked | Azure network issue — use fail-fast |

## Fail-Fast Code Pattern

```python
import httpx

timeout_cfg = httpx.Timeout(
    connect=5.0,   # Max 5s to establish connection
    read=10.0,     # Max 10s to read response
    write=5.0,     # Max 5s to send request
    pool=5.0,      # Max 5s to get connection from pool
)
async with httpx.AsyncClient(timeout=timeout_cfg) as client:
    resp = await client.post(url, json=payload, headers=headers)
```

**Why this matters:** Default `httpx.Timeout(30)` applies 30s to the ENTIRE request. If the server is slow to respond, the webhook blocks for 30s, causing Meta to retry delivery (duplicate messages).

## Azure Log Analysis for AI Issues

After deployment, check logs for:
```
[INFO] 🤖 Routing to Hermes AI: '...'
[ERROR] ⏱ OpenRouter API timeout (fail-fast triggered)
[WARNING] ⚠ AI fallback — using default response
```

If you see timeout errors consistently:
1. Verify network from Kudu (Step 1 above)
2. Check model name exists (Step 4 above)
3. Upgrade to paid tier if network is restricted
4. Reduce `max_tokens` in payload for faster response
5. Switch to lighter model (e.g., `google/gemma-4-26b-a4b-it:free` vs `owl-alpha`)

If you see 401/402:
1. Re-check API key in Azure App Settings
2. Check credits via `/api/v1/key` endpoint
3. Rotate key if expired
