# News Sources Ranked by Extractability

Updated: 2026-07-03 | Source: Live testing during weekly digests

## Tier 1: Works Great (Browser Fallback or Curl+File Pattern)

| Source | URL Pattern | Notes |
|---|---|---|
| IMFounder | `imfounder.com/science-tech/...` | Full article, clean HTML — curl+file works well |
| devFlokers | `devflokers.com/blog/...` | Full article, data-rich with model comparison tables |
| AI Tool Radar | `aitoolradar.io/blog/...` | Full article, structured analysis |
| EcoA AI | `ecoaai.com/...` | Full article, well-structured HTML |
| EdenAI | `edenai.co/post/...` | Full article — good for AI model comparisons & benchmark tables |
| TestingCatalog | `testingcatalog.com/...` | Clean article extraction, up-to-date AI news |
| CyberNews | `cybernews.com/ai-news/...` | Full article, good for security-related AI news |
| The National (UAE) | `thenationalnews.com/future/...` | Full article but heavy page (many nav elements); browser_snapshot(full=true) needed |
| CyberNews | `cybernews.com/ai-news/...` | Full article, good for security-related AI news |

## Tier 2: Works but May Need Scrolling

| Source | URL Pattern | Notes |
|---|---|---|
| Euronews | `euronews.com/next/...` | Content loads, sometimes truncated |
| Help Net Security | `helpnetsecurity.com/...` | Full article, niche security focus |
| Tommy Z Blog | `tommyz.blog/blog/...` | Weekly GitHub roundups, good structure |

## Tier 3: Blocked / Paywalled (use search snippet only)

| Source | URL Pattern | Notes |
|---|---|---|
| NYT | `nytimes.com/...` | DataDome bot detection block |
| WSJ | `wsj.com/...` | Paywall |
| openai.com | `openai.com/index/...` | Cloudflare bot detection — shows "Just a moment..." page |
| Some Substacks | Various | Bot detection on heavy traffic articles |

## Tier 4: Curl+File Pattern Works (Lightweight Alternative to Browser)

| Source | URL Pattern | Notes |
|---|---|---|
| TechCrunch | `techcrunch.com/...` | Save to file with curl, then strip HTML tags |
| Reuters | `reuters.com/technology/...` | Same pattern — curl + python file extraction |
| Any news site | Any URL | `curl -sL -o /tmp/page.html <url>` then process with script file |

**The curl+file pattern is the recommended lightweight alternative when browser tool is too slow or unavailable.** See `references/terminal-inline-python-workaround.md` for the exact code pattern.