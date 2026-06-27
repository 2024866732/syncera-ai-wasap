# Student Cloud Hosting Cost Comparison

Compare hosting platforms available through GitHub Student Developer Pack, Azure for Students, AWS Free Tier, and similar student programs. Use when the user asks about hosting cost optimization, platform selection, or credit management for a Python/FastAPI app like HAFJET.

## Available Student Credits (Typical Stack)

| Platform | Credit | Validity | Recurring? |
|----------|--------|----------|------------|
| **Azure for Students** | $100/month | 12 months (renewable annually) | ✅ Yes |
| **GitHub Student Pack — DigitalOcean** | $200 one-time | 12 months from redemption | ❌ No |
| **GitHub Student Pack — Heroku** | $13/month | 24 months | ✅ Yes (while active) |
| **AWS Free Tier** | $200 one-time | 6 months (new program post-July 2025) | ❌ No |
| **GitHub Student Pack — MongoDB Atlas** | $50 | 12 months | ❌ No |

## Platform Pricing for HAFJET-Style App

HAFJET = Python FastAPI + React dashboard + SQLite + WebSocket, ~1-2GB RAM needed

| Platform | Instance Type | Specs | Monthly Cost | Free Tier/Credit |
|----------|--------------|-------|-------------|-----------------|
| **Azure F1** | App Service Free | 1 vCPU, 1.75GB | $0 | Always free |
| **Azure B1** | App Service Basic | 1 vCPU, 1.75GB | ~$12.40 (~RM57) | Covered by credit |
| **Azure B2** | App Service Basic | 2 vCPU, 3.5GB | ~$24.80 (~RM114) | Covered by credit |
| **DigitalOcean** | Basic Droplet | 1 vCPU, 1GB | $6 (~RM27) | $200 credit covers 33 months |
| **DigitalOcean** | Basic Droplet | 1 vCPU, 2GB | $12 (~RM55) | $200 credit covers 16 months |
| **Heroku Eco** | Eco Dyno | Shared, sleeps after 30min | $5 (~RM23) | $13/month credit covers this |
| **Heroku Basic** | Basic Dyno | Always-on | $7 (~RM32) | $13/month credit covers this |
| **AWS t3.micro** | EC2 Singapore | 2 vCPU, 1GB | ~$10.50 | 750h free 12mo + $200 credit |
| **AWS t3.small** | EC2 Singapore | 2 vCPU, 2GB | ~$21 | Covered by $200 credit for ~9 months |

## Monthly Cost Projection (24 Months)

### Option A: Stay on Azure for Students

| Period | Monthly Cost | Total |
|--------|-------------|-------|
| Month 1–24 | $0 (on F1, sponsored) | **$0** |
| Upgrade to B1 | $12.40/month | Covered by $100/month credit |

### Option B: Move to DigitalOcean

| Period | Monthly Cost | Notes |
|--------|-------------|-------|
| Month 1–12 | $0 | $200 credit absorbs $72 in costs |
| Month 13–24 | $6/month ($72 total) | Credit exhausted, pay cash |
| **Total 24mo** | **$72** | |

### Option C: Move to Heroku

| Period | Monthly Cost | Notes |
|--------|-------------|-------|
| Month 1–24 | $0 | $13/month credit covers Eco/Basic |
| **Total 24mo** | **$0** | |

### Option D: AWS Free Tier

| Period | Monthly Cost | Notes |
|--------|-------------|-------|
| Month 1–6 | $0 | $200 credit covers EC2 |
| Month 7–12 | $0 | EC2 free tier (750h) still active |
| Month 13+ | $10–21/month | All credits exhausted |
| **Total 24mo** | **$120** | Pay cash from month 13 |

## Decision Matrix

| Factor | Azure | DigitalOcean | Heroku | AWS |
|--------|-------|--------------|--------|-----|
| Credit renewal | Recurring | One-time | Recurring | One-time |
| Migration effort | None (current) | High | Medium | High |
| Stability | ✅ Proven | ✅ Proven | ⚠️ Eco sleeps | ✅ Proven |
| Credit exhaustion | Never (recurring) | After 12 months | Never (24mo) | After 12 months |
| WebSocket | ✅ | ✅ | ✅ | ✅ |
| Custom domain | On paid tiers | Yes | Yes (subdomain) | Yes |
| Best for | Production | Staging/experiments | Simple bots | Multi-service |

## Recommendation Template

```
Primary: Azure for Students (stay)
- $100/month recurring, never expires while student
- Upgrade to B1 ($12.40) only if quota limits hit
- Free F1 sufficient for ~100 msgs/day

Backup: Heroku Eco ($5/month)
- Covered by $13/month GitHub credit for 24 months
- Use if Azure issues occur

Staging/Tests: AWS or DigitalOcean
- Use AWS $200 for 6 months or DO $200 for 12 months
- Deploy clone for testing before Azure deploys
```

## Monitoring: Low-Credit Warning

### Check Azure Credit (CLI)
```bash
az consumption usage list 2>&1 | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
total = sum(float(item.get('pretaxCost', 0) or 0) for item in data)
print(f'Monthly cost: \${total:.2f}')
if total > 50:
    print('⚠️ Alert: Over 50% of monthly credit used')
"
```

### Check Credit Expiry (Azure)
```bash
az account subscription show --subscription-id <id> 2>&1 | grep quotaId
# AzureForStudents_2018-01-01 = $100/month
```

## Key Lesson

**Always prefer recurring credits over one-time credits for production workloads.** One-time credits are best used for:
- Staging/experimental environments
- Testing migrations before committing
- Temporary failover during outages

Recurring credits (Azure $100/month, Heroku $13/month) should be your production backbone — they provide predictable cost and can be renewed annually while you maintain student status.
