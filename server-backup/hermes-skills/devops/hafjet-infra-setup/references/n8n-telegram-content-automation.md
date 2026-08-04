# n8n HAFJET Content Automation — Telegram Workflow Setup (Aug 2026)

Reference for the production workflow deployed on `https://n8n.hafjet.my`.

## Workflow Overview

**Name:** HAFJET Content Automation
**ID:** `TEl4FEVffYACrkxQ`
**Status:** Active
**Nodes:** 17
**Trigger:** Schedule (12:25 / 20:25 MYT) + Telegram Callback Trigger

## Node Inventory

| Node | Type | Purpose | Key Config |
|------|------|---------|------------|
| Schedule Trigger | n8n-nodes-base.scheduleTrigger | Cron: 12:25 & 20:25 MYT | Timezone: Asia/Kuala_Lumpur |
| HTTP Request (Hermes) | n8n-nodes-base.httpRequest | Call Hermes for content generation | URL: `https://api.x.ai/v1/chat/completions` (xAI) |
| Generate Content | n8n-nodes-base.function / httpRequest | Build caption options | Output: 2 caption options |
| Send Draft to Telegram | n8n-nodes-base.telegram | Send draft + 10-button keyboard | Chat ID: 1485374469, Credential: HAFJET Telegram Bot |
| Telegram Callback Trigger | n8n-nodes-base.telegramTrigger | **Main inbound webhook** | Restrict Chat ID: 1485374469 |
| Switch | n8n-nodes-base.switch | Route 8 callback actions | Field: `{{ $json.callback_query.data }}` |
| Answer Callback Query | n8n-nodes-base.telegram | Acknowledge button press | Cache time: 0 |
| Edit - Approved | n8n-nodes-base.telegram | Edit message "✅ Approved" | |
| Publish Success Notification | n8n-nodes-base.telegram | Notify after publish | |
| Ask Revise Details | n8n-nodes-base.telegram | Prompt for revision input | |
| Regenerate Captions | n8n-nodes-base.telegram / httpRequest | Call AI for new captions | |
| Regenerate Visual | n8n-nodes-base.telegram / httpRequest | Call AI for new image | |
| Regenerate Both | n8n-nodes-base.telegram / httpRequest | Call AI for both | |
| Ask New Schedule | n8n-nodes-base.telegram | Prompt for new time | |
| Reject Draft | n8n-nodes-base.telegram | Notify rejection | |
| Ask Manual Instruction | n8n-nodes-base.telegram | Free-form override | |

## Inline Keyboard (10 Buttons)

| Button Text | Callback Data | Route |
|-------------|---------------|-------|
| Approve Option 1 | `approve_1` | Publish to Threads/IG/FB/TikTok |
| Approve Option 2 | `approve_2` | Publish to Threads/IG/FB/TikTok |
| Revise | `revise` | Ask Revise Details |
| New Captions | `new_captions` | Regenerate Captions |
| New Visual | `new_visual` | Regenerate Visual |
| New Both | `new_both` | Regenerate Both |
| Change Schedule | `change_schedule` | Ask New Schedule |
| Reject | `reject` | Reject Draft |
| Manual Instruction | `manual_instruct` | Ask Manual Instruction |

## Telegram Credential Setup

1. In n8n UI → Credentials → New → Telegram API
2. Bot Token: from BotFather
3. Name: "HAFJET Telegram Bot"
4. **Assign to ALL Telegram nodes** (11 nodes in this workflow)
5. In **Telegram Callback Trigger** node:
   - Enable "Restrict to Chat IDs"
   - Value: `1485374469`

## Webhook Migration (Quick Tunnel → Named Tunnel)

### Before (Quick Tunnel):
```
WEBHOOK_URL=https://sas-athletic-differences-prophet.trycloudflare.com
```

### After (Named Tunnel):
```
WEBHOOK_URL=https://n8n.hafjet.my
```

### Migration Steps:
1. Update `.env` and `docker-compose.yml` with new WEBHOOK_URL
2. Add `N8N_HOST=n8n.hafjet.my`, `N8N_PROTOCOL=https`, `N8N_PROXY_HOPS=1`
3. Restart n8n: `docker-compose down && docker-compose up -d`
4. **Deactivate → Activate** workflow (triggers auto-register)
5. Verify: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`
   - `url` = `https://n8n.hafjet.my/webhook/<JOB_ID>/webhook`
   - `last_error_date` = empty
   - `allowed_updates` includes `callback_query`

