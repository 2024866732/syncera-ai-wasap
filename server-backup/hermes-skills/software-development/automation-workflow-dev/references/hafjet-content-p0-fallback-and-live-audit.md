# HAFJET Content — P0 fallback + live audit (Aug 2026)

## Incident pattern (live status)
Schedule Active + cron firing ≠ healthy delivery.
Observed: executions `error` through Generate Content → Generate Image → **Merge Content + Image**, never `Send Draft *` → **zero Telegram drafts** for days while UI still "Active".

## P0 root causes (both required)
1. **Image upstream fail** (OpenRouter 502/402/404 chain) — expected sometimes.
2. **Merge Code node crash** — `runOnceForEachItem` returned `[{json:...}]` instead of `{json:...}` →  
   `A 'json' property isn't an object [item 0]` → **fallback path dead**.

Image failure alone must not kill the flow. Merge must always emit a plain content object.

## Fix checklist
1. Patch all Merge Code nodes to `return { json: { ... } }` (see `n8n-code-node-runonce-foreach-pitfall.md`).
2. Keep Generate Image `continueOnFail: true` + `onError: continueRegularOutput`.
3. Pin OpenRouter image model + `max_tokens: 2048` (see `hafjet-content-image-openrouter.md`).
4. Republish workflow (versionId + published_version + history) + restart `hafjet-n8n`.
5. Smoke:
   - content-api `/api/generate` 200
   - `/api/generate-image` 200 (or 502 with credits — OK)
   - Manual path: text draft still lands on TG when image fails
   - When image OK: sendPhoto lands on TG

## Live audit queries (read-only)
- Last 5 `execution_entity` for workflow id
- Confirm run node hits include `Send Draft Photo` or `Send Draft Text Only`
- Latest mtimes under `~/.n8n/content-api/static/images/`
- `curl -s localhost:9119/health` → `image_provider=openrouter`

## Ops invariants
- Do **not** disable whole workflow to "pause image" — kills TG callbacks.
- Prefer Schedule node `disabled` flag if pausing cron only.
- Never paste API keys in Telegram; use server `.env` only.
- Never call `*.example.com` publish stubs.

## Related
- `hafjet-content-phase1-ops.md` — base placement/compose/publish
- `hafjet-content-image-openrouter.md` — current image provider
- `n8n-code-node-runonce-foreach-pitfall.md` — Merge return shape
