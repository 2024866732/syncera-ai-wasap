---
name: cloud-infrastructure-selection
description: >
  Select cost-effective cloud VPS providers for AI agent hosting, Telegram bots,
  and coding servers — with focus on Malaysia/SE Asia latency and budget.
  Covers 2026 market best-value picks, DC region trade-offs, and upgrade paths
  from Oracle Free Tier.
tags:
  - vps
  - cloud
  - hosting
  - malaysia
  - se-asia
  - infrastructure
---

# Cloud Infrastructure / VPS Selection

Class-level guidance for picking a VPS/cloud provider in 2026, tuned for
Malaysia-based users running AI agents (Hermes, OpenClaw, etc.), Telegram bots,
and webhook servers.

## Trigger

- "What VPS should I use besides Oracle free tier?"
- "Best bang-for-buck cloud server for Malaysia"
- "Need more RAM / CPU / reliability than Oracle free"
- "Hosting a coding agent 24/7 in SE Asia"
- "Cheapest VPS with Singapore data center"
- "Oracle free tier got terminated / worried about termination"
- User asks about Hetzner, Hostinger, Contabo, DigitalOcean, Vultr, Linode

## Top Picks for Malaysia Users

| Rank | Provider | Plan | CPU | RAM | Storage | DC Singapore? | **Price** | **RM/mo** |
|---|---|---|---|---|---|---|---|---|
| **🏆 1** | **Hetzner** | **CX22** | **2 vCPU Intel** | **4 GB** | **40 GB NVMe** | **✅ Yes** | **€3.99** | **~RM19** |
| 🥈 2 | Hostinger | KVM 2 | 2 vCPU AMD | 4 GB | 50 GB NVMe | ✅ Yes | ~$6.49 promo | ~RM28 |
| 🥉 3 | Contabo | VPS S | 4 vCPU Intel | 8 GB | 200 GB NVMe | ❌ Germany | €5.99 | ~RM28 |
| 4 | Vultr | Shared 2GB | 1 vCPU | 2 GB | 55 GB NVMe | ✅ Yes | $6.00 | ~RM26 |
| 5 | DigitalOcean | Basic 2GB | 1 vCPU | 2 GB | 50 GB SSD | ✅ Yes | $12.00 | ~RM53 |
| 🎁 | **UpCloud** | **Trial** | **2 vCPU AMD EPYC** | **4 GB** | **80 GB MaxIOPS** | **✅ Singapore** | **FREE 14d** | **~RM0** |

## Detailed Comparison

### Hetzner Cloud (🏆 Best Overall Value)

| Spec | CX22 (Entry) | CX32 (Upgrade) | CAX11 (ARM) |
|---|---|---|---|
| CPU | 2 vCPU Intel | 4 vCPU Intel | 2 vCPU ARM |
| RAM | 4 GB | 8 GB | 4 GB |
| Storage | 40 GB NVMe | 80 GB NVMe | 40 GB NVMe |
| Traffic | 20 TB/mo | 20 TB/mo | 20 TB/mo |
| Price | **€3.99 ≈ RM19** | **~€8 ≈ RM38** | **€3.99 ≈ RM19** |
| DC | ✅ Singapore | ✅ Singapore | ❌ EU only |

**Strengths:** Best price-to-performance ratio in the market. Singapore DC gives ~5-10ms latency to Malaysia. Reliable support. Hourly billing. Free DDoS protection.

**Weaknesses:** CX series uses shared vCPU (fine for variable loads). Singapore DC has limited instance availability compared to Germany.

**Upgrade from CX22:** If you need more power, scale to CX32 (€8/mo) or CX42 (€20/mo).

### Hostinger KVM

| Spec | KVM 2 | KVM 4 | KVM 8 |
|---|---|---|---|
| CPU | 2 vCPU AMD EPYC | 4 vCPU | 8 vCPU |
| RAM | 4 GB | 8 GB | 16 GB |
| Storage | 50 GB NVMe | 100 GB NVMe | 200 GB NVMe |
| Price (promo) | ~$6.49/mo | ~$8.99/mo | ~$18.99/mo |
| Price (renewal) | ~$15–20/mo | ~$20–30/mo | ~$35–50/mo |
| DC | ✅ Singapore | ✅ Singapore | ✅ Singapore |