## Split Tunnels (Cloudflare WARP Device Profile)

Required for Tunnel to work:
- **Remove** `100.64.0.0/10` from Exclude list (CGNAT range)
- Keep `192.168.0.0/16` and `10.0.0.0/8` in Exclude
- Local Domain Fallback: ensure `n8n.hafjet.my` NOT in list

## Testing Protocol (Safe, No Live Publish)

1. Execute "Send Draft to Telegram" node manually
2. Verify draft + 10 buttons arrive in Telegram (chat 1485374469)
3. Press **safe buttons only**: "New Captions" or "Revise"
4. **DO NOT PRESS**: "Approve Option 1/2" (triggers live publish)
5. Check n8n Executions tab:
   - New execution from Telegram Callback Trigger
   - Correct branch routing (Regenerate Captions / Ask Revise Details)
   - Bot responds with expected message

## Generate Content Node — Current Implementation

**Option A: xAI API (Grok) — RECOMMENDED**
- URL: `https://api.x.ai/v1/chat/completions`
- Auth: Bearer xAI API Key
- Body:
```json
{
  "model": "grok-2-latest",
  "messages": [{"role": "user", "content": "{{ $json.prompt }}"}],
  "temperature": 0.7
}
```

**Option B: Hermes Cron Fire (if using Hermes for generation)**
- URL: `http://host.docker.internal:8787/api/cron/fire`
- Auth: Bearer Hermes API Key
- Body: `{"job_id": "<CRON_JOB_ID>"}`

**NOT available:**
- SuperGrok (web UI only, OAuth, no API)
- Hermes `/api/cron/hafjet-content-generate` (does not exist)

## Content Pipeline (Delay Pickup Series)

**Posts 1-5** — 3 formats each:
- Threads (text + hashtags)
- IG Feed (image + caption)
- IG Story cards (visual + minimal text)

**Each post includes:**
- Telegram Approval Block
- Visual Direction (real photo + graphic overlay)
- CTA: `wa.me/60198021500`
- Tone: Santai, jujur, lokal, no hard-sell
- Schedule: 12:30 & 20:30 MYT

## Environment Variables (n8n .env)

```env
WEBHOOK_URL=https://n8n.hafjet.my
N8N_HOST=n8n.hafjet.my
N8N_PROTOCOL=https
N8N_PROXY_HOPS=1
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=hafizi145
N8N_BASIC_AUTH_PASSWORD=***
N8N_OWNER_EMAIL=hafizi145@gmail.com
TZ=Asia/Kuala_Lumpur
GENERIC_TIMEZONE=Asia/Kuala_Lumpur
DB_SQLITE_DATABASE=/home/node/.n8n/database.sqlite
N8N_ENCRYPTION_KEY=***
EXECUTIONS_MODE=regular
N8N_PAYLOAD_SIZE_MAX=16
N8N_LOG_LEVEL=info
```

## Cloudflared Systemd Service

```ini
[Unit]
Description=Cloudflare Tunnel - hafjet-n8n
After=network.target

[Service]
Type=simple
User=hafizi145
ExecStart=/usr/local/bin/cloudflared tunnel run --token <TOKEN>
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Verification Commands

```bash
# Tunnel health
curl -I https://n8n.hafjet.my
curl https://n8n.hafjet.my/healthz

# Telegram webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Service status
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 30 --no-pager

# n8n container
docker-compose ps
docker-compose logs --tail=50 n8n
```

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "Connection cannot be established" in Generate Content | Use `host.docker.internal:8787` for Hermes, or `api.x.ai` for xAI |
| Webhook still shows trycloudflare.com | Deactivate → Activate workflow; wait 5s |
| Telegram message not sent from n8n | Check node: Credential selected, Chat ID = 1485374469 |
| `allowed_updates` only `callback_query` | Normal for Callback Trigger only; add `message` if using Telegram Trigger |
| 530 error from Cloudflare | Tunnel connector not connected → check cloudflared logs |

## Related Files

- Workflow JSON: `/home/hafizi145/.n8n/workflows/hafjet-content-automation.json`
- n8n config: `/home/hafizi145/.n8n/.env` & `/home/hafizi145/.n8n/docker-compose.yml`
- Cloudflared service: `/etc/systemd/system/cloudflared.service`
- Tunnel credentials: `~/.cloudflared/cert.pem`