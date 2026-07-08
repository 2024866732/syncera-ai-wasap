# Defensive JSON Parsing for External APIs

External APIs (especially Shopee SPX) may return malformed responses:
anti-hijacking prefix, trailing garbage, empty body, or HTML error pages.

Never trust `resp.json()` alone — always wrap with a fallback parser.

## `_safe_json()` Pattern

```python
def _safe_json(text: str) -> dict:
    """Parse JSON safely — returns {} on any failure, never raises."""
    text = (text or "").strip()
    if not text:
        log.warning("_safe_json: empty body, returning {}")
        return {}

    # Locate first JSON bracket ('{' or '[') to strip prefix
    start = -1
    for ch in ("{", "["):
        idx = text.find(ch)
        if idx != -1 and (start == -1 or idx < start):
            start = idx
    if start == -1:
        log.warning("_safe_json: no JSON bracket in %d-byte response", len(text))
        return {}

    trimmed = text[start:]

    # Find matching end bracket via nesting counter
    end = -1
    depth = 0
    in_str = False
    esc = False
    for i, ch in enumerate(trimmed):
        if esc: esc = False; continue
        if ch == "\\" and in_str: esc = True; continue
        if ch == '"' and not esc: in_str = not in_str; continue
        if in_str: continue
        if ch == trimmed[0]: depth += 1
        elif (trimmed[0] == "{" and ch == "}") or (trimmed[0] == "[" and ch == "]"):
            depth -= 1
            if depth == 0: end = i + 1; break

    if end == -1:
        log.warning("_safe_json: unmatched bracket, returning {}")
        return {}

    try:
        return json.loads(trimmed[:end])
    except json.JSONDecodeError as e:
        log.warning("_safe_json: parse failed at pos %d: %s", e.pos, e.msg[:80])
        return {}
```

## Integration Pattern

Wrap `resp.json()` in a try/except, falling back to `_safe_json()`:

```python
try:
    data = resp.json()
except json.JSONDecodeError:
    data = _safe_json(resp.text)
```

## Common Prefixes to Strip

| Service | Prefix | Length |
|---------|--------|--------|
| Shopee SPX | `)]}'\n` | 5-6 chars |
| AngularJS apps | `)]}',` | 4 chars |
| JSONP callbacks | `callbackFunction(...)` | varies |

## Empty-Body Guard

Always check raw body length BEFORE attempting parse:

```python
body = resp.text or ""
blen = len(body.strip())
if blen == 0:
    log.warning("API response body empty — returning fallback")
    return {}
```

## Debug Logging for Production Diagnosis

Log truncated raw body for debugging parse failures (mask PII):

```python
log.debug("[SPX-DEBUG] GET %s status=%s body(500)=%.500s",
           url, resp.status_code, body)
```

## Key Principles

1. **Never raise from API response parse** — use `return {}`
2. **Never trust Content-Type header** — check actual body content
3. **Always log warning on malformed response** — helps diagnose upstream changes
4. **Use defensive `.get()` in downstream code** — assume response dict may lack expected keys
5. **Test with known-bad data** — empty string, HTML, XML, binary blob
