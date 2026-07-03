# web_extract → Browser Fallback

**Problem:** `web_extract` tool sometimes fails with:
> "DuckDuckGo (ddgs) is a search-only backend and cannot extract URL content."

This is a hard limitation when the Hermes session is configured with `web_extract_backend=ddgs`.

**Solution:** Use the browser tool as the article extraction path.

## Extraction Sequence (Two Methods)

### Method A: browser_snapshot (preferred — works universally)

1. `browser_navigate(url)` — navigate to page
2. `browser_scroll(direction='down')` — trigger lazy content
3. `browser_snapshot(full=true)` — get full page content as text

This method works for ALL page types regardless of HTML structure. No CSS selectors needed.

### Method B: browser_console JS extraction (faster for known sites)

1. `browser_navigate(url)` — navigate to page
2. `browser_console(expression="document.querySelector('article').innerText")` — extract via JS selector
3. If too long, truncate: `browser_console(expression="document.querySelector('article').innerText.substring(0, 8000)")`
4. If no `<article>` tag: `browser_console(expression="document.body.innerText.substring(0, 5000)")`
5. If content lazy-loaded: `browser_scroll(direction='down')` then retry

## Important Notes

- Do NOT retry web_extract more than 2 times — it will keep failing identically
- Browser tool may also fail for paywalled sites (NYT, WSJ, etc.) — use search snippet as fallback
- Some pages have bot detection (DataDome) — the page iframe snapshot shows an error screen
- When blocked, copy the search result description as a proxy summary and move on

## Example from June 2026

```
# Failed: web_extract on NYT
# Result: "DuckDuckGo (ddgs) is a search-only backend..."

# Success: browser_navigate → browser_console
browser_navigate("https://example-tech-news.com/article")
browser_console("document.querySelector('article').innerText.substring(0, 5000)")
# → Full article text extracted successfully
```
