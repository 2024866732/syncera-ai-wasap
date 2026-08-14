# Oracle Cloud Infrastructure — WhatsApp Bot Deployment

Deploy WhatsApp Cloud API bots to Oracle Cloud Infrastructure (OCI) Always Free tier. Use when the user asks about Oracle Cloud, OCI, A1.Flex, or migrating from Azure to Oracle.

## Always Free Limits (Official — docs.oracle.com, updated 2026-08-05)

> **⚠️ CRITICAL: Oracle HALVED its Always Free Ampere A1 limits in June 2026.**
> Previous limit: 4 OCPU / 24 GB → **Current limit: 2 OCPU / 12 GB total across ALL A1 instances.**
>
> **UPDATE (2026-08-05):** Pay-As-You-Go accounts get higher limits. User confirmed successful deployment of 4 OCPU / 24 GB after upgrading from Always Free to Pay-As-You-Go. Billing shows SGD 0.00 for A1.Flex instances (Always Free tier remains free even on PAYG accounts).

| Resource | Always Free Limit | Pay-As-You-Go Limit | Notes |
|----------|-------------------|---------------------|-------|
| **A1.Flex OCPU** | 2 OCPU total | 4+ OCPU | 1,500 OCPU-hours/month (Always Free). PAYG removes limit. |
| **A1.Flex RAM** | 12 GB total | 24+ GB | 9,000 GB-hours/month (Always Free). PAYG removes limit. |
| **Block Storage** | 200 GB | 200 GB+ | Boot + block volumes combined. |
| **Object Storage** | 20 GB | 20 GB+ | Standard tier, free. |
| **Outbound Data** | 10 TB / month | 10 TB+ | Generous — sufficient for WhatsApp bot traffic. |

### Pay-As-You-Go Upgrade Process (2026-08-05)

**Problem:** Always Free accounts in `ap-kulai-2` region have ARM capacity exhaustion. Even after account upgrade to PAYG, capacity may not immediately improve.

**Solution:**
1. Upgrade to Pay-As-You-Go via Oracle Console
2. Wait for email confirmation (5-10 minutes)
3. Retry instance creation with full 4 OCPU / 24 GB spec
4. If still "Out of host capacity", wait and retry — capacity fluctuates

**Billing Impact:**
- A1.Flex instances remain **FREE** even on PAYG accounts
- Only overages (beyond Always Free limits) are charged
- Monitor billing at `https://cloud.oracle.com/billing`

### Docker Rebuild vs Restart for Env Changes (2026-08-14)

**Problem:** When adding new environment variables to `.env` (e.g., `INTERNAL_API_KEY`), simply restarting the container does NOT load the new values. Docker containers only read `env_file` at build time, not at restart.

**Symptom:** Container logs show "INTERNAL_API_KEY not configured" even after adding the key to `.env` and restarting.

**Solution:** Must rebuild the container (not just restart) to pick up new environment variables:

```bash
# ❌ WRONG — won't load new env vars
sudo docker compose restart

# ✅ CORRECT — rebuilds with new env
sudo docker compose down
sudo docker compose up -d --build
```

**When to rebuild vs restart:**

| Change Type | Action | Example |
|-------------|--------|---------|
| Code changes (.py files) | Restart only | `sudo docker compose restart` |
| New env vars in .env | Rebuild | `sudo docker compose down && sudo docker compose up -d --build` |
| Dockerfile changes | Rebuild | `sudo docker compose down && sudo docker compose up -d --build` |
| Volume data changes | Restart only | Database schema updates |
| Image updates | Rebuild | `sudo docker compose pull && sudo docker compose up -d` |

**Quick check:** If container logs show old env values, rebuild is needed.

### Ollama Docker Networking (2026-08-05)

**Problem:** Ollama listens on `127.0.0.1:11434` by default. Docker containers cannot access localhost of the host.

**Solution:**
1. Set `OLLAMA_HOST=0.0.0.0` in Ollama systemd service
2. Use `network_mode: host` in Docker Compose for services needing Ollama access
3. Or use Docker gateway IP (`172.17.0.1`) — less reliable

**Configuration:**
```bash
# Add to /etc/systemd/system/ollama.service
Environment="OLLAMA_HOST=0.0.0.0"

# Docker Compose
services:
  whatsapp-api:
    network_mode: host  # Access Ollama on localhost:11434
```

