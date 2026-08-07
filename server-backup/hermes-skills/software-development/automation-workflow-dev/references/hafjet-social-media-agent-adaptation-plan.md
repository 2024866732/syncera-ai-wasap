# HAFJET Social Media Agent Adaptation Plan

**Source:** Session 2026-08-04 — Analysis of `langchain-ai/social-media-agent` for HAFJET Content Automation
**Status:** Ready for implementation (awaiting Tuan Hafizi approval)

---

## Executive Summary

Adapt LangChain Social Media Agent (LangGraph, HITL, multi-source) to replace n8n-based content automation for HAFJET.

**Key Mapping:**
| HAFJET Spec | Social Media Agent Feature | Adaptation |
|-------------|---------------------------|------------|
| Threads, IG, FB, TikTok | X (Twitter) + LinkedIn | Meta Graph API + TikTok Business API clients |
| Telegram inline keyboard (5×10) | Agent Inbox HITL | New `telegram_approval` graph with webhook |
| 12:30/20:30 MYT scheduling | PST priority system (P1/P2/P3) | MYT cron: `30 4 * * *` / `30 12 * * *` UTC |
| Loyverse, WhatsApp bot, repair cases | Slack, GitHub, YouTube, Reddit | New `ingest_hafjet_data` graph + connectors |
| Dual captions (Direct + Story) | Single caption | New `generate_dual_captions` node |
| AI image generation | FireCrawl scrape only | DALL-E 3 / local SD (RTX 4070) |
| HAFJET brand voice (Kelantan) | LangChain AI tone | Custom prompts in `generate-hafjet-post/prompts` |

---

## 7-Phase Implementation Plan

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1: Foundation | Week 1-2 | Repo fork, env config, langgraph.json, Docker |
| 2: Ingestion | Week 2-3 | `ingest_hafjet_data` graph (4 sources → content ideas) |
| 3: Generation | Week 3-4 | `generate_hafjet_post` graph (dual captions + 4 AI images) |
| 4: Approval | Week 4-5 | `telegram_approval` graph (inline keyboard 5×10) |
| 5: Publishing | Week 5-6 | `upload_hafjet_post` graph (Meta + TikTok APIs) |
| 6: Scheduling | Week 6 | Cron jobs at 04:30/12:30 UTC (12:30/20:30 MYT) |
| 7: Deployment | Week 6-7 | Docker optimized for 1GB RAM + 4GB swap |

---

## Required API Credentials (Tuan Hafizi to Provide)

- **Meta Graph API**: App ID, Secret, Long-lived Access Token, IG Business ID, FB Page ID, Threads User ID
- **TikTok Business API**: Access Token
- **Loyverse API**: API Key
- **WhatsApp Bot API**: Local URL + Key
- **Image Generation**: OpenAI (DALL-E 3) OR local Stable Diffusion on RTX 4070

---

## Deployment Options

| Option | Pros | Cons |
|--------|------|------|
| **Local PC** (RTX 4070) | Free GPU for AI images, no cloud cost | 1GB RAM constraint, manual ops |
| **Azure Container Apps** | Scale-to-zero, managed, Cloudflare Tunnel | Monthly cost (~$10-20), cold starts |

---

## MVP Scope Recommendation

**Phases 1-4 only** (3-4 weeks):
- Content ingestion → generation → Telegram approval ✅
- Manual publish via phone initially (saves 80% time)
- Auto-publish (Phases 5-6) follows later

---

## Files in This Session

- `HAFJET-SOCIAL-MEDIA-AGENT-ADAPTATION-PLAN.md` — Full 26KB plan (this reference)
- `5-AI-PROJECTS-HERMES-HAFJET-ANALYSIS.md` — Comparative analysis of all 5 projects
- Cloned repo: `social-media-agent/` (analyzed: graphs, prompts, HITL, cron, clients)

---

## Next Steps

1. Tuan Hafizi approves Phase 1 start
2. Provide API credentials
3. Confirm deployment target (Local vs Azure)
4. Confirm scope (Full vs MVP)
5. Hermes begins Phase 1 implementation