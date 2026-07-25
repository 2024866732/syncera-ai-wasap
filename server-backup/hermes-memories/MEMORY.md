Tuan Hafizi (MD HAFJET, UiTM, Kelantan). Max 3 lines/reply. Format: STEP/ACTION/RESULT. No long patches in chat—use telegram-file-delivery. Deploy: show diff→approve→deploy. Safety BLOCK=stop. No secrets.
§
Git: origin=github.com/2024866732/hafjet-whatsapp-bot.git. Branch convention: release/vX.Y.Z. Commit format: sprint(vX.Y.Z): description. Strict: no direct push to main, no force-push, no rebase main.
§
PC Office (100.121.94.41): i3-2100/16GB/Ubuntu26.04. OCR=RapidOCR, STT=faster-whisper, TTS=huggingface-tts, LiteLLM=:4000→OpenCodeGo.
§
Deployment: start.sh (version-controlled) preferred over direct appCommandLine; startup method must be in repo/zip, not hidden Azure config.
§
Model: OpenCodeGo /zen/go/v1 ($10/bln). Chain: deepseek-v4-pro→glm-5.2→qwen3.7-max→kimi-k3.
§
Tampermonkey: deliver as .txt via MEDIA:, not inline code. Output: kompleks→satu fail via telegram-file-delivery, chat ringkas 3 ayat. Deployment: copy-paste command blocks with markers (safe/confirm/danger/irreversible), phased, GO/NO-GO, 15-min monitor, rollback.
§
REPORT FORMAT: Always include MYT (UTC+8) alongside UTC: "HH:MM UTC (HH:MM MYT)" text or dual table columns. Don't change DB/log storage — only presentation.
§
Output complex→one file via telegram-file-delivery, chat≤3 lines. Deploy: phased command blocks (🟢safe/🔴confirm/⚠️danger/💀irreversible), GO/NO-GO, 15min monitor, rollback.
§
BLOCKED: curl|python3 or pipe-to-interpreter patterns. Use az webapp log tail or temp file.
§
Azure: lazy imports (try/except in function) prevent startup exit-code-3. Always health-check BEFORE deploy. 503 root cause was missing db_logger fns, not new import.