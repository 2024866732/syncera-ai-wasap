# Hostname Routes + WARP / Cloudflare One Device Profiles

## Triggering Dashboard Error
When adding a Published application route (hostname route) for a named tunnel:

"Action required: configure Cloudflare One Client device profile
For this hostname route to function, your device profile must allow Cloudflare One Clients to reach the 100.64.0.0/10 CGNAT IP range and your private origin IPs.
Split Tunnels: Ensure the 100.64.0.0/10 range and your private origin IPs are not part of an Exclude rule.
Local Domain Fallback: Ensure this hostname is not included in a local domain fallback list."

## Required Change
In the active device profile:
- Remove **only** `100.64.0.0/10` from the Exclude list.
- Keep local private ranges (`10.0.0.0/8`, `192.168.0.0/16`, etc.) if local network bypass is desired.
- Ensure the hostname is not in Local Domain Fallback.

## UI Navigation That Users Cannot Find ("tak jumpa la weh")
Users land in Settings (Team name and domain) and cannot locate the setting.

Exact steps:
1. Left sidebar → **Settings**.
2. Inside the Settings page, use the **left sub-navigation** (not the right "ON THIS PAGE" anchors).
3. Scroll and click **WARP Client**.
4. Click **Device profiles** → edit the profile → Split Tunnels tab.

Alternative:
- Main left sidebar → **Devices** → WARP Client / Device profiles.

## Why 100.64.0.0/10 Must Be Allowed
This is Cloudflare's CGNAT range for WARP virtual IPs and Gateway/tunnel routing. Excluding it breaks resolution for hostname routes when clients are on WARP.

It is not a user LAN range. Local private CIDRs can safely remain excluded.

## User Confirmation Flow (from session)
Before editing:
- Note that this changes the Default profile for all WARP clients.
- Local private ranges stay excluded.
- Only the CGNAT range is removed to enable the tunnel route.
- Offer to explain risks first (minimal for most setups; enables proper hostname routing).

User style in this session: heavy use of screenshots + short confirmations ("ini ke", "betul tak macam aku tanda nie", "yang bawah sekali isi ape", "nie ke", "ini kat exabyte sekarang").

## Full Switch Workflow (Quick Tunnel → Named + Stable Hostname)
1. Stop old Quick Tunnel: `pkill cloudflared` (target --url process).
2. `cloudflared tunnel login` (if no ~/.cloudflared).
3. `cloudflared tunnel run <name>` (e.g. hafjet-n8n).
   - Test: `nohup cloudflared tunnel run <name> > /tmp/cloudflared.log 2>&1 &`
4. Update backend service for new URL:
   - `WEBHOOK_URL=https://n8n.hafjet.my`
   - `N8N_HOST=n8n.hafjet.my`
   - `N8N_PROTOCOL=https`
   - `N8N_PROXY_HOPS=1`
   Update .env **and** docker-compose.yml environment section.
5. Restart service/container.
6. Verify: dashboard shows Active + connector; `curl -I https://n8n.hafjet.my` succeeds; webhooks register correctly.

## DNS for the public hostname (important in this session)
When added via the tunnel UI (Public Hostnames / Published application routes / Hostname routes), Cloudflare auto-creates a special **"Tunnel"** record type. It may appear as "Tunnel" or "[object Object]" in the DNS list. This is correct and preferred.

User example: tried manual CNAME first ("saya dah letak type cname"), it auto-changed to Tunnel type with object object content. Confirmed with "ini ke" on the tunnel page screenshot.

Manual fallback: CNAME `n8n` → `<tunnel-id>.cfargotunnel.com` (proxied). Use the ID from tunnel Overview (e.g. c8f5d4d9-e942-48c7-9190-b495ecc07df9.cfargotunnel.com).

## Registrar (Exabyte / MSHosting) nameserver change (the final gate)
After adding the route and DNS in Cloudflare, the domain must use Cloudflare nameservers for the records (including the tunnel hostname) to be live.

At registrar:
- Switch to custom nameservers: lauryn.ns.cloudflare.com + sterling.ns.cloudflare.com
- Delete all old nameservers.
- Turn off DNSSEC (if on).

User confirmation: "ok betul dah" with screenshot of the custom NS fields filled.

Current authoritative NS must be verified with `dig NS yourdomain` (old mschosting nameservers mean propagation not complete).

## n8n / backend updates (from this session)
In .env and docker-compose:
WEBHOOK_URL=https://n8n.hafjet.my
N8N_HOST=n8n.hafjet.my
N8N_PROTOCOL=https
N8N_PROXY_HOPS=1

Restart: `docker-compose down && docker-compose up -d`

Local test first: `curl -I http://localhost:5678` (must return 200 before public tests).

## Verification & propagation discipline (session pattern)
Always:
1. Local service responds.
2. `dig NS yourdomain` shows Cloudflare NS (the gate).
3. `dig n8n.yourdomain +short` shows *.cfargotunnel.com.
4. Public: `curl -I https://n8n.yourdomain` + healthz.
5. Dashboard: connector connected (not just route published).
6. Logs: `journalctl -u cloudflared -f`

User server note: commands run on HAFJET-Hermes-Server (the n8n host with ~/.n8n), not necessarily the "hafjet-pc-office" physical machine.

## Pitfalls observed
- Route published but Inactive / no connector → cert or service issue.
- Cert path error repeating → `cloudflared tunnel login` required on the server.
- DNS "could not resolve" even after adding record → nameservers not propagated (old registrar NS still authoritative).
- Adding records at registrar after NS change → ignored.
- Screenshot-driven confirmation is the expected interaction for config changes ("ini ke", "betul tak").

See also the main cloudflare skill Tunnel section and other references/tunnel/ files for broader context. This session produced the complete end-to-end (device profile → tunnel route → DNS "Tunnel" record or manual → registrar NS change → systemd service → n8n config → dig-gated verification).