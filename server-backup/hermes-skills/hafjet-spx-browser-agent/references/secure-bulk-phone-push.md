# Secure SPX bulk-phone push

## Contract

`POST /api/spx/bulk-map-phones` accepts a JSON array directly:

```json
[{"tracking":"SPXMY...","phone":"+601..."}]
```

An object wrapper such as `{ "phones": [...] }` is not the contract and can produce an empty `total: 0` result.

## Required client pattern

- Never embed or transmit an API key in source, commit, Telegram, screenshot, or shared console paste.
- Store the key in Tampermonkey private storage with `GM_setValue`; read it with `GM_getValue`.
- Use `GM_xmlhttpRequest` with `@connect` for the HAFJET host and a 45-second bounded timeout. Return explicit `onload`, `onerror`, and `ontimeout` results.
- Do not use a naked `fetch` + `AbortController` error as diagnosis. First prove CORS and server route behavior.

## Server protection

- Include `/api/spx/bulk-map-phones` in protected write routes; require `X-API-Key`.
- If a key is exposed, rotate the App Service setting immediately and restart after VFS source deployment.

## Live acceptance checks

1. SPX-origin preflight returns 200 and permits `POST`, `OPTIONS`, `Content-Type`, and `X-API-Key`.
2. `POST []` without key returns 401.
3. `POST []` with the new key returns 200 and `total: 0`.
4. A browser array with real, valid tracking/phone entries yields `updated > 0` only when those tracking records exist and need mapping.

A VFS upload alone does not prove active auth middleware: perform an approved clean App Service stop/start before acceptance checks.
