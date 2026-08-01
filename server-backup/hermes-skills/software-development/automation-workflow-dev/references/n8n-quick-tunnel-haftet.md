# n8n Quick Tunnel Pattern for HAFJET (Telegram Webhooks)

Quick Tunnels (`*.trycloudflare.com`) are the fastest way to get public HTTPS for Telegram bot webhooks on n8n without a domain.

## Core Gotchas from Production Use

### 1. URL is temporary — expect rotation
- Every restart of `cloudflared tunnel --url ...` produces a **new random subdomain**.
- Always re-capture the URL from the log after restart.
- Update **both** places:
  - `/home/hafizi145/.n8n/.env` (WEBHOOK_URL)
  - `/home/hafizi145/.n8n/docker-compose.yml` (the environment: list can override .env)

### 2. Restart sequence (correct order)
```bash
# 1. Kill old tunnel if any
pkill cloudflared 2>/dev/null || true

# 2. Start new Quick Tunnel (background)
nohup cloudflared tunnel --url http://localhost:5678 > /tmp/cloudflared.log 2>&1 &

# 3. Extract new URL
grep -o 'https://.*trycloudflare.com' /tmp/cloudflared.log | tail -1

# 4. Update both config files (use sed or write_file tool)
# 5. Restart n8n
cd /home/hafizi145/.n8n
sg docker -c "/home/hafizi145/.local/bin/docker-compose down && /home/hafizi145/.local/bin/docker-compose up -d"

# 6. Verify from logs (critical)
docker logs hafjet-n8n 2>&1 | grep -A1 "Editor is now accessible via"
```

### 3. Verification checklist after restart
- `curl -sf http://localhost:5678/healthz` → 200
- `curl -sf https://NEW-URL.trycloudflare.com/healthz` → eventually 200 (can be 502 for 10-60s)
- n8n container log must show the **new** URL, not the old one.
- 502 on public URL is normal during tunnel handshake + n8n warm-up. Wait and re-check.

### 4. n8n-specific settings (non-negotiable)
```env
WEBHOOK_URL=https://new-random.trycloudflare.com
N8N_PROXY_HOPS=1
GENERIC_TIMEZONE=Asia/Kuala_Lumpur
```

### 5. Telegram bot side
After tunnel is stable and n8n shows correct URL:
- Create bot via @BotFather (if not done)
- Add Telegram API credential in n8n UI
- Edit every Telegram node in the workflow to use the credential
- In Telegram Callback Trigger node: set "Restrict to Chat IDs" = `1485374469`
- Activate the workflow → n8n auto-registers the webhook
- Test: send message to bot → check n8n Execution History

## Common Failure Modes & Fixes
- Old URL still appears in logs → you only updated .env, not docker-compose.yml environment section.
- Tunnel 502 forever → cloudflared process died; restart it.
- Webhook not firing → workflow not activated, or wrong chat ID restriction, or old tunnel still registered in Telegram (use getWebhookInfo + deleteWebhook + re-activate).
- `sg docker -c` must be used; `newgrp docker` does not persist in Hermes terminal sessions.

## Recommended Persistent Pattern (beyond Quick Tunnel)
For production, move to a Named Tunnel (requires Cloudflare account + tunnel token). Quick Tunnel is only for rapid iteration/testing.

## Verification Commands
```bash
# Get current public URL
grep -o 'https://.*trycloudflare.com' /tmp/cloudflared.log | tail -1

# Check n8n is advertising the right URL
docker logs hafjet-n8n --tail 20 | grep -i accessible

# Full health
curl -sf https://NEW-URL.trycloudflare.com/healthz && echo "Public OK"
```