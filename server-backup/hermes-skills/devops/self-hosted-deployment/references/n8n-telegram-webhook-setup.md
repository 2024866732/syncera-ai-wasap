# n8n + Cloudflare Quick Tunnel + Telegram Webhook Approval Flow

Class-level recipe for deploying n8n on low-resource VPS (1GB RAM + swap) for Telegram-based approval workflows (e.g. content automation).

## Core Requirements
- n8n via docker-compose (official image)
- Cloudflare Quick Tunnel for public HTTPS (no custom domain)
- Basic auth for the UI
- Telegram Trigger + Callback for inline approval buttons
- Workflow JSON import (n8n does not auto-load .json files)

## Standard .env (minimal working set)
```
WEBHOOK_URL=https://your-tunnel.trycloudflare.com
N8N_PROXY_HOPS=1
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=hafizi145
N8N_BASIC_AUTH_PASSWORD=yourpass
N8N_OWNER_EMAIL=hafizi145@local.com
N8N_OWNER_PASSWORD=yourpass
GENERIC_TIMEZONE=Asia/Kuala_Lumpur
```

**Important**: Also put the same WEBHOOK_URL + N8N_PROXY_HOPS in the `environment:` section of docker-compose.yml if it overrides .env.

## Safe .env editing
```bash
echo 'N8N_OWNER_EMAIL=xxx@local.com' >> .env
echo 'N8N_OWNER_PASSWORD=pass' >> .env
tail -5 .env   # always verify no glued lines
```

## Restart pattern (always use sg)
```bash
sg docker -c "docker-compose down && docker-compose up -d"
```

## Tunnel management (Quick Tunnel)
Install once, then:
```bash
pkill cloudflared 2>/dev/null || true
nohup cloudflared tunnel --url http://localhost:5678 > /tmp/cloudflared.log 2>&1 &
sleep 8
grep -o 'https://.*trycloudflare.com' /tmp/cloudflared.log | tail -1
```

Recovery when 502:
- Re-run the nohup block
- Capture new URL
- Update WEBHOOK_URL in both .env and docker-compose.yml
- Full n8n restart + health check

## n8n login (Basic Auth + owner email fix)
Browser Basic Auth popup:
- Username = N8N_BASIC_AUTH_USER
- Password = N8N_BASIC_AUTH_PASSWORD

If "Must be a valid email" form appears, use the N8N_OWNER_EMAIL + password.

## After login: n8n is empty ("kosong")
1. Import the workflow JSON via UI (Workflows → Import from File)
2. Create "Telegram API" credential
3. Assign credential to all Telegram nodes
4. In Callback Trigger: Restrict to Chat IDs = target chat (e.g. 1485374469)
5. Activate

## User preference
When user says "tolong runkan dalam terminal untuk saya", execute the commands using the terminal tool.

## Verification
- healthz local + tunnel
- logs for "Editor is now accessible via"
- test message to bot triggers execution

Pitfalls: URL changes on tunnel restart, must update both config files, use sg docker, explicit newlines in .env, down+up not just restart.