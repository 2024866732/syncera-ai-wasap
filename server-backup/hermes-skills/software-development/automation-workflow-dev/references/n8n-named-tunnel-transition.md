# Transition from Quick Tunnel to Named/Account Cloudflare Tunnel (HAFJET n8n)

Session learning (2026): User frequently says “dah link account cloudflare” while still running Quick Tunnel (`--url`).

## Diagnostic checklist (always run first)

```bash
# Is the account actually linked in this environment?
ls -la ~/.cloudflared/          # empty or missing = not logged in here
cloudflared tunnel list         # fails if not authenticated

# What is actually running?
pgrep -a cloudflared            # must NOT show "tunnel --url"

# Current n8n config
grep WEBHOOK_URL /home/hafizi145/.n8n/.env
grep WEBHOOK_URL /home/hafizi145/.n8n/docker-compose.yml

# n8n thinks it is using
docker logs hafjet-n8n --tail 30 | grep -i "accessible via"
```

## Typical user state when they claim “account linked”

- ~/.cloudflared/ does not exist
- Process is still `cloudflared tunnel --url http://localhost:5678`
- .env still points to a random *.trycloudflare.com from the last Quick restart
- User pastes a fresh Quick URL they just got

## Correct migration sequence

1. Authenticate the account (if not done):
   ```bash
   cloudflared tunnel login
   ```

2. Create a named tunnel (once):
   ```bash
   cloudflared tunnel create hafjet-n8n
   cloudflared tunnel list   # note the ID
   ```

3. In Cloudflare dashboard (Zero Trust → Tunnels → hafjet-n8n):
   - Add Public Hostname
   - Service = http://localhost:5678 (or the n8n service)
   - Copy the resulting public URL (can still be a trycloudflare hostname, but it belongs to the named tunnel)

4. Switch runtime:
   ```bash
   pkill cloudflared || true
   # Use token (recommended for scripts) or config
   cloudflared tunnel run hafjet-n8n
   # or for background
   nohup cloudflared tunnel run hafjet-n8n > /tmp/cloudflared.log 2>&1 &
   ```

5. Update n8n config (both places) + restart:
   - Set WEBHOOK_URL to the stable dashboard URL
   - N8N_PROXY_HOPS=1
   - `sg docker -c "docker-compose down && docker-compose up -d"`

6. Verify:
   - `docker logs hafjet-n8n | grep "accessible via"` shows the stable URL
   - Tunnel healthz returns 200
   - Re-activate n8n Telegram workflow so webhook is re-registered

## References / commands to keep

See main SKILL.md section for full Quick vs Named comparison and the Telegram approval flow that depends on a stable WEBHOOK_URL.