### iptables Firewall on Oracle Cloud VMs (2026-08-05)

**Problem:** Oracle Cloud VMs have iptables rules that block most ports by default. Even after opening ports in OCI Security Lists, the VM's iptables may still block traffic.

**Symptom:** Port is open in OCI Security List but `curl http://<public-ip>:<port>` times out.

**Diagnosis:**
```bash
# Check iptables rules
sudo iptables -L -n | head -20

# Look for REJECT rules in INPUT chain
# If you see: REJECT 0 -- 0.0.0.0/0 0.0.0.0/0 reject-with icmp-host-prohibited
# This means iptables is blocking non-SSH traffic
```

**Solution:**
```bash
# Allow specific ports
sudo iptables -I INPUT 3 -p tcp --dport 8200 -j ACCEPT  # API port
sudo iptables -I INPUT 4 -p tcp --dport 8117 -j ACCEPT  # Dashboard port

# Make persistent (survives reboot)
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

**Port checklist for WhatsApp Bot deployment:**
| Port | Purpose | iptables rule |
|------|---------|---------------|
| 22 | SSH | Already open (default) |
| 80 | HTTP (Command Center) | May need to add |
| 443 | HTTPS | May need to add |
| 8200 | WhatsApp Bot API | Must add |
| 8117 | Dashboard UI | Must add |
| 5440 | PostgreSQL (local only) | Don't expose publicly |

### Pydantic BaseSettings Migration (2026-08-05)

**Problem:** In Pydantic v2, `BaseSettings` moved to a separate package `pydantic-settings`.

**Error:**
```
pydantic.errors.PydanticImportError: `BaseSettings` has been moved to the `pydantic-settings` package.
```

**Solution:**
```bash
# Add to requirements.txt
pydantic-settings==2.7.0
```

```python
# WRONG (Pydantic v1)
from pydantic import BaseSettings

# CORRECT (Pydantic v2)
from pydantic_settings import BaseSettings
```

### Dashboard Deployment Pattern (2026-08-05)

**Problem:** Need to serve a static HTML dashboard alongside the FastAPI API.

**Solution options:**

**Option 1: Nginx container (recommended for production)**
```yaml
services:
  dashboard:
    image: nginx:alpine
    volumes:
      - ./dashboard.html:/usr/share/nginx/html/index.html:ro
    ports:
      - "8117:80"
    restart: unless-stopped
```

**Option 2: FastAPI StaticFiles (simpler)**
```python
from fastapi.staticfiles import StaticFiles

app.mount("/dashboard", StaticFiles(directory="dashboard", html=True), name="dashboard")
```

**Option 3: Python HTTP server (dev/testing only)**
```bash
docker run -d --name dashboard -p 8117:8117 \
  -v $(pwd)/dashboard.html:/app/index.html \
  -w /app python:3.12-slim python -m http.server 8117
