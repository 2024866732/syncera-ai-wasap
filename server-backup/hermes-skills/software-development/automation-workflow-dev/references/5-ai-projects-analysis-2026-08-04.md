# 5 AI Projects Analysis for Hermes + HAFJET (2026-08-04)

**Source:** Session 2026-08-04 — Research & evaluation of 5 GitHub projects for Hermes/HAFJET adoption

---

## Quick Decision Matrix

| # | Project | Repo | Verdict | Priority |
|---|---------|------|---------|----------|
| 1 | RAG from Scratch | `langchain-ai/rag-from-scratch` | Learn/Reference | 2 |
| 2 | AI Social Media Agent | `langchain-ai/social-media-agent` | **BUILD NOW** | 1 |
| 3 | Medical Image Analysis | `databricks-industry-solutions/digital-pathology` | Skip | — |
| 4 | MCP Tool-Calling Agents | Databricks notebooks | Infra/Reference | 3 |
| 5 | MemoAI | `Makememo/MemoAI` | Optional | 4 |

---

## Project Details

### #1 RAG from Scratch — Learn/Reference (Priority 2)
**5 Jupyter notebooks, 18 parts:**
- Parts 1-4: Basic RAG (indexing, retrieval, generation, Chroma, OpenAI)
- Parts 5-9: Advanced retrieval (multi-query, reranking, HyDE, parent docs)
- Parts 10-11: Agents (ReAct, self-correction, LangGraph) ← **Key for Hermes**
- Parts 12-14: Evaluation (RAGAS, correctness, faithfulness) ← **Key for bot quality**
- Parts 15-18: Production (streaming, caching, monitoring, optimization)

**HAFJET Application:** Product Knowledge Base for WhatsApp Bot
- Ingest: PDF catalogs, price lists, FAQ, repair guides
- Vector DB: Chroma/Qdrant local on HAFJET PC
- Embeddings: `BAAI/bge-m3` (local, multilingual, Malay support)
- LLM: Hermes-managed (Grok via xAI OAuth, DeepSeek via OpenRouter)

---

### #2 AI Social Media Agent — BUILD NOW (Priority 1)
**Full adaptation plan in:** `references/hafjet-social-media-agent-adaptation-plan.md`

**Why:** Exact match for HAFJET Content Automation Spec
- LangGraph-native → runs on Hermes infra
- HITL built-in → maps to Telegram inline keyboard (5×10)
- Multi-source ingestion → adapt to Loyverse, WhatsApp bot, repair cases
- Scheduling/cron → adapt to 12:30/20:30 MYT
- Image handling + AI generation → DALL-E 3 / local SD
- Open-source, deploy local (1GB RAM) or Azure

---

### #3 Medical Image Analysis — Skip
**Repo:** `databricks-industry-solutions/digital-pathology`
**Domain:** Pathology whole-slide images, metastasis detection
**Relevance:** Zero for HAFJET (gadget repair, not medical)

---

### #4 MCP Tool-Calling Agents — Infra/Reference (Priority 3)
**Source:** Databricks docs + notebooks on external MCP servers

**Key Pattern:**
```python
from databricks.sdk import WorkspaceClient
from databricks_mcp import DatabricksMCPClient
mcp_client = DatabricksMCPClient(server_url=f"{host}/api/2.0/mcp/external/", ...)
tools = mcp_client.list_tools()
response = mcp_client.call_tool("tool_name", {"arg": "value"})
```

**HAFJET Application:** Build `hafjet-mcp-gateway` exposing:
- `loyverse-mcp` — Sales, inventory, customers
- `whatsapp-bot-mcp` — Conversations, analytics, FAQ
- `cctv-mcp` — Camera status, incidents, clips
- `repair-tracker-mcp` — Jobs, parts, warranty
- `hafjet-knowledge-mcp` — Product specs, pricing, procedures

**Integration:** Register with Hermes in `config.yaml` under `mcp.servers`

---

### #5 MemoAI — Optional (Priority 4)
**Desktop app:** Windows/macOS audio/video transcription
- Local Whisper.cpp (MP4, MP3, AAC, M4A)
- YouTube/podcast URL transcription
- Translation (Google, Microsoft, DeepL, Volcano, AI)
- Subtitles SRT/VTT + Markdown export
- Speech synthesis dubbing

**HAFJET Status:** Already covered by `hafjet-whisper-stt` + `hafjet-local-ml-deploy` skills
**Use Only:** Reference Whisper.cpp integration patterns if needed

---

## Recommended Execution Order

1. **IMMEDIATE (Week 1-7):** Project #2 — Build HAFJET Social Media Agent
2. **PARALLEL (Week 2-4):** Project #1 — Study RAG notebooks for Product RAG design
3. **INFRA (Week 4-8):** Project #4 — Build HAFJET MCP Gateway
4. **ON-DEMAND:** Project #5 — Reference only if STT needs improvement

---

## Cloned Repositories (Session Artifacts)

- `/home/hafizi145/social-media-agent/` — Fully analyzed (graphs, prompts, HITL, cron, clients)
- `/home/hafizi145/rag-from-scratch/` — 5 notebooks downloaded
- `/home/hafizi145/MemoAI/` — Repo cloned (README only, desktop app)

---

## Key Technical Decisions Documented

| Decision | Rationale |
|----------|-----------|
| Meta Graph API for Threads/IG/FB | Official API, supports all 3 platforms |
| TikTok Business API for TikTok | Only official programmatic posting |
| Dual captions (Direct + Story) | HAFJET spec requires 2 options per post |
| 4 AI images (2 per caption) | Visual variety for approval selection |
| Telegram webhook for approval | Replaces Agent Inbox, matches spec exactly |
| MYT cron: `30 4 * * *` / `30 12 * * *` UTC | 12:30/20:30 MYT = 04:30/12:30 UTC |
| Docker memory limit 768MB | Fits 1GB RAM + 4GB swap with headroom |
| Local SD on RTX 4070 for images | Free GPU, no API cost, privacy |