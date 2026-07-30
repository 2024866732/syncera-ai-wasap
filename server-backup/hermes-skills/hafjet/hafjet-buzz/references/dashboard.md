# Hermes Dashboard on Headless Server

## Start Dashboard

```bash
# Bind to Tailscale IP (requires auth)
hermes dashboard --host 100.121.94.41 --port 9119
# → Pilih [1] Username & password (untuk trusted LAN/VPN)
# → Set username + password
```

## Access via Tailscale

```
# Direct (Tailscale VPN)
http://100.121.94.41:9119

# Tailscale Serve (HTTPS tunnel)
tailscale serve --bg localhost:9119
# → https://hafjet-pc-office.tail260d72.ts.net/
```

## Commands

| Command | Purpose |
|---------|---------|
| `hermes dashboard --host <IP> --port <PORT>` | Start web UI |
| `hermes dashboard --status` | List running instances |
| `hermes dashboard --stop` | Stop all |
| `hermes serve --host <IP> --port <PORT>` | Headless backend (no UI) |

## Notes

- `hermes serve` vs `hermes dashboard`: `serve` = backend only (JSON-RPC), `dashboard` = full web UI
- Binding to non-loopback requires auth provider (password or OAuth)
- `--insecure` is deprecated (June 2026)
