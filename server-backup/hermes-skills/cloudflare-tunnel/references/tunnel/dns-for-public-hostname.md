# DNS for Public Hostname (Cloudflare Full after registrar)

When domain (e.g. hafjet.my) was at registrar (Exabyte) and moved to Cloudflare Full:

- Tunnel public hostname/route in dashboard does **not** auto-create DNS record.
- Manually add CNAME in Cloudflare DNS:
  - Type: CNAME
  - Name: n8n (subdomain)
  - Target (Cname field): `<tunnel-id>.cfargotunnel.com`
    (copy exact Tunnel ID from tunnel Overview tab, e.g. c8f5d4d9-e942-48c7-9190-b495ecc07df9.cfargotunnel.com)
- Proxy status: Proxied (orange cloud)

User often confirms the value with "ini ke?" by sharing the tunnel Overview screenshot before pasting into the DNS add form.

After adding:
- Wait 30s–1min
- Test: `dig n8n.hafjet.my +short`
- Test: `curl -I https://n8n.hafjet.my`

Local bypass test (always works if n8n running): `curl -I http://localhost:5678`

See main SKILL.md for related migration, cert, and device profile steps.