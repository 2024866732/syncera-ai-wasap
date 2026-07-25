# Deep Search Fallback — No-Extraction Detail Gathering

**When to use:** `web_extract` fails (ddgs backend), `execute_code` is blocked (cron mode), and you want a lighter alternative to terminal curl-extraction or browser tools for gathering article-level detail.

**Validation count:** 3 sessions (July 11 deep-AI thread, July 18 broad sweep, July 25 full tech+AI digest). All produced complete, delivered reports without extraction tooling.

## Pattern: Targeted Nested Searches

Instead of extracting a single article, run **multiple targeted web_search queries** — each one homing in on a specific story. Google (or the search backend) provides rich 150-250 character snippets that, combined, give you enough signal to write a credible summary.

### Multi-Stage Workflow

**Stage 1 — Broad Sweep** (3 parallel queries):
```
web_search("top technology news this week 2026", limit=10)
web_search("open source AI news this week 2026", limit=10)
web_search("trending GitHub repositories AI machine learning July 2026", limit=5)
```

**Stage 2 — Deep Search** (4-8 targeted queries in parallel):
From the Stage 1 results, identify 4-8 distinct stories. For each, run a targeted query using key terms from the snippet:
```
web_search("OpenAI Apple employees lawsuit IPO 2026", limit=5)
web_search("Moonshot AI Kimi K3 open source 2.8 trillion 2026", limit=5)
web_search("Colibri GLM-5.2 inference engine 25GB RAM GitHub", limit=5)
web_search("Meta Compute cloud AI capacity selling 2026", limit=5)
```

### What You Get

Each targeted query returns 4-5 result snippets (150-250 chars each) with the latest timestamp across results. By comparing snippets from multiple sources covering the SAME story, you can triangulate:

- **Consensus facts** (appear in 3+ snippets) → high confidence
- **Single-source claims** → note as "according to X"
- **Numbers, dates, names** → cross-verified across sources

### Example 1 — Kimi K3 story (July 11 session, deep-AI variant)

From 5 targeted queries, snippets across Reuters, CNBC, NYT, VentureBeat, and ECNS converged on:
> Moonshot AI from China released Kimi K3, 2.8 trillion parameter open-weight model (world's largest), rivals top US models, still trails Claude Fable 5 and GPT-5.6 Sol on some benchmarks, reignites open vs closed debate in US.

No single article extraction needed — the search snippets themselves formed a reliable composite.

### Example 2 — Full tech+AI digest (July 25 session, cron job)

Stage 1 broad sweep returned 25+ snippets. Stage 2 ran 8 targeted queries in two parallel batches:
```
Batch A: ["AI 100% International Mathematical Olympiad Huawei Xiaohongshu July 2026",
          "xAI open source Grok Build coding agent 2026",
          "trending GitHub repositories July 2026 AI agents top list names"]
Batch B: ["VibeThinker-3B Weibo open source reasoning model 3 billion parameters",
          "Mistral CEO Mensch open source refuge state control July 2026",
          "top 10 trending AI github repositories July 2026 names list agents MCP coding"]
Batch C: ["bytepointer.com top 10 trending AI github repositories July 2026 list names",
          "FakeGit SmartLoader malware campaign 7600 github repos agentbaiting July 2026",
          "OpenAI burned 3.7 billion first quarter 2026 revenue Q1"]
```

Total: 11 `web_search` calls (3 broad + 8 deep) produced a complete 4-section report covering Huawei IMO 100%, OpenAI Q1 burn, Samsung Unpacked, Grok Build open-source, Mistral CEO stance, VibeThinker-3B, GitHub trending themes, and FakeGit agentbaiting. No `web_extract`, no browser, no curl. Report delivered fully on snippets alone.

**Sufficient depth for:** headline + one-line significance + source links. **Not sufficient for:** exact benchmark numbers or verbatim quotes — flag those as "according to &lt;source&gt;" or use browser fallback.

### Example 3 — July 25: GitHub listicle snippets do NOT reveal repo names

The Stage 2 queries `"top 10 trending AI github repositories July 2026 names list agents MCP coding"` and `"bytepointer.com top 10 trending AI github repositories July 2026 list names"` **both failed to surface specific repo names** — they returned the same listicle article snippets describing themes ("coding agents, MCP servers, trading agents") without naming the actual entries. Even `site:bytepointer.com` scoped queries just re-confirmed the article existed without revealing its list.

**Successful workaround — reconstruct from named-repo stories:**
Pulled named repos from the **story queries themselves** in Stage 2:
- `xai-org/grok-build` (4,400+ stars) — from the Grok Build open-source story
- `WeiboAI/VibeThinker` — from the VibeThinker-3B story
- `Kilo-Org/kilocode` — from the "open source coding agent" query
- `github/github-mcp-server` — from the MCP ecosystem query

Then described the GitHub section thematically (coding agents, MCP servers, trading/pentesting agents, AI gateways) citing the listicle URLs as aggregate sources. **Did NOT fabricate repo names or star counts.**

This is the recommended path when listicle extraction is blocked — see SKILL.md pitfall "GitHub Trending Listicles Hide Repo Names in Search Snippets".

### When NOT to Use Deep Search

- **You need exact quotes or specific technical details** (exact benchmark numbers, code snippets, API endpoints). Deep search snippets are summaries, not verbatim text.
- **The story has conflicting or unclear claims** across sources. Extract at least one full article to resolve.
- **You have working extraction tools available** (browser or terminal-based). Deep search is plan B.
- **You need the named entries inside a "Top N" listicle article.** Aggregator listicles (Analytics Vidhya, BytePointer, q2bstudio) do NOT surface their list entries in search snippets — only their SEO intro text. Either extract the full article (browser/curl) or skip the list and reconstruct from named-repo stories (see Example 3).

### Resource Comparison

| Method | Tool calls | Detail level | Reliability |
|---|---|---|---|
| browser_navigate + snapshot | ~2 per URL | Full article text | Best |
| terminal curl + python extraction | ~2 per 3 URLs | Full article text | Good |
| **Deep search** (this pattern) | ~1 per story | Snippet-level | Sufficient for digest |