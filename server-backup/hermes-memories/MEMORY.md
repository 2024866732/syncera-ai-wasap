Tuan Hafizi (Muhammad Syahrul Hafizi bin Zainal) — Managing Director of HAFJET (M) SDN BHD. UiTM student (Bachelor of Administrative Science, study leave). Prefers casual Malay + Kelantan dialect, switches to English for tech. Gets frustrated with over-explaining. Primary master of Hermes-HAFJET system.
§
GitHub: 2024866732, 35 repos (Hafjet-App, openhuman, hermes-desktop, HAFJET). Server: HAFJET-Hermes-Server (1GB RAM + 4GB Swap), Hermes v0.16.0. Installed: gh CLI, ctx7, codebase-memory-mcp, kilocode, superpowers skills.
§
Studying LAW299 — Topics: Intro to Law, Sources of Law, Court System, Partnership Act 1961, Companies Act 2016, Contracts Act 1950. Prefers quiz-style (T/F, MCQ) with concise BM answers + English case/Act refs.
§
WhatsApp Bot v2.0 on Azure (hafjet-whatsapp-bot.azurewebsites.net). Phone ID: 1089032617637482, WABA: 1558497515847375. OpenRouter AI (owl-alpha). Privacy Policy: http://akaunai.me/hafjet-privacy/ (GitHub Pages).
§
WhatsApp webhook tunnel: ngrok only (Cloudflare Tunnel incompatible). ngrok v3 token must be in config file.
§
HAFIZI GADJET ENTERPRISE AI config: OpenRouter AI on Azure. hermes_ai.py uses fail-fast timeout (connect=5s, read=10s). Privacy Policy at http://akaunai.me/hafjet-privacy/ (GitHub Pages).
§
Migration strategy: existing local project → existing repo = Strategy C (subfolder + new branch). Exclude secrets/caches/venv. Show status before push. Wait for green light.
§
Meta WhatsApp App Publish: Category must be "Messaging" (not Business). Required fields for submission: App icon (1024x1024), Privacy Policy URL, Category. Data Deletion URL required (can be same page with dedicated section). DPO section only needed for EU-targeted apps. GitHub Pages API: `gh api repos/{owner}/{repo}/pages -X POST -f "source[branch]=main" -f "source[path]=/"`. URL format: `http://username.github.io/reponame/`.
§
OpenRouter API key provided by user (starts with sk-or-...2e08) set in Azure app settings. Model changed from google/gemini-2.0-flash-001 (deprecated) to openrouter/owl-alpha. Azure WhatsApp Bot at https://hafjet-whatsapp-bot.azurewebsites.net/webhook