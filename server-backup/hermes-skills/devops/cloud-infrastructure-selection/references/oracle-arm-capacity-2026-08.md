# Oracle ARM Capacity — AP-KULAI-2 (Aug 2026)

## Region Profile
- **Region:** ap-kulai-2 (Johor, Malaysia)
- **Availability Domains:** 1 (rOJM:AP-KULAI-2-AD-1)
- **VCN:** VCN-HAFJET (created)
- **Public Subnet:** ocid1.subnet.oc1.ap-kulai-2.aaaaaaaazzf3xfazpd3ym5ad6uoyal37sdimp5kg2au5ovvpyrwqevz3lfsa

## Shapes Available
- **VM.Standard.A1.Flex** (ARM) — ONLY shape available
- No x86 shapes (E2, E4, E3) in this region

## Capacity Findings

### Timeline (Aug 4, 2026)
| Time (UTC) | Attempt | Result |
|------|---------|--------|
| 12:17 | 4 OCPU, 24GB | LimitExceeded |
| 14:18 | 4 OCPU, 24GB | LimitExceeded |
| 14:36 | 4 OCPU, 24GB | LimitExceeded |
| 15:01 | 4 OCPU, 24GB | LimitExceeded (after Pay As You Go upgrade) |
| 15:04 | 1 OCPU, 1GB | Out of host capacity |
| ~16:00 | 4 OCPU, 24GB | **SUCCESS** ✅ |

### Key Lesson
- Free Trial → "LimitExceeded" (account limits)
- Pay As You Go upgrade → removes account limits
- But "Out of host capacity" = physical hosts genuinely full
- **Solution**: Wait ~1 hour after upgrade, capacity freed up
- ARM capacity fluctuates throughout the day

## SUCCESSFUL DEPLOYMENT
- **Instance**: `hafjet-oracle` (VM.Standard.A1.Flex)
- **Specs**: 4 OCPUs, 24GB RAM, 45GB storage
- **Public IP**: `149.118.152.50`
- **Tailscale IP**: `100.124.99.52`
- **OS**: Ubuntu 24.04 LTS aarch64
- **Containers**: 19 (6 PG + 6 API + 6 UI + Command Center)
- **SSH**: `ssh -o ConnectTimeout=20 -i /tmp/hafjet-oracle-key ubuntu@149.118.152.50`

## SSH Key
- Generated: `/tmp/hafjet-oracle-key` (ed25519)
- Public key saved to Oracle via `--ssh-authorized-keys-file`

## Ubuntu Image
- Canonical-Ubuntu-24.04-aarch64-2026.07.17-0
- OCID: ocid1.image.oc1.ap-kulai-2.aaaaaaaacgwlsa5omqjaprcno46znm2wwydankme2xavar5s4t4d7xftrlka

## Deployment Files Ready
All files in `/tmp/aws-deploy/`:
- schemas/ (6 SQL files)
- apis/ (6 FastAPI files)
- uis/ (7 HTML dashboards)
- docker/ (6 compose files + commandcenter)
- cc_server.py (proxy server)

## Docker Permission Fix
Fresh Ubuntu: `usermod -aG docker` requires re-login.
**Quick fix**: use `sudo docker compose` instead of `docker compose`.
