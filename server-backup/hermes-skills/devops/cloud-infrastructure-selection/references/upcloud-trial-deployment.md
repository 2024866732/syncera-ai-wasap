# UpCloud Trial Deployment — Max Out Guide

## Key Insight (CRITICAL)
UpCloud trial $250 credit **CANNOT be fully spent** in 14 days.
Quota system hard-limits concurrent resources — not dollar spend.
Max deployable: ~$60 worth of resources over 14 days.

## Trial Quotas (Verified via API)
| Resource | Limit | Notes |
|----------|-------|-------|
| Cores | **8 total** | Across ALL servers (not per-server) |
| Memory | **16 GB total** | Across ALL servers |
| Storage | **1024 GB** | Across all storage |
| Cloud Servers | **5 dev plans** | Can create/delete/recreate freely |
| Managed PostgreSQL | 1 × 1xCPU-4GB | |
| Managed Valkey (Redis) | 1 × 1xCPU-2GB | |
| Managed OpenSearch | 1 × 1xCPU-4GB | |
| Object Storage | 1 × 250GB | |
| NAT Gateway | 1 × Standard | |
| Load Balancer | 1 × Dev 1000 sess | |
| Kubernetes | 1 × Dev cluster | |
| Block Storage | 3 × 60GB (maxiops/std/archive) | |
| Network | 2 IPv4 + 2 IPv6 | |

**CRITICAL CORRECTION:** The quota is NOT "1 server at a time" — it's a total resource limit. You CAN deploy multiple servers as long as total cores ≤ 8 and total RAM ≤ 16GB. The "1 × 2C/4GB" in older docs refers to a recommended starting config, not a hard limit.

## Unavailable in Trial
- GPU servers
- Windows servers
- Private cloud
- SMTP port 25 (blocked)

## Deployment Files
All in `/home/hafizi145/upcloud-trial/`:
- `deploy_all.py` — UpCloud API deployer (parallel)
- `cloud-init.yaml` — Server bootstrap (Docker, k3s, monitoring, stress tools)
- `docker-compose.yml` — Full HAFJET stack
- `Caddyfile` — Reverse proxy
- `stress_all.py` — 18 stress tests + chaos engineering
- `.env.template` — Environment variables

## API Credentials (Updated 2026-08 — Bearer Token Auth)
UpCloud now uses **API tokens** (ucat_ prefix) with Bearer auth, not Basic auth.
```bash
export UPCLOUD_TOKEN="ucat_01KYZ08ECQK5CHXGYTZ21MABB2"
```
Get from: https://hub.upcloud.com → Profile → API Tokens → Create API Token

**Test connection:**
```bash
curl -s -H "Authorization: Bearer $UPCLOUD_TOKEN" "https://api.upcloud.com/1.3/account" | python3 -m json.tool
```

### Python SDK Usage (upcloud-api)
```bash
pip install upcloud-api  # Installs to python3.10 site-packages
```
```python
from upcloud_api import CloudManager, Server, Storage, login_user_block

# Connect with Bearer token (NOT username/password)
cm = CloudManager(token='ucat_...')

# Templates are dicts: {"Ubuntu Server 26.04 LTS": "uuid-here"}
templates = cm.get_templates()

# Create server
server = Server(
    zone='sg-sin1',
    title='My Server',
    hostname='my-host',
    plan='2xCPU-4GB',
    storage_devices=[Storage(action='clone', storage=UBUNTU_UUID, size=80)],
    login_user=login_user_block(
        username='ubuntu',
        create_password=False,
        ssh_keys=[pub_key]  # ALWAYS include SSH key at creation!
    ),
    user_data=cloud_init_yaml,
    metadata=True  # REQUIRED when using cloud-init templates
)
created = cm.create_server(server)

# Poll for started (SDK has no wait_for_started)
import time
while True:
    time.sleep(5)
    s = cm.get_server(created.uuid)
    if s.state == 'started':
        break

# Get public IP (check ip_obj.access == 'public')
for ip_obj in s.ip_addresses:
    if ip_obj.access == 'public':
        public_ip = ip_obj.address
```

