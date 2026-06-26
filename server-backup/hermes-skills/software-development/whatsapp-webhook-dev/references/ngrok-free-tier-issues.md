# Ngrok Free Tier — Meta Webhook Delivery Issues

## Problem

Ngrok free tier uses `*.ngrok-free.dev` domains. Meta's webhook delivery to these domains is **unreliable**:

- Webhook POST requests from Meta may silently not reach your server
- No error on Meta's side — the request just never arrives
- Intermittent: works sometimes, fails other times
- Meta may rate-limit or flag `ngrok-free.dev` domains

## Diagnosis

If your webhook verification works (GET /webhook returns challenge) but incoming messages don't trigger POST /webhook:

1. Check ngrok logs: `curl -s http://localhost:4040/api/requests/http`
2. If no POST requests appear when you send a message → ngrok delivery issue
3. If POST requests appear but return 403/500 → server-side issue (different problem)

## Solution

**Migrate to a stable hosting provider:**

| Option | URL Pattern | Cost | Reliability |
|--------|-------------|------|-------------|
| Azure App Service F1 | `*.azurewebsites.net` | Free | ✅ High |
| Render | `*.onrender.com` | Free (spins down) | ⚠️ Medium |
| Railway | `*.up.railway.app` | Free tier | ⚠️ Medium |
| VPS (DigitalOcean/Linode) | Custom domain | $5/mo | ✅ High |

**Azure App Service is the recommended replacement** — see `azure-deployment-guide.md` for the full deployment walkthrough.

## ngrok Paid Tier

If you must use ngrok, the paid tier ($5+/mo) gives you:
- Fixed subdomains (no URL changes on restart)
- No connection limits
- Better reliability for webhook delivery

But Azure Free F1 is still preferred for production WhatsApp bots.
