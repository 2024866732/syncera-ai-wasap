# Cloudflare Tunnel — Public HTTPS for Self-Hosted Services

Use when you need a public HTTPS URL for a local service (n8n webhooks, Telegram bot, OAuth callback) without a domain or SSL certificate.

## Quick Tunnel (testing / temporary)

```bash
# 1. Install cloudflared (one-time)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /tmp/cloudflared
sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
cloudflared --version

# 2. Start tunnel to local service
cloudflared tunnel --url http://localhost:5678
# Output: https://<random-words>.trycloudflare.com

# 3. Persistent background (survives terminal close)
nohup cloudflared tunnel --url http://localhost:5678 > /tmp/cloudflared.log 2>&1 &
```

**Limitations:**
- URL changes on every restart (random subdomain)
- No uptime guarantee
- For testing/dev only — not production

## Named Tunnel (permanent, requires Cloudflare account)

1. Auth: `cloudflared tunnel login` (opens browser)
2. Create: `cloudflared tunnel create <name>`
3. Route DNS: `cloudflared tunnel route dns <name> <subdomain.domain.com>`
4. Run: `cloudflared tunnel run <name>`

See https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/

## n8n-Specific: Webhook URL + Proxy Hops

When n8n is behind Cloudflare Tunnel (or any reverse proxy), TWO config changes are mandatory:

### 1. WEBHOOK_URL = tunnel URL (no trailing path)

```
WEBHOOK_URL=https://<name>.trycloudflare.com
```

n8n appends `/webhook/...` internally — do NOT include `/webhook` in the env var.

### 2. N8N_PROXY_HOPS=1

```
N8N_PROXY_HOPS=1
```

Without this, n8n reads the wrong client IP/protocol from proxied requests, and webhook URLs may be constructed incorrectly.

### docker-compose.yml example

```yaml
services:
  n8n:
    environment:
      - WEBHOOK_URL=https://<name>.trycloudflare.com
      - N8N_PROXY_HOPS=1
```

Or via `.env` file:
```
WEBHOOK_URL=https://<name>.trycloudflare.com
N8N_PROXY_HOPS=1
```

### After config change: restart n8n

```bash
docker-compose down && docker-compose up -d
# then verify:
docker logs <container> 2>&1 | grep -i "accessible\|webhook"
```

Expected log line: `Editor is now accessible via: https://<name>.trycloudflare.com`

## Verification

```bash
# 1. Local health
curl -sf http://localhost:5678/healthz && echo " ✓ Local OK"

# 2. Tunnel health
curl -sf https://<name>.trycloudflare.com/healthz && echo " ✓ Tunnel OK"

# 3. Web UI accessible
curl -s -o /dev/null -w '%{http_code}' https://<name>.trycloudflare.com/
```

## Pitfalls

- **Quick Tunnel URL changes on restart** — never hardcode in production configs. Use named tunnel with custom domain for permanent URLs.
- **`newgrp docker` doesn't work in Hermes Agent terminal sessions** — use `sg docker -c "command"` instead when docker group was just added via `sudo usermod -aG docker $USER`.
- **Restart is mandatory after env changes** — n8n reads WEBHOOK_URL at startup only. `docker-compose restart` may not pick up new env vars; prefer `down && up -d`.
