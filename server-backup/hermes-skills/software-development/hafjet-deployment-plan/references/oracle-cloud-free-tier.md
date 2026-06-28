# Oracle Cloud Always Free Tier — Reference

## Source
Oracle Cloud Infrastructure Documentation: Always Free Resources
URL: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
Retrieved: 2026-06-27

## Always Free Compute Limits

### Ampere A1 Compute (ARM64)
| Resource | Limit | Notes |
|----------|-------|-------|
| OCPU hours | 1,500/month | Across all A1 instances |
| Memory hours | 9,000 GB/month | Across all A1 instances |
| Equivalent | 2 OCPU + 12 GB RAM | If running 24/7 |
| Max per instance | 4 OCPU, 24 GB | Shape: VM.Standard.A1.Flex |

**⚠️ IMPORTANT (2026-06):** As of June 15, 2026, Oracle reduced Always Free A1 limits from 4 OCPU/24GB to **2 OCPU/12GB** for new tenancies. Existing tenancies may retain old limits. Verify in Console.

### Micro Instances (AMD64)
| Resource | Limit | Notes |
|----------|-------|-------|
| Instances | 2 | VM.Standard.E2.1.Micro |
| OCPU | 1 per instance | 0.25 OCPU effective |
| RAM | 1 GB per instance | |
| Storage | 100 GB boot (50 GB default) | |

## Always Free Storage
| Resource | Limit |
|----------|-------|
| Block Volume (boot + data) | 200 GB combined, across all instances |
| Object Storage | 20 GB (standard) |
| Archive Storage | Not free |

## Always Free Networking
| Resource | Limit |
|----------|-------|
| VCN | Unlimited |
| Subnets | Unlimited |
| Public IP | 1 per VM (IPv4, free) |
| Load Balancer | 1 NLB, 10 Mbps |
| Outbound Data | 10 TB/month |
| Inbound Data | Unlimited |

## Always Free Database
| Resource | Limit |
|----------|-------|
| Autonomous Database | 1 OCPU, 20 GB storage |
| MySQL HeatWave | 1 node, 50 GB + 50 GB backup |

## Regional Availability

### Asia Pacific (Always Free eligible)
| Region Code | Location | Notes |
|-------------|----------|-------|
| ap-singapore-1 | Singapore | Often capacity-constrained |
| ap-sydney-1 | Sydney, Australia | |
| ap-melbourne-1 | Melbourne, Australia | |
| ap-tokyo-1 | Tokyo, Japan | Often capacity-constrained |
| ap-osaka-1 | Osaka, Japan | |
| ap-seoul-1 | Seoul, Korea | |
| ap-chuncheon-1 | Chuncheon, Korea | A1 NOT available |
| ap-mumbai-1 | Mumbai, India | |
| ap-hyderabad-1 | Hyderabad, India | |
| ap-kulai-2 | Kulai, Malaysia | **NEW (Feb 2026)**, single AD |

### Americas
| Region Code | Location |
|-------------|----------|
| us-ashburn-1 | Ashburn, VA |
| us-phoenix-1 | Phoenix, AZ |
| us-sanjose-1 | San Jose, CA |
| us-chicago-1 | Chicago, IL (newer) |

### Europe
| Region Code | Location |
|-------------|----------|
| eu-frankfurt-1 | Frankfurt, Germany |
| eu-amsterdam-1 | Amsterdam, Netherlands |
| eu-london-1 | London, UK |
| eu-madrid-1 | Madrid, Spain |
| eu-marseille-1 | Marseille, France |
| eu-milan-1 | Milan, Italy |
| eu-paris-1 | Paris, France |
| eu-stockholm-1 | Stockholm, Sweden |
| eu-zurich-1 | Zurich, Switzerland |

### Middle East & Africa
| Region Code | Location |
|-------------|----------|
| me-jeddah-1 | Jeddah, Saudi Arabia |
| me-dubai-1 | Dubai, UAE |
| me-abudhabi-1 | Abu Dhabi, UAE |
| af-johannesburg-1 | Johannesburg, South Africa (capacity issues) |

## Capacity Risk by Region (2026-06)

