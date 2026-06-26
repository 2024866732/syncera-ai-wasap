Tuan Hafizi (Muhammad Syahrul Hafizi bin Zainal) — Managing Director of HAFJET (M) SDN BHD. UiTM student (Bachelor of Administrative Science, study leave). Prefers casual Malay + Kelantan dialect, switches to English for tech. Gets frustrated with over-explaining. Primary master of Hermes-HAFJET system.
§
GitHub: 2024866732, 35 repos. Privacy Pages: 2024866732/hafjet-privacy. WhatsApp Bot: 2024866732/hafjet-whatsapp-bot (v2.0.0).
§
Studying LAW299 — Topics: Intro to Law, Sources of Law, Court System, Partnership Act 1961, Companies Act 2016, Contracts Act 1950. Prefers quiz-style (T/F, MCQ) with concise BM answers + English case/Act refs.
§
HAFJET WhatsApp Bot v2.0 — Production ready (2026-06-26). Live on Azure + Meta. Canonical greeting, dedup (5min), strict AI (150 tokens, temp 0.3). GitHub: 2024866732/hafjet-whatsapp-bot (tag v2.0.0). Privacy: http://akaunai.me/hafjet-privacy/. Phone ID: 1089032617637482. Meta category: Messaging.
§
WhatsApp webhook tunnel: ngrok only (Cloudflare Tunnel incompatible). ngrok v3 token must be in config file.
§
HAFJET WhatsApp Bot v2.1 Phase 1 deployed: DB logging (db_logger.py) + Dashboard API (/api/stats, /api/messages, /api/customers) + WebSocket (/ws). GitHub: 2024866732/hafjet-whatsapp-bot (main). Next: React dashboard frontend.
§
Meta WhatsApp App Publish: Category must be "Messaging" (not Business). Required fields for submission: App icon (1024x1024), Privacy Policy URL, Category. Data Deletion URL required (can be same page with dedicated section). DPO section only needed for EU-targeted apps. GitHub Pages API: `gh api repos/{owner}/{repo}/pages -X POST -f "source[branch]=main" -f "source[path]=/"`. URL format: `http://username.github.io/reponame/`.
§
OpenRouter API key provided by user (starts with sk-or-...2e08) set in Azure app settings. Model changed from google/gemini-2.0-flash-001 (deprecated) to openrouter/owl-alpha. Azure WhatsApp Bot at https://hafjet-whatsapp-bot.azurewebsites.net/webhook
§
HAFJET WhatsApp Bot v2.1 Phase 1 deployed: db_logger.py + dashboard API + WebSocket. React dashboard built. Static files mount causes 500 in Azure — needs separate hosting.