```

**Don't forget:** Open the port in both OCI Security List AND iptables!

### Instance Splitting Options

With 2 OCPU / 12 GB total, you can:
- **Option A (recommended):** 1× VM with 1 OCPU / 6 GB (leaves headroom)
- **Option B (maxed):** 1× VM with 2 OCPU / 12 GB (uses full quota)
- **Option C (micro):** 2× VMs with 1 OCPU / 6 GB each (split across two)

### OCI Snapshots/Backups — Quota-Dependent

- **5 volume backups** included in Always Free (within 200 GB block storage quota)
- **NOT unlimited** — each backup consumes block storage quota
- **Boot volume snapshots** count toward the 200 GB limit
- **Recommendation:** Keep 1–2 recent snapshots, rotate old ones
- **Snapshots do NOT count toward OCPU/RAM quota** — only storage

### OCI CLI Authentication Troubleshooting

**Fingerprint mismatch error:**
```
ServiceError: {'code': 'NotAuthenticated', 'message': 'Failed to verify the HTTP(S) Signature', 'status': 401}
```

**Cause:** The private key file (`~/.oci/oci_api_key.pem`) does NOT match the fingerprint stored in OCI Console for the user.

**Fix:**
1. Generate new key pair: `openssl genrsa -out ~/.oci/oci_api_key.pem 2048`
2. Get public key: `openssl rsa -pubout -in ~/.oci/oci_api_key.pem -out ~/.oci/oci_api_key_public.pem`
3. Get fingerprint: `openssl rsa -in ~/.oci/oci_api_key.pem -pubout -outform DER | openssl md5 -c`
4. Upload public key to OCI Console: Identity & Security → Users → [user] → API Keys → Add API Key
5. Update `~/.oci/config` with new fingerprint
6. Test: `oci os ns get` — should return namespace

**Config file location:** `~/.oci/config` (NOT `/tmp/oci-config`)

**Key permissions:** `chmod 400 ~/.oci/oci_api_key.pem`

**Note:** OCI CLI cannot do cross-region queries with Always Free tenancy (returns 401 for non-home-region API calls). Always use home region (`ap-kulai-2`) for CLI operations.

Always Free resources available in all commercial regions. For Malaysia latency:
- **Malaysia West 2 (Kulai) — `ap-kulai-2`** — Best choice for Malaysian users. Launched Feb 2026, new region with ample A1.Flex capacity. Single AD: `rOJM:AP-KULAI-2-AD-1`. Always Free eligible.
- **Singapore (ap-southeast-1)** — ~30-50ms to Malaysia. May have "Out of Host Capacity" for A1.Flex in popular ADs.
- **Japan (ap-northeast-1)** — acceptable (~80-100ms). Sometimes capacity issues.
- **US West (us-sanjose-1)** — fallback (~180ms). Usually available.

**Capacity warning:** Singapore ADs may show "Out of Host Capacity" for A1.Flex. Try AD-2/AD-3, or fall back to US regions.

**⚠️ KULAI CAPACITY (confirmed 2026-06-27):** Despite being a new region (launched Feb 2026), `ap-kulai-2` A1.Flex is already returning `"Out of host capacity"` (HTTP 500 InternalError) on instance launch. The single AD (`rOJM:AP-KULAI-2-AD-1`) appears to be fully allocated. **Always Free tenancies CANNOT subscribe to additional regions** (returns `TenantCapacityExceeded` when attempting `oci iam region-subscription create`). This means if Kulai is out of capacity, you cannot fall back to Singapore/Japan via Always Free.

**Workaround options if Kulai is out of capacity:**
1. **Retry later** — capacity fluctuates as users terminate instances
2. **Use VM.Standard.E2.1.Micro** (AMD x86_64) — different capacity pool, 2 free instances (1 OCPU / 1 GB each)
3. **Upgrade to Pay-As-You-Go** — removes 1-region restriction, enables multi-region
4. **Wait for Azure throttle reset** — original plan, B1 ~$12.40/mo within student credits

### IAM Authorization — Non-Admin Users Cannot Launch Instances

**Error:** `NotAuthorizedOrNotFound` (HTTP 404) when running `oci compute instance launch` — even when images, subnets, and shapes are confirmed available.

**Root Cause:** The user is NOT in the `Administrators` group. Always Free tenancies only grant the `Tenant Admin Policy` to the `Administrators` group. Non-admin users need explicit IAM policies to manage compute resources.

**Diagnosis:**
```bash
# Check which groups the user belongs to
oci iam group list --compartment-id <tenancy-ocid> --region ap-kulata-2
# If user is only in "All Domain Users" (not "Administrators"), this is the problem
```

**Fix (requires Console access — non-admin users cannot create policies via CLI):**
1. Login to https://console.oracle.cloud.com → Identity & Security → Groups
2. Open `Administrators` group → Add user
3. OR create a new policy: Identity → Policies → Create Policy
   ```
   Allow user <user-ocid> to manage compute-instances in tenancy
   Allow user <user-ocid> to manage virtual-network-family in tenancy
   Allow user <user-ocid> to manage volume-family in tenancy
   Allow user <user-ocid> to manage compute-image-family in tenancy
   ```
4. **Verify after fix:** `oci os ns get` works (proves auth), then retry launch

**Why CLI can't fix this:** Non-admin users cannot call `oci iam policy create` or `oci iam group user-add` — both require Administrator privileges. This is a hard blocker that can only be resolved through the Console UI.

### Malaysia West 2 (Kulai) — Verified 2026-06-27

| Field | Value |
|-------|-------|
| **Region ID** | `ap-kulai-2` |
| **Location** | Malaysia West 2, Kulai (Johor) |
| **Launch Date** | February 2, 2026 |
| **Availability Domains** | 1 (`rOJM:AP-KULAI-2-AD-1`) |
| **A1.Flex Images** | Ubuntu 22.04/24.04 aarch64 (multiple variants, April 2026) |
| **A1.Flex Capacity** | ✅ Available (new region) |
| **Latency to Meta** | <10ms from Malaysia |

**Ubuntu 24.04 aarch64 image OCID (Kulai):**
```
ocid1.image.oc1.ap-kulai-2.aaaaaaaafuqgsa6noo6jsqlw2ufdsymwy2cztgiu7i32h74vcu2c2n3xql5q
```

## Fly.io Comparison — REMOVED (Outdated)

Previous reports compared against Fly.io "3 shared-CPU-1x VMs free". **This is NO LONGER accurate:**

- **New signups (since Oct 2024):** Only 2 VM hours free trial, then pay-as-you-go
- **Cheapest useful VM:** shared-cpu-1x, 256 MB RAM = **~$2.02/month** (not free)
- **Legacy accounts:** May retain old free allowance (grandfathered)
- **Conclusion:** Fly.io is NOT a free option for new deployments. OCI A1.Flex remains superior for $0 cost.

## Recommended Deployment Target

### Instance Spec

> **⚠️ IMPORTANT:** You MUST create the instance in your **home region** (the one chosen during signup). For this tenancy, that's `ap-kulai-2` (Malaysia West 2, Kulai). Do NOT try to use Singapore or other regions — Always Free tenancies are locked to one region.

| Setting | Recommended Value | Cost |
|---------|-------------------|------|
| **Shape** | VM.Standard.A1.Flex | **$0/mo** |
| **OCPU** | 1 (of 2 max) | |
| **RAM** | 6 GB (of 12 max) | |
| **Boot disk** | 50 GB (default) | |
| **OS** | Ubuntu 24.04 aarch64 | |
| **Region** | ap-kulai-2 (Malaysia West 2, Kulai) | |
| **Network** | 1 VCN + 1 public subnet + IGW | $0 |

### Software Stack

| Layer | Component | Notes |
|-------|-----------|-------|
| **OS** | Ubuntu 24.04 aarch64 | ARM-native, Python 3.11 built-in |
| **Runtime** | Python 3.11 venv | `python3.11 -m venv` |
| **App Server** | gunicorn + uvicorn[standard] | `--workers 1 --worker-class uvicorn.workers.UvicornWorker` |
| **Reverse Proxy** | Nginx | SSL termination, rate limiting, static files |
| **SSL** | Let's Encrypt (certbot) | Free, auto-renew |
| **DB** | SQLite with WAL mode | `PRAGMA journal_mode=WAL;` for concurrency |
| **Process Manager** | systemd service | Auto-restart on crash/boot |
| **Logging** | journald + logrotate | Built-in, no extra setup |

### Architecture

```
WhatsApp Cloud API
     │ HTTPS (signed with APP_SECRET)
     ▼
