Tuan Hafizi — MD of HAFJET (M) SDN BHD. UiTM study leave. Malay+Kelantan dialect. Prefers concise tables/bullets, hates overexplaining. Rules: show diff+logs before deploy, deploy only on explicit command, 1 task/run max 20 calls. Never guess secrets. Business: logistics, phone shop, Loyverse POS (2 stores), AI-powered ops. Website: hafjet.my. Wants practical tools, prefers batch setup all-at-once.
§
Git repo: https://github.com/2024866732/hafjet-whatsapp-bot.git (confirmed active — NOT syncera-ai-wasap)
§
External API defense: never trust resp.json() alone — use _safe_json() that returns {} instead of raising. Guard empty body, prefix (Shopee: )]}\'\n), unmatched brackets, parse failures. Log raw body(500) for debugging.
§
Azure: RG=hafjet-bot-rg. Webapp: `hafjet-whatsapp-bot`. HTTP timeout=240s (gunicorn 600s). startup.txt>start.sh; clear __pycache__; Kudu VFS PUT+AAD. zip deploy skips Oryx. `az webapp stop`+`start` (not restart). Health: GET /health → JSON. Dashboard: /dashboard/ (SPA), API: /api/stats.
§
BANNED terminal (Tuan DENIES all 3 — agent must not run unreviewed code): pipe net output into interpreter, python3 heredoc, append/redirect into config dotfiles. Safe form: write .py to /tmp then run; curl -o then parse; suggest config lines for Tuan to edit manually. Pickup reminder RESOLVED via Google Sheets (Azure bot has NO repair API). Cron 0 3 * * * = 11AM MYT, script reads Sheet 1T0FzNhk..., filters STATUS_REPAIR=='SIAP DIAMBIL', WhatsApp to CUSTOMER (NO_PHONE), owner +60198021500 summary only. Daily sales cron 9408be4cd593 now 0 13 * * * (9PM MYT). Cron MYT=UTC+8.
§
Superpowers: Email, GitHub, X, Google Workspace, Notion, PowerPoint, Tech News Digest, Loyverse POS (2 stores). Loyverse Store: HAFIZI GADJET ENTERRPISE, Raub Pahang (ID: 7ff40a33-f30b-4680-a2e0-a6b644f05988). Architecture: Loyverse (data/mata) FIRST, then WhatsApp (mulut) — stable data layer before customer messaging.
§
TTS voice: ElevenLabs Rachel (pNInz6obpgDQGcFmaJgB, eleven_multilingual_v2) preferred. Edge TTS ms-MY-YasminNeural fallback.