# Deep Search Fallback — No-Extraction Detail Gathering

**When to use:** `web_extract` fails (ddgs backend), `execute_code` is blocked (cron mode), and you want a lighter alternative to terminal curl-extraction or browser tools for gathering article-level detail.

## Pattern: Targeted Nested Searches

Instead of extracting a single article, run **multiple targeted web_search queries** — each one homing in on a specific story. Google (or the search backend) provides rich 150-250 character snippets that, combined, give you enough signal to write a credible summary.

### Multi-Stage Workflow

**Stage 1 — Broad Sweep** (3 parallel queries):
```
web_search("top technology news this week 2026", limit=10)
web_search("open source AI news this week 2026", limit=10)
web_search("trending GitHub repositories AI machine learning July 2026", limit=5)
```

**Stage 2 — Deep Search** (4-6 targeted queries in parallel):
From the Stage 1 results, identify 4-6 distinct stories. For each, run a targeted query using key terms from the snippet:
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

### Example — Kimi K3 story from this session

From 5 targeted queries, snippets across Reuters, CNBC, NYT, VentureBeat, and ECNS converged on:
> Moonshot AI from China released Kimi K3, 2.8 trillion parameter open-weight model (world's largest), rivals top US models, still trails Claude Fable 5 and GPT-5.6 Sol on some benchmarks, reignites open vs closed debate in US.

No single article extraction needed — the search snippets themselves formed a reliable composite.

### When NOT to Use Deep Search

- **You need exact quotes or specific technical details** (exact benchmark numbers, code snippets, API endpoints). Deep search snippets are summaries, not verbatim text.
- **The story has conflicting or unclear claims** across sources. Extract at least one full article to resolve.
- **You have working extraction tools available** (browser or terminal-based). Deep search is plan B.

### Resource Comparison

| Method | Tool calls | Detail level | Reliability |
|---|---|---|---|
| browser_navigate + snapshot | ~2 per URL | Full article text | Best |
| terminal curl + python extraction | ~2 per 3 URLs | Full article text | Good |
| **Deep search** (this pattern) | ~1 per story | Snippet-level | Sufficient for digest |
