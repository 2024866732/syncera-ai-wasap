# LangChain Social Media Agent → HAFJET Content Automation

**Session learning 2026-08-04:** Official repo `langchain-ai/social-media-agent` is the strongest open-source match for HAFJET content automation (HITL, multi-source ingest, schedule, LangGraph).

## Repo facts

| Item | Value |
|------|--------|
| Repo | https://github.com/langchain-ai/social-media-agent |
| Stack | TypeScript + LangGraph (`@langchain/langgraph`), optional Python slack side |
| Local clone (Hermes server) | `/home/hafizi145/social-media-agent` |
| Full adaptation plan | `/home/hafizi145/HAFJET-SOCIAL-MEDIA-AGENT-ADAPTATION-PLAN.md` |
| Multi-project analysis | `/home/hafizi145/5-AI-PROJECTS-HERMES-HAFJET-ANALYSIS.md` |

## What maps to HAFJET spec

HAFJET content automation (`references/hafjet-content-automation-spec.md`):

- Platforms: Threads, IG, FB, TikTok · times 12:30 & 20:30 MYT · TG approval `1485374469`
- Dual caption options · AI image · human approval before publish

Upstream agent already has:

- `generate_post` graph: scrape → report → post → condense → images → **humanNode interrupt** → schedule
- Agent Inbox HITL (accept / edit / ignore / respond)
- Cron ingest (Slack channel of links)
- Prompts: `BUSINESS_CONTEXT`, `TWEET_EXAMPLES`, `POST_STRUCTURE_INSTRUCTIONS`, `POST_CONTENT_RULES`
- Native publish: **X + LinkedIn only** (Arcade or native OAuth)

## Gaps to build (not free)

1. Meta Graph API + TikTok publish (replace X/LinkedIn clients)
2. Telegram inline keyboard approval (replace/supplement Agent Inbox)
3. HAFJET brand prompts (BM + Kelantan, no hard-sell, wa.me CTA)
4. Dual captions + AI image gen (Grok Imagine / DALL·E / local SD)
5. Content sources: Loyverse, WhatsApp FAQ, repair cases (not only URL scrape)

## Related learning stack (same research batch)

| # | Project | Role for HAFJET |
|---|---------|-----------------|
| Social Media Agent | **Build** | Content automation |
| RAG from Scratch (`langchain-ai/rag-from-scratch`) | Learn | Product KB for WhatsApp bot |
| Databricks MCP notebooks | Reference | MCP tool-calling patterns (Hermes already uses MCP) |
| MemoAI | Optional | Desktop Whisper — server STT already via `hafjet-whisper-stt` |
| Medical pathology | Skip | Wrong domain |

## Safety

- Prefer official GitHub org clones; no need for VirusTotal on pure source repos of langchain-ai / databricks / Makememo.
- Do not auto-publish social posts without Tuan Hafizi approval path (spec: human approval > autopublish).

## When to load this

User asks about content automation agents, LangGraph social posting, adapting open-source social agents, or prioritizing "AI projects that get you hired" style repos for HAFJET.