**CRITICAL Pitfalls:**
- `login_user` is **readonly** after creation — cannot add SSH keys later
- If SSH key missing at creation → delete server + recreate (no modify)
- `metadata=True` is **required** when cloning cloud-init templates
- Templates are dicts (`{name: uuid}`), not objects with `.title`
- SDK `wait_for_started()` doesn't exist — manual polling required

### API Access: Basic Auth vs Bearer Token
**Basic auth (username/password)** gets `UNAUTHORIZED_ADDRESS` from Azure/cloud IPs.
**Bearer token** works fine from Azure VMs — no IP blocking.

If you only have Basic auth credentials:
1. Login → Profile → API Tokens → Create Token → use Bearer instead
2. Or use Control Panel GUI to deploy

```bash
# ❌ Basic auth — BLOCKED from Azure
curl -u "user:pass" "https://api.upcloud.com/1.3/account"

# ✅ Bearer token — WORKS from Azure
curl -H "Authorization: Bearer $UPCLOUD_TOKEN" "https://api.upcloud.com/1.3/account"
```

## Docker Compose v2 Installation
UpCloud Ubuntu images may not have Docker Compose v2 pre-installed:
```bash
# Check if available
docker compose version

# If not found, install:
sudo apt-get install -y docker-compose-v2

# Fallback: install binary manually
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## Tailscale Setup on UpCloud
For iPhone/remote access via Tailscale mesh VPN:
```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Start daemon + authenticate (ONE TIME ONLY — see self-hosted-deployment skill for auth loop pitfall)
sudo systemctl start tailscaled
sudo tailscale up --hostname=hafjet-upcloud
# → gives auth URL, user clicks ONCE

# Verify
sudo tailscale status
sudo tailscale ip -4   # → e.g. 100.98.171.12

# Access services via Tailscale IP
# http://100.98.171.12:8082 (inventory dashboard)
# http://100.98.171.12:8092 (CRM dashboard)
```

## Deploy Flow
```bash
# 1. Deploy all managed services (or use Control Panel if API blocked)
python3 deploy_all.py

# 2. SSH to server
ssh -i /tmp/hafjet-trial-key ubuntu@SERVER_IP

# 3. Deploy app stack
docker compose up -d

# 4. Stress tests
python3 /opt/stress-tests/run_all.py
```

## Backup Before Trial (MANDATORY)
Always backup critical data before infrastructure experiments:
```bash
# Local backup
mkdir -p ~/backups/pre-upcloud-trial
tar czf ~/backups/pre-upcloud-trial/hermes-config.tar.gz -C ~/.hermes config.yaml memories/ skills/ cron/ plugins/
tar czf ~/backups/pre-upcloud-trial/whatsapp-bot-code.tar.gz -C ~/.hermes/whatsapp-bot --exclude='node_modules' .
cp ~/.hermes/whatsapp-bot/bot_data.db ~/backups/pre-upcloud-trial/

# GitHub private backup (recommended)
gh repo create hafjet-backups --private
cd ~/backups/pre-upcloud-trial && git init && git add . && git commit -m "pre-trial backup" && git push origin main
```

## Restore After Trial
```bash
git clone https://github.com/2024866732/hafjet-backups.git
cd hafjet-backups && bash RESTORE.sh
```

## Disk Cleanup Before Deploy
If server disk is >90% full, clean before deploying:
```bash
# Check what's using space
du -sh ~/.cache/ /var/log/ /tmp/ ~/promptschat/node_modules/

