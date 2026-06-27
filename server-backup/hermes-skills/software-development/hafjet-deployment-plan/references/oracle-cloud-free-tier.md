# Oracle Cloud Always Free Tier - Fallback Hosting Evaluation

## Status: EVALUATED (2026-06-27) — NOT YET TESTED

## Always Free Tier Limits (Confirmed via Oracle Docs, June 2026)

| Resource | Limit | Our Bot's Need | Headroom |
|----------|-------|----------------|----------|
| **A1.Flex OCPU** | 2 OCPU (shared across all A1 instances) | 1 OCPU | ✅ 50% spare |
| **A1.Flex RAM** | 12 GB (shared across all A1 instances) | 1-2 GB | ✅ 10 GB spare |
| **Block Storage** | 200 GB (boot + volumes, shared) | 50 GB (default boot) | ✅ 150 GB spare |
| **Object Storage** | 20 GB | < 1 GB | ✅ |
| **Outbound Data** | 10 TB / month | ~50 GB / month | ✅ |
| **Load Balancer** | 1 NLB, 10 Mbps | Not needed | ✅ |
| **MySQL HeatWave** | 1 OCPU, 20 GB | Not needed (SQLite) | ✅ |
| **VCN / Subnets** | Unlimited | 1 VCN + 1 subnet | ✅ |
| **Public IPs** | 1 per VM | 1 | ✅ |
| **Certificates** | 5 CAs, 150 certs | Not needed (Let's Encrypt) | ✅ |

## Critical Limitations

| Limitation | Detail | Impact |
|------------|--------|--------|
| **Hard RAM cap** | Cannot exceed 12 GB total across all A1 instances | Our 1-2 GB request is well within |
| **A1.Flex capacity** | Singapore/Japan/Korea frequently "Out of Capacity" | May need to try different AD or region |
| **Always Free = home region only** | Can't create in non-home-region with Always Free pricing | Must use tenancy's home region |
| **ARM64 image only** | A1.Flex requires ARM OS (Ubuntu 22.04/Oracle Linux 8) | All Python packages have ARM wheels |
| **No uptime SLA** | Instances can be reclaimed with 30-day notice | Acceptable for non-critical bot |
| **CPU throttling** | If >10% CPU sustained 45 min, instance may be decommissioned | WhatsApp bot unlikely to hit this |
| **IPv4 included** | First instance gets public IP | ✅ No NAT gateway needed |

## Regional Availability

Oracle Always Free is available in all commercial regions including:
- Singapore (ap-southeast-1) — best for Malaysia latency
- Japan (ap-northeast-1)
- Australia (ap-southeast-2)
- US East/West, EU (Frankfurt, London)

**Capacity per AD varies** — Johannesburg and Singapore have had capacity issues (Jan 2026 reports). Try AD-2 if AD-1 fails.

## Deployment Architecture

```
[WhatsApp Cloud API] → [Public IP:443] → [Ubuntu 22.04 ARM VM]
                                         ├── Nginx (SSL termination, port 443)
                                         ├── gunicorn (uvicorn workers, port 8000)
                                         ├── webhook_listener.py
                                         ├── SQLite DB (local, WAL mode)
                                         └── Let's Encrypt SSL
```

## Instance Spec

| Setting | Value | Cost |
|---------|-------|------|
| Shape | VM.Standard.A1.Flex | **$0/mo** |
| OCPU | 1 | |
| RAM | 1 GB | |
| Boot disk | 50 GB | |
| OS | Ubuntu 22.04 aarch64 | |
| Network | 1 VCN + 1 public subnet | $0 |
| Load balancer | None | |

## Software Stack

| Layer | Component |
|-------|-----------|
| OS | Ubuntu 22.04 aarch64 |
| Runtime | Python 3.11 (built-in) |
| App Server | gunicorn + uvicorn[standard] + wsproto |
| Reverse Proxy | Nginx (handles SSL, rate limiting) |
| SSL | Let's Encrypt (certbot) |
| DB | SQLite (WAL mode, daily backup) |
| Process Manager | systemd |

## Deployment Steps (to execute upon confirmation)

1. `oci iam availability-domain list --compartment-id <compartment>`
2. `oci vcn create --compartment-id <compartment> --cidr-block 10.0.0.0/16 --display-name hafjet-vcn`
3. `oci subnet create --compartment-id <compartment> --vcn-id <vcn-id> --cidr-block 10.0.1.0/24 --availability-domain <ad> --display-name hafjet-subnet`
4. `oci internet-gateway create --compartment-id <compartment> --vcn-id <vcn-id> --is-enabled true`
5. `oci route-table ...` (add route to internet gateway)
6. `oci network security-group ...` (allow ports 22, 443)
7. `oci compute instance launch --shape VM.Standard.A1.Flex --shape-config '{"ocpus":1,"memoryInGBs":1}' --source-details '{"sourceType":"image","imageId":"<arm64-ubuntu-image-id>"}' --subnet-id <subnet-id> --availability-domain <ad>`
8. SSH in, install nginx + python3-pip
9. Git clone / SCP app code
10. `pip install -r requirements.txt`
11. Setup systemd service for gunicorn
12. `certbot --nginx -d <domain>`
13. Update Meta Cloud API webhook URL
14. Test endpoints

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| **A1.Flex capacity out** | Try different AD; or provision US/EU with higher latency |
| **ARM64 dependency issues** | All packages (fastapi, gunicorn, uvicorn, wsproto) have ARM wheels |
| **No uptime SLA** | Acceptable; can migrate back to Azure when throttle clears |
| **CPU throttling** | Bot unlikely to hit 10% sustained |
| **SQLite corruption** | Use WAL mode + daily backup to block volume |
| **Root access** | Full control — better than App Service for debugging |

## Comparison with Other Platforms

| Factor | Oracle A1.Flex | Azure F1 | Azure B1 | Heroku Eco |
|--------|---------------|----------|----------|------------|
| **Monthly cost** | $0 | $0 | $12.40 | $5 |
| **Always On** | ~95% (no SLA) | Weekly quota | ✅ 99.95% | Sleeps after 30min |
| **WebSocket** | ✅ Full support | ❌ Quota block | ✅ | ✅ |
| **Root access** | ✅ Full | ❌ | ❌ | ❌ |
| **Custom domain** | ✅ Free | ❌ F1 | ✅ B1+ | ✅ |
| **SSL** | ✅ Let's Encrypt | Managed | Managed | Shared *.herokuapp.com |
| **Credit expiry** | Never expires | Annual renewal | Annual renewal | 24 months |
| **Region** | Home region only | Southeast Asia | Southeast Asia | US (Heroku) |

## References

- Oracle Always Free Resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle Free Tier FAQ: https://www.oracle.com/cloud/free/faq/
- Oracle ARM Always-Free in 2026: https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/
- OCI CLI installed: `oci-cli==3.88.0` (installed on HAFJET-Hermes-Server)