Public IP ──→ Nginx :443 (SSL)
                  │
                  ├─ /dashboard/ → static files (dist/)
                  └─ / → gunicorn :8000
                            │
                            ▼
                       webhook_listener.py
                            │
                            ├── hermes_ai.py → OpenRouter HTTP API
                            ├── db_logger.py → SQLite (WAL)
                            └── dashboard/dist/ → Nginx
```

### Persistence on OCI

Unlike Azure (ephemeral disk), OCI A1.Flex boot volume **survives restarts**:
- `bot_data.db` persists across reboots
- **Wiped only if instance terminated** (boot volume explicitly deleted)
- **5 volume backups** included for point-in-time recovery
- **Daily SQLite dump** recommended: `sqlite3 bot_data.db .dump > backup_$(date +%F).sql`

### Deployment Steps (Reference Only)

```bash
# 1. Create OCI account (credit card for verification, won't charge)
# 2. Generate API key pair
# 3. Create VCN + subnet + internet gateway
| **Pre-provisioned VCN** | `VCN-HAFJET` (10.0.0.0/16) exists with public + private subnets, IGW, NAT GW, and security lists |
| **Security lists** | Default SL has SSH from 0.0.0.0/0; must add TCP 80/443 for HTTPS |

### OCI CLI Launch Command — A1.Flex (Primary Choice)

