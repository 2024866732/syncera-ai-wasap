Tuan Hafizi — MD of HAFJET, UiTM study leave. Malay+Kelantan dialect, tech English for code. Prefers concise tables/bullets, hates overexplaining without evidence. Rules: show diff+logs before deploy, deploy only on explicit command, 1 task/run max 20 calls STOP. Never guess secrets.
§
Git repo: https://github.com/2024866732/hafjet-whatsapp-bot.git (confirmed active — NOT syncera-ai-wasap)
§
External API defense: never trust resp.json() alone — use _safe_json() that returns {} instead of raising. Guard empty body, prefix (Shopee: )]}\'\n), unmatched brackets, parse failures. Log raw body(500) for debugging.
§
Azure: RG=hafjet-bot-rg. Front-door proxy HTTP timeout=240s (gunicorn 600s) — synchronous bulk endpoints 504; background api_spx_sync (APScheduler, returns 202) safe. startup.txt>start.sh; clear __pycache__; Kudu VFS PUT+AAD. zip deploy skips Oryx; WEBSITES_CONTAINER_START_TIME_LIMIT=300.
§
SPX: show_secret ABANDONED (Jul 2026). Phones via POST /api/spx/phones/bulk (bulk text mapping) or CSV col 3. Background sync L1002 uses fresh get_spx_cookies() each tick — no stale cookie bug. Rate 0.5s, cap 60/day, 08-21 MYT via ZoneInfo. spx_sync_state.cookies unused.
§
Azure deploy: use `az webapp stop` then `az webapp start` (not `restart`) for clean reload. Old gunicorn workers may cache .pyc.
§
BANNED terminal: curl|python3 (Tuan — high-risk injection). Password in curl -d exposed in ps/history — use @file payload. Kudu DB PUT requires If-Match:* header to beat ETag 412. Use file-based 2-step: curl -o then python3 script.py.
§
§
Hermes superpowers: Email (Himalaya hafjetai@gmail.com), GitHub CLI (gh v2.95.0 as 2024866732). xurl v1.2.2 installed, X Dev App setup pending. Google Workspace deps ready, OAuth not done. §
SECURITY: Never echo API keys/secrets in chat. User runs credential registration (xurl auth, gh auth) in own terminal.