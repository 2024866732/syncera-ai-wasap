# OpenCode CLI Diagnostics (from this server)

## Installation
```bash
npm i -g opencode-ai    # NOT 'opencode' (404)
opencode --version       # tested: 1.18.4
```

## Key detection: free vs Go plan
```bash
# List models — paid models only show if key has Go plan
opencode models opencode

# Free tier shows these:
# opencode/big-pickle, deepseek-v4-flash-free, mimo-v2.5-free,
# nemotron-3-ultra-free, laguna-s-2.1-free, ling-3.0-flash-free,
# north-mini-code-free

# Go plan would also show: deepseek-v4-pro, glm-5.2, qwen3.7-max,
# kimi-k2.7-code, minimax-m3 (without -free suffix)

# Test if paid model actually works:
opencode run --model opencode/deepseek-v4-pro "Reply OK"
# "Error: Model deepseek-v4-pro is not supported" = free key
```

## Auth file locations
| File | Purpose |
|---|---|
| `~/.local/share/opencode/auth.json` | API keys/credentials |
| `~/.config/opencode/opencode.json` | Provider/model configuration |
| `~/.config/opencode/opencode.jsonc` | Same as above (JSONC format) |

### auth.json format
```json
{"opencode": {"api_key": "sk-full-key-here"}}
```

### opencode.json format (global config)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "opencode": {
      "options": {"baseURL": "https://opencode.ai/zen/v1"},
      "models": {
        "big-pickle": {"name": "Big Pickle"},
        "deepseek-v4-pro": {"name": "DeepSeek V4 Pro"}
      }
    }
  },
  "model": "opencode/big-pickle"
}
```

## IP ban note (updated 2026-07-24)
Direct HTTP to `opencode.ai` returns 403/1010 from this server (Cloudflare ban).
- `opencode.ai/zen/v1` → ❌ IP-banned
- `opencode.ai/zen/go/v1` → ✅ **WORKS** (different Cloudflare path!)

**Hermes can use `/go/v1`** for Go plan models. OpenCode CLI auth mechanism also blocked (providers login fails).

CLI: free tier models only (auth.json manual write not recognized).
Hermes: Go plan via `/go/v1` ✅

## Useful commands
```bash
opencode providers list          # show stored credentials
opencode providers login         # interactive (needs browser)
opencode models opencode         # list available models
opencode run --model X "prompt"  # one-shot test
opencode debug config            # show resolved config
opencode debug paths             # show data/config/cache paths
```