```bash
oci compute instance launch \
  --availability-domain "rOJM:AP-KULAI-2-AD-1" \
  --compartment-id ocid1.tenancy.oc1..aaaaaaaaigehfv7zkt2uuv5p74tx6yordkpk5sfdz2wkoiknfi7affzkivza \
  --shape VM.Standard.A1.Flex \
  --shape-config '{"ocpus":1,"memoryInGBs":6}' \
  --source-details '{"sourceType":"image","imageId":"ocid1.image.oc1.ap-kulai-2.aaaaaaaafuqgsa6noo6jsqlw2ufdsymwy2cztgiu7i32h74vcu2c2n3xql5q","bootVolumeSizeInGBs":50}' \
  --display-name "hafjet-whatsapp-bot" \
  --subnet-id ocid1.subnet.oc1.ap-kulai-2.aaaaaaaazzf3xfazpd3ym5ad6uoyal37sdimp5kg2au5ovvpyrwqevz3lfsa \
  --hostname-label "hafjet-bot" \
  --assign-public-ip true \
  --ssh-authorized-keys-file /home/hafizi145/.ssh/id_rsa.pub \
  --region ap-kulai-2 \
  --wait-for-state RUNNING
```

**Parameters verified:**
- `--hostname-label` (not `--hostname-hostname` — that flag does not exist for `oci compute instance launch`)
- `--ssh-authorized-keys-file` only (do NOT mix with `metadata ssh_authorized_keys` — use one or the other)
- No `--user-data` — keep first boot minimal for clean SSH
- `--assign-public-ip true` allocates ephemeral public IP (switch to reserved later if needed)
- `--shape-config` does NOT support `baselineOcpuUtilization` for A1.Flex launches (that field is for dedicated hosts only)

### OCI CLI Launch Command — E2.1.Micro (AMD Alternative)

If A1.Flex is out of capacity, use the AMD micro instance (different capacity pool):

```bash
oci compute instance launch \
  --availability-domain "rOJM:AP-KULAI-2-AD-1" \
  --compartment-id <tenancy-ocid> \
  --shape VM.Standard.E2.1.Micro \
  --source-details '{"sourceType":"image","imageId":"ocid1.image.oc1.ap-kulai-2.aaaaaaaav7oamjly7445b63c6fpeqgbyb6dqkljpixpm7gcn2lkhzgb4jeza","bootVolumeSizeInGBs":50}' \
  --display-name "hafjet-whatsapp-bot" \
  --subnet-id <public-subnet-ocid> \
  --hostname-label "hafjet-bot" \
  --assign-public-ip true \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
  --region ap-kulai-2 \
  --wait-for-state RUNNING
```

**E2.1.Micro specs:** 1 OCPU (AMD) / 1 GB RAM / 50 GB boot. Always Free: 2 instances per tenancy.
**Note:** 1 GB RAM is tight but sufficient for FastAPI + gunicorn (1 worker) + SQLite. Avoid running dashboard build on this VM — build locally and deploy `dist/` via SCP.

```bash
oci compute instance launch \
  --availability-domain "rOJM:AP-KULAI-2-AD-1" \
  --compartment-id <tenancy-ocid> \
  --shape VM.Standard.A1.Flex \
  --shape-config '{"ocpus":1,"memoryInGBs":6}' \
  --source-details '{"sourceType":"image","imageId":"ocid1.image.oc1.ap-kulai-2.aaaaaaaafuqgsa6noo6jsqlw2ufdsymwy2cztgiu7i32h74vcu2c2n3xql5q","bootVolumeSizeInGBs":50}' \
  --display-name "hafjet-whatsapp-bot" \
  --subnet-id <public-subnet-ocid> \
  --hostname-label "hafjet-bot" \
  --assign-public-ip true \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
  --region ap-kulai-2 \
  --wait-for-state RUNNING
```

