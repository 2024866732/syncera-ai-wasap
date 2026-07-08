## Frontend bundle verification for SPX/debug tasks

When asked to inspect a specific live frontend asset (e.g. `index-<hash>.js`) and local source/build paths are unclear:

1. Search the workspace for standard build dirs (`dist`, `build`, `wwwroot`) and the exact filename.
2. If not found locally, check existing deployment artifacts (`.zip` files in the workspace) — list contents and extract the target asset for inspection.
3. If artifact inspection is blocked or unavailable, ask the user for the live webapp URL and fetch via browser.
4. Verify these SPX-specific frontend behaviors:
   - Sync endpoint is called as async trigger and expects `202 Accepted`, not a long-running response.
   - UI polls `/api/spx/sync-progress` for completion.
   - WebSocket `onmessage` guards non-JSON text (e.g. `pong`) before `JSON.parse`.
   - Cache buster / new asset is actually loaded (not stale bundle).

Pitfall: do not treat missing local build dirs as a blocker — fall back to deployment artifacts or live URL immediately.