# Safe cleanup
sudo apt-get clean
rm -rf ~/.cache/pip/ /tmp/*
rm -rf ~/promptschat/node_modules/  # can reinstall with npm install

# Check result
df -h /
```

## Pre-Backup Checklist (Before Any Major Infra Change)
```bash
# 1. Create backup directory
mkdir -p ~/backups/pre-$(date +%Y%m%d)

# 2. Backup Hermes config + data
tar czf ~/backups/pre-$(date +%Y%m%d)/hermes-config.tar.gz -C ~/.hermes config.yaml memories/ skills/ cron/ plugins/

# 3. Backup bot code + database
tar czf ~/backups/pre-$(date +%Y%m%d)/whatsapp-bot-code.tar.gz -C ~/.hermes/whatsapp-bot --exclude='node_modules' .
cp ~/.hermes/whatsapp-bot/bot_data.db ~/backups/pre-$(date +%Y%m%d)/

# 4. Backup Azure settings
az webapp config appsettings list -g hafjet-bot-rg -n hafjet-whatsapp-bot -o json > ~/backups/pre-$(date +%Y%m%d)/azure-settings.json

# 5. Create restore script
cat > ~/backups/pre-$(date +%Y%m%d)/RESTORE.sh << 'EOF'
#!/bin/bash
set -e
tar xzf hermes-config.tar.gz -C ~/.hermes/
tar xzf whatsapp-bot-code.tar.gz -C ~/.hermes/whatsapp-bot/
cp bot_data.db ~/.hermes/whatsapp-bot/
echo "Restore complete. Run: az webapp config appsettings set -g hafjet-bot-rg -n hafjet-whatsapp-bot --settings @azure-settings.json"
EOF
chmod +x ~/backups/pre-$(date +%Y%m%d)/RESTORE.sh

# 6. Push to GitHub (optional but recommended)
cd ~/backups/pre-$(date +%Y%m%d) && git init && git add . && git commit -m "pre-change backup" && git push origin main
```

## Disk Cleanup Before Deploy
If server disk is >90% full, clean before deploying:
```bash
# Check what's using space
du -sh ~/.cache/ /var/log/ /tmp/ ~/promptschat/node_modules/

# Safe cleanup
sudo apt-get clean
rm -rf ~/.cache/pip/ /tmp/*
rm -rf ~/promptschat/node_modules/  # can reinstall with npm install

# Check result
df -h /
```

## Zone Selection
- `sg-sin1` — Singapore, closest to Malaysia (~5-10ms)
- `de-fra1` — Frankfurt, best disk I/O (19.7 GB/s sequential), ~30ms from MY
- `uk-lon1` — London, ~35ms from MY
- `nl-ams1` — Amsterdam, ~35ms from MY
- `au-syd1` — Sydney, ~15ms from MY

**Fallback:** If `sg-sin1` returns `SERVER_RESOURCES_UNAVAILABLE`, try `de-fra1` first — it often has better performance anyway.

## Cloud-Init YAML Pitfall
**NEVER use nested heredocs in cloud-init YAML** — causes parse errors.
Use separate `write_files:` blocks instead:
```yaml
# ❌ BROKEN — heredoc inside heredoc
runcmd:
  - |
    cat > /opt/file.sh << 'EOF'
    #!/bin/bash
    echo "test"
    EOF

# ✅ CORRECT — use write_files
write_files:
  - path: /opt/file.sh
    content: |
      #!/bin/bash
      echo "test"
```

## Stress Tests Available
CPU, Memory, Disk I/O (seq/rand/mixed), Network (iperf3/cloudflare),
Database (pgbench/valkey), HTTP load (hey), K8s pod operations,
Docker build, Chaos engineering (disk fill, service kills, network block)

## Actual Benchmark Results (2026-08)

### Singapore (sg-sin1) — 2xCPU-4GB, AMD EPYC 9575F, 80GB MaxIOPS

| Test | UpCloud (SG) | Azure B1s (MY) | Improvement |
|------|-------------|----------------|-------------|
| CPU | AMD EPYC 9575F (2 cores) | i3-2100 (2 cores) | 3-5x faster |
| RAM | 3.8GB / 0 swap | 1GB / 1.2GB swap | 4x RAM, 0 swap |
| Disk Random 4K Mixed | 512 MB/s read | ~23 MB/s | 22x faster |
| Disk Random 4K IOPS | 4.8 GB/s read | ~23 MB/s | 208x faster |
| Latency to OpenRouter | 0.987ms | ~10ms | 10x lower |
| K8s 10 pods | deployed in <5s | no k3s | available |

### Frankfurt (de-fra1) — SAME PLAN, BETTER DISK I/O

| Test | Frankfurt | Singapore | Note |
|------|-----------|-----------|------|
| Disk Sequential 128K | **19.7 GB/s** | N/A | Frankfurt = tech hub, faster storage |
| Disk Random 4K Mixed | **1.35 GB/s** read | 512 MB/s | **2.6x faster** |
| Disk Random 4K Write | **580 MB/s** | ~43 MB/s | **13x faster** |
| LLM Speed (llama3.2:3b) | 30 tok/s | 34 tok/s | Comparable |
| Latency to OpenRouter | **0.9ms** | 0.99ms | Slightly lower |
| LLM Concurrent (2 req) | 30 tok/s each | N/A | Handles parallel well |

**Key finding:** Frankfurt has significantly better disk I/O than Singapore (19.7 GB/s sequential vs unknown SG). Both zones have modern EPYC CPUs. Frankfurt is a major tech hub with faster storage infrastructure. If Singapore is full, Frankfurt is an excellent fallback — actually BETTER for I/O-heavy workloads.

### Zone Capacity Fallback Pattern

**Problem:** Singapore zone can become completely full (`SERVER_RESOURCES_UNAVAILABLE`).
**Solution:** Try multiple zones in order of preference:

```python
zones = ['de-fra1', 'uk-lon1', 'nl-ams1', 'us-nyc1', 'us-sjo1', 'au-syd1']
for zone in zones:
    try:
        created = cm.create_server(server)
        # Wait for started...
        break
    except UpCloudAPIError as e:
        if 'RESOURCES_UNAVAILABLE' in str(e):
            print(f"{zone} full, trying next...")
            continue
```

**Zone proximity to Malaysia:**
1. `sg-sin1` — Singapore (~5ms, closest)
2. `au-syd1` — Sydney (~15ms)
3. `de-fra1` — Frankfurt (~30ms, best disk I/O)
4. `uk-lon1` — London (~35ms)
5. `nl-ams1` — Amsterdam (~35ms)

**Lesson learned:** Don't give up when one zone is full — other zones may have BETTER performance.

## RAM Optimization — Verified Results (2026-08)

On a 848Mi RAM server (Azure B1s), stopped these unnecessary services:

| Service | RAM Saved | How to Stop | Risk |
|---------|-----------|-------------|------|
| multipathd | -27Mi | `sudo systemctl stop disable multipathd` | Zero — single disk VM |
| snapd | -20Mi | `sudo systemctl stop disable snapd snapd.socket` | Low — no snaps used |
| PM2 | -8Mi | `pm2 kill && pm2 unstartup` | Zero — 0 processes running |
| ngrok | -21Mi | `kill $(pgrep ngrok)` | Low if no active tunnel |
| **Total** | **~76Mi** | | |

**Verify ngrok is unused before killing:**
```bash
# Check what port ngrok tunnels to
curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import sys,json; [print(f'{t[\"name\"]}: {t[\"config\"][\"addr\"]}') for t in json.load(sys.stdin).get('tunnels',[])]"

# Check if that port has anything listening
ss -tlnp | grep <port>

# If nothing listening = safe to kill ngrok
```

**After cleanup:**
- Available RAM: 210Mi → 286Mi (35% improvement)
- Swap pressure reduced

## UpCloud Trial: Resource Optimization
Trial accounts have limited quotas but $250 credit. To maximize experience:

**Stop unnecessary services to free RAM:**
```bash
# Check what's using RAM
ps aux --sort=-%mem | head -15

# Common candidates to stop:
sudo systemctl stop multipathd && sudo systemctl disable multipathd  # -27Mi (single disk VM)
sudo systemctl stop snapd && sudo systemctl disable snapd            # -20Mi (if not using snaps)
pm2 kill && pm2 unstartup                                           # -8Mi (if no PM2 apps)
kill $(pgrep ngrok)                                                  # -21Mi (if tunnel unused)
```

**Verify ngrok is unused before killing:**
```bash
# Check what port ngrok tunnels to
curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import sys,json; [print(f'{t[\"name\"]}: {t[\"config\"][\"addr\"]}') for t in json.load(sys.stdin).get('tunnels',[])]"

# Check if that port has anything listening
ss -tlnp | grep <port>

# If nothing listening = safe to kill ngrok
```