**Parameters verified:**
- `--hostname-label` (not `--hostname-hostname` — that flag does not exist for `oci compute instance launch`)
- `--ssh-authorized-keys-file` only (do NOT mix with `metadata ssh_authorized_keys` — use one or the other)
- No `--user-data` — keep first boot minimal for clean SSH
- `--assign-public-ip true` allocates ephemeral public IP (switch to reserved later if needed)
- `--shape-config` does NOT support `baselineOcpuUtilization` for A1.Flex launches (that field is for dedicated hosts only)

# 5. SSH + configure
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11-venv nginx certbot python3-certbot-nginx git

# 6. Clone app, create venv, install deps
git clone <repo-url> && cd <app-dir>
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 7. Create systemd service
sudo tee /etc/systemd/system/hafjet-bot.service << 'EOF'
[Unit]
Description=HAFJET WhatsApp Bot
After=network.target
[Service]
Type=exec
User=ubuntu
WorkingDirectory=/home/ubuntu/<app-dir>
EnvironmentFile=/home/ubuntu/<app-dir>/.env
ExecStart=/home/ubuntu/<app-dir>/venv/bin/gunicorn \
  -w 1 -k uvicorn.workers.UvicornWorker \
  webhook_listener:app --bind 127.0.0.1:8000 --timeout 120
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now hafjet-bot

# 8. Configure Nginx + SSL
sudo certbot --nginx -d <domain> --non-interactive --agree-tos -m <email>

# 9. Update WhatsApp Cloud API webhook URL
```

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **A1.Flex capacity out in Kulai (confirmed 2026-06-27)** | 🔴 High | Cannot subscribe additional regions on Always Free. Options: retry later, use E2.1.Micro (AMD), or wait for Azure throttle reset |
| **IAM authorization (non-admin users)** | 🔴 High | Non-admin users get `NotAuthorizedOrNotFound` (404) on instance launch. Fix requires Console UI — cannot be resolved via CLI. User must be added to `Administrators` group or granted compute management policies |
| **Single AD in Kulai** | 🟡 Medium | No AD failover within region; all eggs in one basket |
| **Instance reclaimed (30-day notice)** | 🟡 Medium | Keep snapshots; can recreate in minutes |
| **CPU throttling (>10% sustained 45min)** | 🟢 Low | WhatsApp bot idle 99% of time |
| **No uptime SLA** | 🟡 Medium | systemd auto-restart; acceptable for non-critical |
| **Always Free = 1 region only** | 🔴 High | Cannot fall back to Singapore/Japan if Kulai fails; must upgrade to PAYG |

### Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| A1.Flex VM (1 OCPU / 6 GB) | **$0.00** |
| Boot volume (50 GB) | **$0.00** |
| Public IP | **$0.00** |
| VCN / Subnet / IGW | **$0.00** |
| Outbound data (<10 TB) | **$0.00** |
| Volume backups (5 included) | **$0.00** |
| Let's Encrypt SSL | **$0.00** |
| **TOTAL** | **$0.00/month** |

### Comparison (Corrected 2026)

| Provider | Specs | Cost | Always On | Root Access | Free? |
|----------|-------|------|-----------|-------------|-------|
| **Oracle A1.Flex** | 1 OCPU / 6 GB | $0/mo | ⚠️ No SLA | ✅ Full | ✅ Always Free |
| **Azure F1** | 1 vCPU / 1.5 GB | $0/mo | ❌ 750 min/wk | ❌ | ✅ Always Free |
| **Azure B1** | 1 vCPU / 1 GB | ~$12/mo | ✅ 99.95% | ❌ | ❌ Paid |
| **Fly.io** | 1 shared / 256 MB | ~$2/mo | ✅ | ✅ | ❌ Pay-as-you-go (new accounts) |
| **Heroku Eco** | 512 MB | $5/mo | ❌ Sleeps | ❌ | ❌ Paid |
| **Hetzner CX11** | 1 vCPU / 2 GB | €3.99/mo | ✅ | ✅ | ❌ Paid |

**Verdict:** Oracle A1.Flex is the best free option for persistent WhatsApp bot hosting with root access and generous RAM — **IF your home region has capacity.** As of June 2027, Kulai (Malaysia) is already showing capacity exhaustion. Always Free tenancies are locked to one region with no fallback. This significantly reduces OCI's reliability as a production hosting target. Azure B1 ($12.40/mo) remains the recommended production option when throttle resets.
