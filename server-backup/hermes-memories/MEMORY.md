Tuan Hafizi (MD HAFJET, UiTM study leave, Malay+Kelantan). Wants concise tables/bullets, hates overexplaining. Hard rules: pre-commit review (show status+diff, approve BEFORE commit); pre-deploy review (diff+logs, deploy only on explicit cmd); destructive/long/irreversible ops need SEPARATE approval each time; if safety gate BLOCKS a cmd, treat as explicit denial — stop, no retry, wait for fresh instruction. Never guess secrets.
§
Git: origin=github.com/2024866732/hafjet-whatsapp-bot.git. Branch convention: release/vX.Y.Z. Commit format: sprint(vX.Y.Z): description. Strict: no direct push to main, no force-push, no rebase main.
§
External API defense: never trust resp.json() alone — use _safe_json() returning {} on failure; guard empty body, vendor prefixes (Shopee: )]}'\n), unmatched brackets, parse errors; log raw body(500).
§
AI licensing: commercial-use clearance needed before customer-facing; cc-by-nc/unlicensed avoided for business. mesolitica TTS approved 2026-07-20 (personal only).
§
PC Office (100.121.94.41 TS): i3-2100,16GB,Ubuntu26.04,Python3.14+uv. Skins: OCR via RapidOCR (~/ocr-env), STT via faster-whisper (~/whisper-env), TTS via huggingface-tts-deploy.
§
XiaoZhi MCP: Hermes=SERVER. wss://api.xiaozhi.me/mcp/ (official). ~/hafjet-mcp-bridge/, systemd user service. Device on xiaozhi.me. Token leaked→rotate before prod.
§
Loyverse API: limit max=50 (confirmed, overrides previous 250), param dot-notation created_at.gte/lte, format YYYY-MM-DDTHH:MM:SS+08:00.
§
Deployment: start.sh (version-controlled) preferred over direct appCommandLine; startup method must be in repo/zip, not hidden Azure config.
§
Login endpoint: uses email field (not username). Default admin seeded as hafizi@hafjet.com / admin123 if no staff exists.
§
Tuan expects practical usage examples shown immediately after any new tool/skill is installed — "load-and-show" pattern, not just "skill created."