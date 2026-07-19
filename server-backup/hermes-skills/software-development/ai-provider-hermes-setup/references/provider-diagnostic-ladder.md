# Provider Diagnostic Ladder (tested 2026-07-18, HAFJET server)

When a new LLM provider fails in Hermes, do NOT trust `hermes chat` error text alone
(it may name a wrong/default model and hide the real cause). Isolate the key + endpoint
with a direct `urllib` probe. Write the probe to `/tmp/*.py` (don't run `-c` one-liners
that need approval each time).

## Reusable probe pattern

```python
import urllib.request, json, re
# 1) Get the key the user set (paste, or source from config.yaml / .env)
KEY = re.search(r'api_key:\s*(\S+)', open('/home/hafizi145/.hermes/config.yaml').read()).group(1)
URL = 'https://<provider>/v1/chat/completions'

def probe(key, model, timeout=45):
    body = json.dumps({'model': model, 'messages': [{'role': 'user', 'content': 'OK'}]}).encode()
    req = urllib.request.Request(URL, data=body,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        print('STATUS', r.status, r.read()[:200].decode())
    except urllib.error.HTTPError as e:
        print('HTTP_ERR', e.code, e.read()[:160].decode())
    except Exception as e:
        print('ERR', type(e).__name__, str(e)[:100])

# 2) Dummy key FIRST — proves server + auth layer reachable (network OK)
probe('dummy', '<model>', timeout=20)
# 3) Real key
probe(KEY, '<model>', timeout=50)
```

## Reading the results

| Observation | Meaning | Action |
|---|---|---|
| dummy → `401` / real → `401` | Server reachable, **key invalid/expired** | Re-check key length (no `...` truncation) |
| dummy → `401` / real → **timeout** | **Auth PASSED**, model slow/queued | NOT a key problem; model unusable for agent loops |
| real → `400` "not a valid model ID" | Connection works, **wrong model name** | Fix model ID |
| real → `403` "no access to model X" | Key valid, **tier lacks that model** | Use free-tier model or upgrade plan |
| any → `403 error 1010` (Cloudflare) | **IP banned** (network) | Switch provider (e.g. Groq banned here) |

## Real examples from this server

- **Groq** (`api.groq.com`): real key → `403 error 1010` → IP banned. Don't use direct.
- **TokenRouter** (`api.tokenrouter.com/v1`): dummy → `401`, real `z-ai/glm-5.2-free` →
  **timeout 200s** (auth passed, free tier congested). real `z-ai/glm-5.2` → `403` (free key).
- **DeepSeek direct** (`api.deepseek.com/v1`): dummy → `401`, real `deepseek-v4-pro` →
  `200` ~7s. VERIFIED WORKING.
- **OpenRouter** (`openrouter.ai/api/v1`): NOT banned, routes DeepSeek/Llama. Key in `.env`.