| Risk Level | Regions | Notes |
|------------|---------|-------|
| **High** | Singapore, Japan, Johannesburg | Frequent "Out of host capacity" errors |
| **Medium** | Sydney, Mumbai, Frankfurt | Occasional capacity issues |
| **Low** | US regions, EU regions, **Kulai (Malaysia)** | Newer regions or high-capacity |

## OCI CLI Authentication

### Key Fingerprint Verification
```bash
# Generate key pair
openssl genrsa -out oci_api_key.pem 2048
openssl rsa -pubout -in oci_api_key.pem -out oci_api_key_public.pem

# Get fingerprint of local key
openssl rsa -in oci_api_key.pem -pubout -outform DER 2>/dev/null | openssl md5 -c
# Output: MD5(stdin)= xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx

# Compare with Console fingerprint at:
# Identity & Security → Users → <user> → API Keys
```

### Common Auth Errors
| Error | Cause | Fix |
|-------|-------|-----|
| `NotAuthenticated: Failed to verify the HTTP(S) Signature` | Key fingerprint mismatch | Upload correct public key to Console |
| `The plan 'xxx' doesn't exist` | Plan deleted or wrong region | Check `az appservice plan list` |
| `Out of host capacity` | No A1.Flex available in AD | Try different AD or region |

### OCI Config File Template
```ini
[DEFAULT]
user=ocid1.user.oc1..aaaaaaaa...
fingerprint=xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx
tenancy=ocid1.tenancy.oc1..aaaaaaaa...
key_file=/home/user/.oci/oci_api_key.pem
region=ap-kulai-2
```

## WhatsApp Bot Deployment on Oracle A1.Flex

### Software Stack
| Layer | Component | ARM64 Support |
|-------|-----------|---------------|
| OS | Ubuntu 22.04 aarch64 | ✅ |
| Runtime | Python 3.11 | ✅ |
| App Server | gunicorn + uvicorn[standard] + wsproto | ✅ |
| Reverse Proxy | Nginx | ✅ |
| SSL | Let's Encrypt (certbot) | ✅ |
| DB | SQLite (WAL mode) | ✅ |
| Process Manager | systemd | ✅ |

### Why Oracle Over Azure App Service
| Advantage | Detail |
|-----------|--------|
| Full root access | Install any package, any system service |
| No Oryx auto-detect issues | You control the startup command exactly |
| No subscription throttle | OCI has separate rate limits |
| Always Free never expires | Unlike Azure credit-based free tiers |
| Better latency (Kulai) | <10ms to Meta servers from Malaysia |
| No weekly quota | Azure F1 has 750 min/day limit |

### Why Azure Over Oracle
| Advantage | Detail |
|-----------|--------|
| Managed platform | No SSH, no OS patches, no systemd |
| Auto-scaling | Built-in load balancing |
| SLA guarantee | 99.95% on B1+ |
| Zero-config deploy | `az webapp up` handles everything |
| Integrated logging | Kudu logs, Application Insights |
| No capacity risk | Provisioned instantly |

## Session Notes (2026-06-27)

### What Happened
1. Azure subscription hit throttle (429/51025) after repeated plan create/delete
2. Original plan `hafjet-bot-plan` auto-deleted when last web app removed
3. All subsequent plan create attempts throttled for 15+ minutes
4. `Retry-After: 5` header was deceptive — actual throttle window was 15-30+ min
5. Discovered `STARTUP_COMMAND` app setting was stale (still `uvicorn webhook_listener:app --host 0.0.0.0 --port 8000` instead of `bash /home/site/wwwroot/start.sh`)
6. OCI CLI installed successfully; config existed but private key fingerprint didn't match Console

### Key Discovery
- **Kulai (ap-kulai-2)** is a brand-new Oracle region (Feb 2026) with single AD
- Always Free A1.Flex: 2 OCPU / 12 GB RAM (reduced from 4/24 in June 2026)
- WhatsApp bot needs only 1 OCPU / 1 GB — well within limits
- OCI API key in `~/.oci/oci_api_key.pem` has fingerprint `41:e3:0e:9b:...` but Console expects `9d:e8:80:86:...` — mismatch

### Pending Actions
- [ ] Resolve OCI key mismatch (generate new pair or find correct key)
- [ ] Wait for Azure throttle reset (15-30 min from last violation)
- [ ] Decide: retry Azure or deploy to Oracle
