---
title: AI Provider Setup for Hermes (this server)
name: ai-provider-hermes-setup
description: Configure Hermes Agent model providers on THIS server (Oracle Cloud host). Covers the Groq IP-ban dead-end, the OpenRouter fallback that works, secret-key handling guardrails (never truncate keys), and model recommendations for coding agents. Use whenever the user wants to add/switch/test an AI model provider for Hermes.
---

# AI Provider Setup for Hermes (this server)

Hermes model config lives in `/home/hafizi145/.hermes/config.yaml` (model dict: provider, base_url, default, api_key, api_mode). Secrets (OpenRouter, etc.) also live in `/home/hafizi145/.hermes/.env`. Set via `hermes config set model.<key> <value>`.

## ⚠️ GROQ IS IP-BANNED FROM THIS SERVER (hard constraint)

`api.groq.com` returns **Cloudflare HTTP 403, error code 1010** from this host — the server's egress IP is banned. A valid Groq key still fails (401/403). **Do NOT waste time trying to use Groq directly from this server.** The user's Groq key is fine; the network is the problem.

**Symptom:** `hermes chat` → `HTTP 401: Wrong API Key` (or direct curl → `403 error 1010`). The 401 is misleading — it's the IP ban, not a bad key.

**Fallback that WORKS:** **OpenRouter** (`https://openrouter.ai/api/v1`). The user already has an `OPENROUTER_API_KEY` in `.env`. OpenRouter is NOT IP-banned here and routes to DeepSeek, Llama, Qwen, etc.

## Recommended setup (verified working 2026-07-09)

```bash
# OpenRouter key is already in .env — source it, DON'T retype it
OR_KEY=$(grep -oP 'OPENROUTER_API_KEY\s*[=:]\s*\K\S+' /home/hafizi145/.hermes/.env)
hermes config set model.api_key "$OR_KEY"
hermes config set model.provider openrouter
hermes config set model.base_url https://openrouter.ai/api/v1
hermes config set model.default deepseek/deepseek-v4-pro
hermes config set model.api_mode chat_completions
```

Test: `hermes chat -q "reply OK"` → expect a clean reply, no 401/403.

### Working OpenRouter model IDs (verified)
- `deepseek/deepseek-v4-pro` ✅ — top coding model, MoE 1.6T/49B active, 1M ctx. ~$0.435/M in, $0.87/M out (cache-hit $0.0036/M). ~$3-5/mo for heavy personal use.
- `meta-llama/llama-4-scout-17b-16e-instruct` ✅ — fast, Llama 4 Scout.
- `openrouter/auto` ✅ — auto-routes.
- `groq/...` ❌ — Groq models are NOT on OpenRouter. Don't use this prefix.

To switch models live: `hermes config set model.default <id>`.

## 🔴 SECRET-KEY HANDLING GUARDRAIL (critical, learned the hard way)

When configuring a provider with an API key the user pasted into chat, **NEVER truncate the key with `...` in the `hermes config set` command.** Writing `gsk_FY...SIEY` stores the literal 13-char string `gsk_FY...SIEY` (with three real dots) as the key → every call 401s.

This happened 4 times in one session. The model auto-abstracts long secrets as `gsk_FY...SIEY` even when the real value is known. **The fix:**

1. **Source the secret from a file, never retype it.** For OpenRouter: `OR_KEY=$(grep -oP 'OPENROUTER_API_KEY\s*[=:]\s*\K\S+' /home/hafizi145/.hermes/.env) && hermes config set model.api_key "$OR_KEY"`.
2. For a key only available in chat (e.g. Groq), the user MUST paste it and you must write the **full string** with no `...`. To prevent the truncation habit, verify after setting:
   ```bash
   python3 -c "import re;s=open('/home/hafizi145/.hermes/config.yaml').read();k=re.search(r'api_key:\s*(\S+)',s).group(1);print('LEN',len(k),'HAS_DOTS', '...' in k)"
   ```
   - A correctly-stored Groq key is **56 chars, HAS_DOTS False**. If LEN==13 and HAS_DOTS True → you truncated it again, redo.
3. **Never use `...` as a placeholder in any config-set command.** The display redaction (`gsk_FY...SIEY` in `hermes config` output) is automatic — you don't need to manually abbreviate, and doing so corrupts the stored value.

## Isolation test pattern (when a provider fails)

Don't trust `hermes chat` error messages alone — they may name a wrong/default model (e.g. `gpt-oss-120b`) and obscure the real cause. Test the key + endpoint **directly**:

```bash
python3 -c "
import re, urllib.request, json
s=open('/home/hafizi145/.hermes/config.yaml').read()
k=re.search(r'api_key:\s*(\S+)',s).group(1)
print('KEY_LEN',len(k),'HEAD',k[:10],'TAIL',k[-6:])  # confirm key matches paste
req=urllib.request.Request('https://api.groq.com/openai/v1/chat/completions',
  data=json.dumps({'model':'llama-4-scout-17b-16e-instruct','messages':[{'role':'user','content':'OK'}]}).encode(),
  headers={'Authorization':'Bearer '+k,'Content-Type':'application/json'})
try:
  r=urllib.request.urlopen(req,timeout=30); print('STATUS',r.status)
except urllib.error.HTTPError as e:
  print('HTTP_ERR',e.code,e.read()[:200].decode())
"
```
- `403 error 1010` → IP banned (network), key is fine.
- `401` with correct-length key → key invalid/expired.
- `400` "not a valid model ID" → connection works, wrong model name.

## Other providers (from research, not all tested from this server)
- **DeepSeek direct** (`https://api.deepseek.com/v1`, model `deepseek-v4-pro`): pay-per-token, ~same price as OpenRouter's DeepSeek. Reachability from this server UNVERIFIED — test before relying on it. Strong choice if OpenRouter ever fails.
- **OpenCode Go** ($10/mo): 14 models (DeepSeek V4 Pro, GLM-5.2, Qwen 3.7, MiniMax M3), dollar-based limits ($60/mo, $30/wk, $12/5h), servers US/EU/SG. OpenAI-compatible.
- **Mimo / Xiaomi MiMo** ($6/mo, 4.1B credits, model `mimo-v2.5`): OpenAI-compatible (`https://api.xiaomimimo.com/v1`), Token Plan uses `tp-xxxxx` key + possibly different base_url.
- **OpenCode Zen**: free tier, 100 req/day, OpenAI-compatible. Good backup.

## See also
- `software-development/llm-agent-provider-selection` — cost/quality ranking of providers for agentic work (broader than this server).
- `software-development/hafjet-spx-reminder` — SPX system runs on Azure; its session cookies need SAP headers (see that skill's SAP header pitfall).
