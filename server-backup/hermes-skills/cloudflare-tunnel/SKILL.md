---
name: cloudflare-tunnel
description: "Use for Cloudflare Tunnels with WARP device profiles."
---

# Cloudflare Tunnel

Use for named tunnels, hostname routes, WARP/Cloudflare One device profile fixes, quick-to-named migration, running cloudflared connectors, and updating backend services when the public URL changes.

Registrar nameserver change is **mandatory** for the domain (and all tunnel hostnames) to be active under Cloudflare. Do this at the registrar (e.g. Exabyte/MSHosting) **before** expecting records or routes to work. Set exactly the two Cloudflare NS shown in your dashboard (e.g. lauryn.ns.cloudflare.com + sterling.ns.cloudflare.com). Delete old NS. Disable DNSSEC at registrar. Propagation: check with `dig NS yourdomain` (can take minutes to hours; up to 24h worst case). Do **not** continue adding records at the registrar after this change.

## Hostname Route + Device Profile Gotcha
Dashboard error:
"Action required: configure Cloudflare One Client device profile
For this hostname route to function, your device profile must allow Cloudflare One Clients to reach the 100.64.0.0/10 CGNAT IP range and your private origin IPs.
Split Tunnels: Ensure the 100.64.0.0/10 range and your private origin IPs are not part of an Exclude rule."

**Fix**: Remove **only** 100.64.0.0/10 from Exclude in the active profile. Keep local private ranges (10.0.0.0/8, 192.168.0.0/16) if needed for LAN.

**UI navigation (users report "tak jumpa")**:
Left sidebar → Settings → (left sub-menu inside Settings) WARP Client → Device profiles.
Fallback: main sidebar → Devices.

Confirm with user before editing (affects Default profile for all clients); explain risks first. Screenshot-driven confirmation loops ("ini ke", "betul tak", "yang bawah sekali") are common and helpful.

## DNS record for public hostname (Tunnel UI vs manual)
When added via tunnel UI (Public Hostnames / Published application routes / Hostname routes (Beta)), Cloudflare auto-creates a special **"Tunnel"** record type (may appear as "Tunnel" or "[object Object]" in DNS list view). This is correct and preferred.

Manual fallback (if needed): CNAME `sub` → `<tunnel-id>.cfargotunnel.com` (proxied).

Do **not** point to your root domain or current hosting IP.

## Migration / Setup Steps (Ubuntu + systemd + registrar)
1. Stop old Quick Tunnel (pkill the --url process or equivalent).
2. `cloudflared tunnel login` if no `~/.cloudflared/cert.pem` (creates the account cert).
3. For systemd services, **prefer --token** over `tunnel run <name>` (avoids "tunnel credentials file not found" even after login; get the long token from dashboard > tunnel > Run a connector > Linux/Docker section).
   Example ExecStart: `/usr/local/bin/cloudflared tunnel run --token <TOKEN>`
4. Test run first: `nohup cloudflared tunnel run --token <TOKEN> > /tmp/cloudflared.log 2>&1 &` then `tail -f /tmp/cloudflared.log` until "Connection established".
5. Create systemd service (User=youruser, Restart=always).
6. Update backend (n8n example): WEBHOOK_URL=https://sub.domain, N8N_HOST=sub.domain, N8N_PROTOCOL=https, N8N_PROXY_HOPS=1 in .env + compose.
7. Restart backend.
8. Verify: dashboard shows Active + connector(s) connected; `dig NS yourdomain` shows Cloudflare NS; `dig sub.yourdomain +short` shows *.cfargotunnel.com or Cloudflare IPs; public `curl -I https://sub...` + healthz.

**Common systemd unit**
```ini
[Unit]
Description=Cloudflare Tunnel - <name>
After=network.target

[Service]
Type=simple
User=<user>
ExecStart=/usr/local/bin/cloudflared tunnel run <name>
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install:
```bash
sudo tee /etc/systemd/system/cloudflared.service << 'EOF'
[Unit]...
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

## Verification order (always follow)
1. Local service OK (`curl -I http://localhost:5678`)
2. NS propagated (`dig NS yourdomain` shows Cloudflare NS)
3. Hostname resolves to tunnel (`dig sub.yourdomain +short` shows *.cfargotunnel.com)
4. Public endpoint + health (`curl -I https://sub...` and `/healthz`)
5. Dashboard: Active + connector connected
6. Logs: `journalctl -u cloudflared -f`

## Pitfalls
- Route published in dashboard but tunnel "Inactive" / no connectors → cert missing or service not running (check cert path + journalctl).
- "Cannot determine default origin certificate path. No file cert.pem" → run `cloudflared tunnel login` on the server (as the service user).
- Old quick tunnel still running.
- Service still points to old temporary URL.
- Excluding CGNAT (100.64.0.0/10) with WARP + hostname routes.
- Adding/managing records at registrar after NS change (ignored; manage only in Cloudflare).
- DNSSEC left on at registrar.
- Not waiting for propagation (always gate on `dig NS` before testing public URL).
- Localhost vs Docker service name in tunnel service URL (use localhost when cloudflared runs on host).
- Screenshot-driven confirmation ("ini ke", "betul tak", "yang bawah sekali isi ape") is the user's preferred style — use it.

See `references/tunnel/hostname-routes-with-warp-device-profile.md` for full error text, user confirmation flow, exact navigation that caused frustration, complete systemd unit, n8n .env + docker-compose.yml updates, Telegram get/delete/setWebhook pattern tied to the workflow's Telegram Trigger/Callback nodes, systemctl checklist, and final verification checklist.

This session reinforced: always do local test first; `dig NS domain` is the gate before claiming DNS success; registrar nameserver change is a prerequisite for any Cloudflare record (including tunnel hostnames) to be live; "Tunnel" type records are created automatically when adding via the UI and are the preferred path.