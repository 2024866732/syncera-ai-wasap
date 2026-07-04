# Server Resource Optimization — Pre-Deploy Readiness

**Date:** 2026-07-04
**Purpose:** Systematic approach to recovering RAM on a tight-memory Hermes server (848Mi RAM, 1.2Gi/4Gi swap used) before production deploys.

## When to Use

- Server RAM is >70% + swap usage >25%
- Before deploying a new build that needs more memory
- After prolonged uptime (services accumulate)
- When the user asks "optimise memory usage"

## Investigation Pattern

### 1. Baseline Memory

```bash
free -h
swapon --show
cat /proc/loadavg
```

### 2. Identify Top RAM Consumers

```bash
ps aux --sort=-%mem | head -15
```

### 3. Check for Zombies

```bash
# Look for 'Z' or 'Z+' in STAT column
ps aux | awk '$8 ~ /Z/ {print}'
```

### 4. Verify Each Candidate Before Stopping

For each process in the top list, ask:

| Question | Method |
|----------|--------|
| What does this service do? | `systemctl status <service>` or `ps -p <pid> -o args` |
| Is it actively serving traffic? | Check port listeners (`ss -tlnp`), connection counts, log timestamps |
| Is it needed for the Hermes agent? | If the Hermes gateway process depends on it, do NOT stop |
| Is it required by the cloud platform? | Azure VM agents (WALinuxAgent) are needed — do NOT stop |

### 5. Stop Safely

```bash
# Systemd services
sudo systemctl stop <service>.service
sudo systemctl disable <service>.service

# Also disable the .socket unit if present
sudo systemctl stop <service>.socket 2>/dev/null
sudo systemctl disable <service>.socket 2>/dev/null

# PM2 (even if empty)
pm2 kill
pm2 unstartup

# Direct process kill
kill <PID>
```

### 6. Verify Impact

```bash
free -h
ps aux --sort=-%mem | head -10
```

## Common Azure Linux VM Candidates

| Service | Typical RSS | Safe to Stop? | Notes |
|---------|:-----------:|:-------------:|-------|
| **multipathd** | 27Mi | ✅ Yes — single-disk VMs | DM-Multipath Device Controller. Only needed for SAN/RAID with multiple paths to same storage. Azure single-disk VMs never use it. |
| **snapd** | 20Mi | ✅ Yes — unless you use snaps | Snap package background daemon. LXD snap inactive by default. Can re-enable with `sudo snap install` if needed later. |
| **ngrok** | 21Mi | ⚠️ Verify first | Development tunnel. Check if it's actually serving traffic (see Tunnel Verification below). |
| **PM2** | 8Mi | ✅ Yes — if 0 running processes | Node.js process manager. If `pm2 list` shows no apps, it's a waste. |
| **packagekit** | 6Mi | ⚠️ Low impact | Package management daemon. Stops on memory pressure. |
| **WALinuxAgent** | 21Mi | ❌ No — Azure required | Azure VM management agent. Restarting interrupts platform management. |

## Tunnel Verification (Before Killing ngrok/Cloudflare Tunnel)

Before stopping a tunnel, confirm it's not being used by Meta webhook or any other service:

```bash
# 1. Check what port the tunnel forwards to
curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
tunnels = json.load(sys.stdin).get('tunnels', [])
for t in tunnels:
    print(f'Forward to: {t[\"config\"][\"addr\"]}')
    print(f'Total connections: {t[\"metrics\"][\"conns\"][\"count\"]}')
"

# 2. Check if anything is listening on the target port
ss -tlnp | grep <port>

# 3. Check Azure/Meta webhook URL — is it pointing to the tunnel URL or the deployed app URL?
# Meta webhook is configured in Meta Developer Portal → WhatsApp → Configuration

# 4. If the tunnel is forwarding to a port with no service AND the deployed app is publicly
# reachable via Azure URL, the tunnel is safe to kill.
```

**On this server (2026-07-04):** ngrok tunnel → `localhost:8443`, but port 8443 had ZERO listeners. Meta webhook was already pointing to `hafjet-whatsapp-bot.azurewebsites.net/webhook`. Ngrok was a leftover from development, running 11+ days without serving any traffic.

## Memory Math

With 848Mi total RAM:
- Hermes gateway: ~200Mi (23%) — unavoidable
- System services: ~100Mi (12%)
- Buffer/cache: ~250Mi (29%) — reclaimable under pressure
- Available: ~180Mi (21%) — may degrade during heavy usage
- Swap: 1.2Gi/4Gi (30%) — acceptable but indicates chronic pressure

**Practical impact of optimization:** Stopping 4 services (multipathd, snapd, PM2, ngrok) frees ~76Mi. This reduces swap pressure but does NOT eliminate it. For production, upgrade to a VM with ≥2Gi RAM.
