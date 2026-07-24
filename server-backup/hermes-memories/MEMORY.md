Tuan Hafizi (MD HAFJET, UiTM study leave, Malay+Kelantan). Wants concise tables/bullets, hates overexplaining. Hard rules: pre-commit review (show status+diff, approve BEFORE commit); pre-deploy review (diff+logs, deploy only on explicit cmd); destructive/long/irreversible ops need SEPARATE approval each time; if safety gate BLOCKS a cmd, treat as explicit denial — stop, no retry, wait for fresh instruction. Never guess secrets.
§
Git: origin=github.com/2024866732/hafjet-whatsapp-bot.git. Branch convention: release/vX.Y.Z. Commit format: sprint(vX.Y.Z): description. Strict: no direct push to main, no force-push, no rebase main.
§
PC Office (100.121.94.41 TS): i3-2100,16GB,Ubuntu26.04,Python3.14+uv. Skins: OCR via RapidOCR (~/ocr-env), STT via faster-whisper (~/whisper-env), TTS via huggingface-tts-deploy.
§
Loyverse API: limit max=50 (confirmed, overrides previous 250), param dot-notation created_at.gte/lte, format YYYY-MM-DDTHH:MM:SS+08:00.
§
Deployment: start.sh (version-controlled) preferred over direct appCommandLine; startup method must be in repo/zip, not hidden Azure config.
§
Model provider: OpenCode Go ($10/mo) BUT opencode.ai is IP-banned from this server (Cloudflare 403/1010). Cannot use Go subscription here. Working: DeepSeek direct (api.deepseek.com, $2 credit) + OpenRouter (openrouter.ai, free tier Nemotron 550B). Groq also IP-banned. OpenCode CLI v1.18.4 installed, login requires browser (headless VPS can't).
§
CCTV worker at ~/projects/hafjet-cctv-worker (office PC). Tapo TC74 @192.168.1.94 stream1. Dashboard /dashboard, alerts /tmp/cctv-alerts.log. Cron monitoring every 4h.
§
Sequential testing: ping→port→ffprobe→debug frame→scan30 frames→worker. Change one variable at a time. Camera positioning is #1 cause of zero detections, not the model.
§
JARVIS on hafjet-office-pc (100.121.94.41:3142). Skill: hafjet-jarvis-setup.
§
OpenCode Go endpoint /zen/go/v1 works from this server (NOT /zen/v1 — IP banned, 403/1010). Primary chain: deepseek-v4-pro → glm-5.2 → qwen3.7-max → kimi-k3, all via opencode-go provider. Key sk-MS8QR...ctM0 in config. CLI: opencode-ai npm pkg, auth.json at ~/.local/share/opencode/.