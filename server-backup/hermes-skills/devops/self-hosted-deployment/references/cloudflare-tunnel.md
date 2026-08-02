# Cloudflare Tunnel for Public HTTPS (n8n, Telegram webhooks, etc.)

**Class-level guidance** for exposing local services (especially n8n) to the public internet with a stable HTTPS URL for webhooks.

**Trigger**: User needs a public HTTPS URL for a self-hosted service (Telegram bot webhook, n8n, OAuth callback, etc.) on Linux. Mentions `cloudflared`, `trycloudflare`, Named Tunnel, or changing from temporary to stable URL.

## Critical Distinction: Quick Tunnel vs Named Tunnel

### Quick Tunnel (`--url`)
- Command: `cloudflared tunnel --url http://localhost:5678`
- Gives random `https://<words>.trycloudflare.com`
- **No domain required**
- **URL changes** every time the process restarts or the tunnel is recreated
- Use only for testing or when you accept re-registering webhooks frequently

### Named Tunnel (with Public / Hostname Route)
- Requires `cloudflared tunnel login` (Cloudflare account)
- Creates a persistent tunnel ID
- To get a **stable public URL** you must add a **Public Hostname / Hostname route** in the Cloudflare dashboard
- **Domain requirement**: You need a domain that is active in your Cloudflare account to create a public hostname route (e.g. `n8n.hafjet.my`)
- Without a domain in Cloudflare: You can still create and run a Named Tunnel for management/observability, but you **cannot** get a stable public hostname. You fall back to Quick Tunnel behaviour for public access.

**Common mistake**: Thinking "Named Tunnel = stable URL automatically". This is only true once you successfully add a Public Hostname using a domain you control in Cloudflare.

## Three Practical Scenarios

**Scenario 1: You have a domain in Cloudflare (recommended for production)**
- Create Named Tunnel in dashboard
- Add Public Hostname: `n8n` + your domain (`hafjet.my`) → service `localhost:5678`
- Result: stable `https://n8n.hafjet.my`
- Update n8n: `WEBHOOK_URL=https://n8n.hafjet.my`, `N8N_HOST=n8n.hafjet.my`, `N8N_PROTOCOL=https`, `N8N_PROXY_HOPS=1`
- Restart n8n fully (`down && up -d`)

**Scenario 2: You have Cloudflare account but no domain**
- You can create Named Tunnels and manage them in dashboard
- You **cannot** create stable public hostnames
- Stick to Quick Tunnel for public access
- Accept that the URL will change on restart → you will need to update `WEBHOOK_URL` and re-activate n8n Telegram triggers

**Scenario 3: Fast testing only (current Quick Tunnel)**
- Continue with `cloudflared tunnel --url ...` + `nohup`
- Fastest to start
- Major limitation: URL changes → Telegram webhook becomes invalid
- Mitigation: After URL changes, run `getWebhookInfo`, then either let n8n re-register on workflow activation or manually `setWebhook`

## n8n-Specific Configuration (Mandatory)

When n8n sits behind any Cloudflare Tunnel (Quick or Named):

```env
WEBHOOK_URL=https://n8n.hafjet.my          # full hostname, no path
N8N_HOST=n8n.hafjet.my
N8N_PROTOCOL=https
N8N_PROXY_HOPS=1
N8N_PORT=5678
```

Update in **both**:
- `/home/.../.n8n/.env`
- `environment:` section inside `docker-compose.yml`

Restart with full down + up (n8n reads these at container start):
```bash
cd /home/hafizi145/.n8n
docker-compose down
docker-compose up -d
```

Verify:
```bash
docker logs hafjet-n8n 2>&1 | grep -A1 "Editor is now accessible via"
```

## Telegram Webhook Migration When URL Changes

Telegram stores only one webhook per bot.

1. Check current:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   ```

2. Best practice after URL change:
   - Deactivate the n8n workflow containing the Telegram Trigger
   - Update `WEBHOOK_URL` + restart n8n
   - Reactivate the workflow (n8n usually re-registers)
   - If it doesn't, manually:
     ```bash
     curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://n8n.hafjet.my/webhook/<trigger-path>"
     ```

3. Clean old:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
   ```

## Cloudflare One / WARP Client Conflicts

When adding hostname routes you may see:
> "configure Cloudflare One Client device profile... 100.64.0.0/10 ... not part of an Exclude rule"

Fix (Zero Trust → Settings → WARP Client → Device profiles):
- Edit the relevant profile
- Split Tunnels: Ensure `100.64.0.0/10` and the origin private IPs are **not** in Exclude lists
- Local Domain Fallback: Ensure `n8n.hafjet.my` (and parent domain) is **not** listed

## Current Best Practice (as of this audit)

- For anything that needs reliable Telegram/n8n callbacks → prefer Named Tunnel + domain when possible.
- If no domain yet → continue with Quick Tunnel but treat the URL as ephemeral.
- Always update both `.env` and `docker-compose.yml` environment.
- Full restart (`down && up -d`) after WEBHOOK_URL changes.
- After any tunnel URL change, verify with `getWebhookInfo` and re-activate the relevant workflow.

## Pitfalls to Avoid

- Assuming Named Tunnel gives a stable public URL without a Cloudflare domain.
- Using example hostnames like `*.trycloudflare.com` when describing Named Tunnel setups.
- Only updating `.env` while `docker-compose.yml` still has the old URL.
- Forgetting that Telegram caches the webhook URL aggressively.
- Running Quick Tunnel and Named Tunnel at the same time (double exposure / confusion).

---

**References / Further Reading**
- The detailed audit that produced this clarity is in the session where the user requested a full review of previous Cloudflare Tunnel advice (including the 3-scenario breakdown and domain requirement confirmation).
- Official: Cloudflare Tunnels documentation (Public Hostnames / Hostname routes section).

This reference supersedes earlier mixed Quick/Named guidance in the skill.