**Strengths:** AMD EPYC processors. Singapore DC. hPanel control panel. Lowest promo pricing for first term.

**⚠️ Pitfall:** Promo pricing is for 24–48 month commitment. Renewal price is **2-3x higher**. Always check renewal rates before committing long-term.

### Contabo VPS

| Spec | VPS S | VPS M | VPS L |
|---|---|---|---|
| CPU | 4 vCPU Intel | 6 vCPU | 8 vCPU |
| RAM | **8 GB** | **16 GB** | **30 GB** |
| Storage | **200 GB NVMe** | **400 GB** | **800 GB** |
| Price | **€5.99 ≈ RM28** | **€9.99 ≈ RM47** | **€14.99 ≈ RM71** |
| DC Singapore? | ❌ | ❌ | ❌ |

**Strengths:** Most RAM and storage per dollar in the market. Consistent pricing (no promo bait). 99.996% uptime.

**Weaknesses:** NO Singapore DC — closest is Germany or Japan (~150-200ms latency to Malaysia). CPU performance can be inconsistent (shared resources).

### DigitalOcean / Vultr / Linode

All three have Singapore DCs but are **significantly more expensive** than Hetzner for equivalent specs. Use only if you need their ecosystem (managed DB, Kubernetes, etc.).

## Oracle Free Tier — Current Baseline

| Spec | Value |
|---|---|
| CPU | 1 OCPU ARM Ampere A1 |
| RAM | 6 GB |
| Storage | 200 GB |
| Region | ap-kulai-2 (Malaysia — Johor) |
| Cost | **RM0** |
| Reliability | ⚠️ **Unpredictable** — accounts terminated, support non-existent |

The Oracle Free Tier is **technically unbeatable at RM0**, but carries real risk:
- Accounts get terminated without warning
- No support for free tier users
- Instances can be reclaimed at any time
- IP reputation issues (shared NAT)

## Recommendation Logic

| If Oracle Free is... | Then... |
|---|---|
| Working fine | Stay on it, but **keep backups**. Invest in Hetzner CX22 as backup |
| Terminated / about to be | **Hetzner CX22 at €3.99/mo** — closest specs, more reliable |
| Underpowered (need more CPU/RAM) | **Hetzner CX32 (€8/mo)** or **Contabo VPS M (€9.99/mo)** |
| Need local latency (Malaysia) | **Hetzner CX22** (Singapore DC) — don't use Contabo |
| Need massive storage/RAM on budget | **Contabo VPS S** — 8GB RAM, 200GB SSD, €5.99/mo |

## Pitfalls

- **Oracle Free termination:** Always have a migration plan. Accounts can be killed without notice. Backup to GitHub/external storage.
- **Hostinger promo trap:** Promo price is 24-48 month commitment. Renewal is 2-3x. Read the checkout terms.
- **Contabo latency:** No Singapore DC. If your users are in Malaysia, latency will be 150-200ms.
- **Vultr Shared CPU:** The $2.50/mo plan is shared CPU — performance degrades under load. Get Regular plan for reliable performance.
- **Hetzner Singapore stock:** Not all instance types are available in Singapore DC. Check before provisioning. CX22/CX32 are usually fine.
- **DigitalOcean price creep:** Cheapest plan is $6/mo for 1GB RAM — 2x Hetzner for half the resources.

## Cloud Trials (Experience-Driven)

Some providers offer free trials with credit. **Key insight:** trial quotas hard-limit concurrent resources — you can't spend the full credit amount. Max deployable is typically $40-60 of resources over 14 days.

**UpCloud Trial:** $250 credit, 14 days, quota-limited (see `references/upcloud-trial-deployment.md` for full deploy guide + stress test automation).

**Use case:** Experience high-spec servers, benchmark managed services, chaos engineering — NOT production deployment.

## Verification

- Check DC availability: `curl -I https://<vps-ip>` — expect <50ms from Malaysia for Singapore DCs
- Benchmark CPU: `sysbench cpu run`
- Benchmark disk: `fio --randrw=1 --size=1G`
- Test reliability: run `uptime` after 7 days — should be 100%
