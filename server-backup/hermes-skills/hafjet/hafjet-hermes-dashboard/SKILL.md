---
name: hafjet-hermes-dashboard
description: "Expose Hermes Agent web dashboard on a headless server via Tailscale. Secure access with basic auth for non-loopback bind. Covers serve vs dashboard distinction, Tailscale Serve setup, and common pitfalls."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Hermes Dashboard (Headless + Tailscale)

## Overview

Akses Hermes Dashboard (web UI) dari laptop melalui Tailscale — untuk server headless macam PC Office.

**Platform:** Ubuntu Server | **Tools:** Hermes Agent, Tailscale

---

## ⚠️ Critical: `hermes serve` vs `hermes dashboard`

| Command | Purpose | Web UI? |
|---------|---------|:------:|
| `hermes serve` | JSON-RPC/WebSocket backend — **headless backend, no browser UI** | ❌ |
| `hermes dashboard` | Full web UI dashboard — config, API keys, sessions | ✅ |

> **Pitfall:** `hermes serve` akan return `{"error":"Headless backend... use `hermes dashboard` for the browser UI."}` bila dibuka di browser. Sentiasa guna `hermes dashboard` untuk akses web.

---

## Setup

### Step 1: Start Dashboard (non-loopback bind Wajib Auth)

```bash
# Dapatkan Tailscale IP
tailscale ip -4
# → 100.121.94.41

# Start dashboard (bind ke Tailscale IP — bukan 127.0.0.1)
hermes dashboard --host 100.121.94.41 --port 9119
```

Bila bind non-loopback (`--host` bukan `127.0.0.1`), Hermes WAJIB auth. Pilih **`[1] Username & password`**:

```
Choice [1]: 1
Username: hafizi145
Password: ***
```

Auth credentials disimpan dalam `~/.hermes/config.yaml`:

```yaml
dashboard:
  basic_auth:
    username: hafizi145
    password_hash: "..."
```

### Step 2: Expose via Tailscale (Opsional)

Ni hanya perlu kalau nak HTTPS / domain Tailscale. Kalau direct HTTP via Tailscale IP dah cukup (tailnet encrypted), skip.

```bash
# Set operator (sekali je)
sudo tailscale set --operator=$USER

# Serve
tailscale serve --bg localhost:9119

# Verify
tailscale serve status
# → https://hafjet-pc-office.tail260d72.ts.net/
```

> **Pitfall:** Jika `tailscale serve --bg localhost:9119` return `Access denied: serve config denied`, perlu `sudo tailscale set --operator=$USER` dulu.

### Step 3: Akses dari Laptop

```
# Direct (Tailscale IP) — HTTP OK, tailnet encrypted
http://100.121.94.41:9119

# Tailscale Serve (HTTPS auto)
https://hafjet-pc-office.tail260d72.ts.net/
```

---

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| `{"error":"Headless backend..."}` | Guna `hermes dashboard`, bukan `hermes serve` |
| `Refusing to bind dashboard to 0.0.0.0` | Bind ke Tailscale IP (bukan `0.0.0.0`), atau setup basic auth dulu |
| `"Invalid Host header"` via Tailscale Serve | **JANGAN guna `tailscale serve` untuk dashboard.** Tailscale proxy tukar Host header → Hermes tolak. Fix: bind direct ke Tailscale IP (`--host 100.x.x.x`) dan akses direct via `http://100.x.x.x:9119`. Tailscale encrypt wireguard tunnel — plain HTTP selamat. |
| `tailscale serve: Access denied` | `sudo tailscale set --operator=$USER` |
| Prompt `Choice [1]:` kena trap oleh background `&` | Jangan run `hermes serve --host ... &` — prompt auth masuk background, terminal return `Choice [1]: 1: command not found`. Run FOREGROUND, lepas auth selesai baru `Ctrl+Z` → `bg`. |

---

## Lifecycle Commands

```bash
# Check status
hermes dashboard --status

# Stop
hermes dashboard --stop

# Restart (kill + start)
pkill -f "hermes dashboard"
hermes dashboard --host <TAILSCALE_IP> --port 9119 &

# Tailscale cleanup
tailscale serve --https=443 off
```

---

## Auto-Start (Systemd)

```bash
# Hermes gateway install handles this
hermes gateway install
hermes gateway start

# Dashboard auto-start via systemd user service
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/hermes-dashboard.service << 'EOF'
[Unit]
Description=Hermes Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/hafizi145/.local/bin/hermes dashboard --host 100.121.94.41 --port 9119
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable hermes-dashboard
systemctl --user start hermes-dashboard
systemctl --user status hermes-dashboard
```
