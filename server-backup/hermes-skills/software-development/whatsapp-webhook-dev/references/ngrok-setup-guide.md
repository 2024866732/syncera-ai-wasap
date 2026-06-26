# Ngrok Setup for Meta WhatsApp Webhook

## Why ngrok over Cloudflare Tunnel?

Meta's webhook validation **cannot** work through Cloudflare Tunnel because `trycloudflare.com` serves an interstitial/warning page that blocks Meta's GET verification request. ngrok provides a direct HTTPS tunnel without interstitial pages.

## Installation

```bash
# Download ngrok v3
curl -sL "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz" -o /tmp/ngrok.tgz
tar xzf /tmp/ngrok.tgz -C /tmp/
chmod +x /tmp/ngrok
/tmp/ngrok --version
```

## Auth Token Setup (REQUIRED)

**⚠️ ngrok v3 REQUIRES an auth token.** Without it, ngrok refuses to start with ERR_NGROK_4018.

**⚠️ The CLI command `ngrok config add-authtoken` may fail silently.** Always write the config file directly:

```bash
mkdir -p ~/.config/ngrok
cat > ~/.config/ngrok/ngrok.yml << 'EOF'
version: "2"
authtoken: YOUR_NGROK_AUTH_TOKEN_HERE
log_level: info
log: /tmp/ngrok.log
EOF
```

Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken

**Alternative:** Store token in `~/.hermes/.env` as `NGROK_AUTH_TOKEN=xxx` and read it from there.

## Starting the Tunnel

```bash
# Start tunnel to local port 8443 (background)
/tmp/ngrok http 8443 --config ~/.config/ngrok/ngrok.yml --log=stdout --log-level=info > /tmp/ngrok.log 2>&1 &

# Wait for tunnel to stabilize, then check URL
sleep 5
cat /tmp/ngrok.log | grep "url=https"
```

The tunnel URL will appear in logs as: `https://xxxx.ngrok-free.app`

## Verifying the Tunnel

```bash
# Test health endpoint through ngrok
curl -sk "https://xxxx.ngrok-free.app/health"

# Test webhook verification (simulate Meta's GET)
curl -sk "https://xxxx.ngrok-free.app/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=123456"
# Should return: 123456
```

## Meta Portal Configuration

1. WhatsApp → Configuration → Webhook
2. Callback URL: `https://xxxx.ngrok-free.app/webhook`
3. Verify Token: (must match `WEBHOOK_VERIFY_TOKEN` in your code)
4. Click "Verify and Save"

## Free Tier Notes

- Free ngrok accounts get a **persistent subdomain** (URL stays the same across restarts)
- Paid accounts can use custom domains
- Without auth token, ngrok v3 refuses to start (ERR_NGROK_4018)
