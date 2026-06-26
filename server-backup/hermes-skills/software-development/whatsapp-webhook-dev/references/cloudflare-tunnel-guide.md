# Cloudflare Tunnel — NOT Compatible with Meta Webhook Verification

## ⚠️ CRITICAL: Meta Cannot Verify Through Cloudflare Tunnel

**Cloudflare Tunnel (`trycloudflare.com`) CANNOT be used for Meta WhatsApp webhook verification.** Meta's validation GET request is blocked by Cloudflare's interstitial/warning page. The webhook will always fail validation with "The callback URL or verify token couldn't be validated."

This is a hard limitation — there is no workaround. The interstitial page is served by Cloudflare for all `trycloudflare.com` domains and cannot be disabled.

## What Cloudflare Tunnel IS Good For

- Testing non-Meta webhooks
- Quick HTTPS tunneling without auth
- Internal tools that don't require third-party verification

## What to Use Instead for Meta Webhooks

**Use ngrok** (with auth token) — it provides direct HTTPS without interstitial pages:
```bash
/tmp/ngrok http 8443 --config ~/.config/ngrok/ngrok.yml
```

Or use a **proper domain + SSL certificate** (Let's Encrypt) pointing to your server.

## Setup (for non-Meta use cases only)

```bash
# Download (Linux x86_64)
curl -sL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" -o /tmp/cloudflared
chmod +x /tmp/cloudflared

# Run tunnel to local webhook server
/tmp/cloudflared tunnel --url http://localhost:8443 --loglevel info
```

The tunnel URL appears in the log output:
```
INF |  https://random-words.trycloudflare.com
```

## Important Limitations

- **URL changes on every restart** — you must update callback URL each time
- **No custom domain** without a free Cloudflare account
- **⚠ Meta webhook verification will ALWAYS FAIL** — use ngrok instead
