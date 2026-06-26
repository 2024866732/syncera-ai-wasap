# web_extract → Browser Fallback

**Problem:** `web_extract` tool sometimes fails with:
> "DuckDuckGo (ddgs) is a search-only backend and cannot extract URL content."

This is a hard limitation when the Hermes session is configured with `web_extract_backend=ddgs`.

**Solution:** Use the browser tool as the article extraction path.

## Extraction Sequence

1. Navigate: `browser_navigate(url)`
2. Extract text: `browser_console(expression="document.querySelector('article').innerText")`
3. If too long, truncate: `browser_console(expression="document.querySelector('article').innerText.substring(0, 8000)")`
4. If no `<article>` tag exists: `browser_console(expression="document.body.innerText.substring(0, 5000)")`
5. If content is lazy-loaded: `browser_scroll(direction='down')` then retry extraction

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
