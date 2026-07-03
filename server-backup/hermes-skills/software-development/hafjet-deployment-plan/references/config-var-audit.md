# Config Var Audit — Azure vs Code vs Heroku

**Date:** 2026-06-27
**Purpose:** Exact mapping between internal Python variable names, Azure app settings, and Heroku config vars.

## Complete Mapping

| Internal Variable | Env Var Name (Azure + Heroku) | Azure Current Value | Has Default? | Notes |
|---|---|---|---|---|
| `WHATSAPP_TOKEN` | `WHATSAPP_ACCESS_TOKEN` | `EAAdm4...ZD` | No | Code: `os.getenv("WHATSAPP_ACCESS_TOKEN", "")` |
| `WHATSAPP_PHONE_ID` | `WHATSAPP_PHONE_ID` | `1089032617637482` | No | |
| `APP_SECRET` | `APP_SECRET` | `4160d...148b` | No | Used for webhook signature verification |
| `WEBHOOK_VERIFY_TOKEN` | `VERIFY_TOKEN` | `HAFJET_RAUB_RAK` | Yes (`HAFJET_RAUB_RAK`) | |
| `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` | `sk-or-...` | No | |
| `OPENROUTER_MODEL` | `OPENROUTER_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` | Yes | Env > DB > default. DB cannot disable. |
| `OPENROUTER_BASE_URL` | `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Yes | |
| `OPENROUTER_TIMEOUT` | `AI_TIMEOUT` | `30` | Yes (`30`) | |
| `port` | `WEBHOOK_PORT` | (not set) | Yes (`8443`) | Not needed on Heroku (uses `$PORT`) |
| `HTTP-Referer` | `APP_REFERER` | (not set) | Yes (`https://hafjet.com`) | OpenRouter analytics |

## Azure-Only Settings (NOT needed on Heroku)

| Setting | Value | Why |
|---|---|---|
| `WEBSITES_PORT` | `8000` | Azure-specific port binding |
| `STARTUP_COMMAND` | `gunicorn ...` | Azure-specific startup |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Azure build |
| `ENABLE_ORYX_BUILD` | `true` | Azure build |

## Common Mistakes (DO NOT DO)

| Wrong | Correct | Why |
|---|---|---|
| `WHATSAPP_TOKEN` | `WHATSAPP_ACCESS_TOKEN` | Internal var ≠ env var name |
| `PHONE_NUMBER_ID` | `WHATSAPP_PHONE_ID` | Code reads `WHATSAPP_PHONE_ID` |
| `WEBHOOK_VERIFY_TOKEN` | `VERIFY_TOKEN` | Internal var ≠ env var name |
| Setting `WABA_ID` | Don't set it | Not used in code at all |
| Adding `whitenoise` | Don't | FastAPI StaticFiles is native |

## Heroku `heroku config:set` Command (Production-Ready)

```bash
heroku config:set \
  WHATSAPP_ACCESS_TOKEN="REPLACE_WITH_CURRENT_TOKEN" \
  WHATSAPP_PHONE_ID="1089032617637482" \
  APP_SECRET="REPLACE" \
  VERIFY_TOKEN="HAFJET_RAUB_RAK" \
  OPENROUTER_API_KEY="REPLACE" \
  OPENROUTER_MODEL="nvidia/nemotron-3-super-120b-a12b:free" \
  OPENROUTER_BASE_URL="https://openrouter.ai/api/v1" \
  AI_TIMEOUT="30" \
  APP_REFERER="https://hafjet.com"
```

**Total: 9 vars (7 required, 2 optional with defaults)**
