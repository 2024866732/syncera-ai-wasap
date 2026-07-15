Tuan Hafizi — MD of HAFJET (M) SDN BHD. UiTM study leave. Malay+Kelantan dialect. Prefers concise tables/bullets, hates overexplaining. Rules: show diff+logs before deploy, deploy only on explicit command, 1 task/run max 20 calls. Never guess secrets. Business: logistics, phone shop, Loyverse POS (2 stores), AI-powered ops. Website: hafjet.my. Wants practical tools, prefers batch setup all-at-once.
§
Git repo: https://github.com/2024866732/hafjet-whatsapp-bot.git (confirmed active — NOT syncera-ai-wasap)
§
External API defense: never trust resp.json() alone — use _safe_json() that returns {} instead of raising. Guard empty body, prefix (Shopee: )]}\'\n), unmatched brackets, parse failures. Log raw body(500) for debugging.
§
Azure: RG=hafjet-bot-rg. Webapp: `hafjet-whatsapp-bot`. HTTP timeout=240s (gunicorn 600s). startup.txt>start.sh; clear __pycache__; Kudu VFS PUT+AAD. zip deploy skips Oryx. `az webapp stop`+`start` (not restart). Health: GET /health → JSON. Dashboard: /dashboard/ (SPA), API: /api/stats.
§
BANNED terminal: pipe net→interpreter, python3 heredoc, redirect into config dotfiles. Safe: write .py to /tmp then run; curl -o then parse; suggest config for manual edit. Cron MYT=UTC+8 (UTC 0 3 * * * = 11AM MYT). Daily sales cron 0 13 * * * (9PM MYT).
§
Superpowers: Email, GitHub, X, Google Workspace, Notion, PowerPoint, Tech News Digest, Loyverse POS (2 stores). Architecture: Loyverse (data) FIRST, then WhatsApp (mulut).
§
TTS voice: ElevenLabs Rachel (pNInz6obpgDQGcFmaJgB, eleven_multilingual_v2) preferred. Edge TTS ms-MY-YasminNeural fallback.
§
Monthly Sales Tracking — HAFIZI GADJET ENTERRPRISE:
- June 2026: Gross RM7,783.99 | Refunds RM0.00 | Discounts RM62.99 | Net RM7,721.00 | COGS RM5,533.09 | Gross Profit RM2,187.91 (28.3% margin)