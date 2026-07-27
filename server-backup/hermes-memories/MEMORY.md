Tuan Hafizi (MD HAFJET, UiTM, Kelantan). Max 3 lines/reply. Format: STEP/ACTION/RESULT. No long patches in chat—use telegram-file-delivery. Deploy: show diff→approve→deploy. Safety BLOCK=stop. No secrets.
§
Git: origin=github.com/2024866732/hafjet-whatsapp-bot.git. Branch convention: release/vX.Y.Z. Commit format: sprint(vX.Y.Z): description. Strict: no direct push to main, no force-push, no rebase main.
§
PC Office (100.121.94.41 Tailscale): i3-2100/16GB/Ubuntu26.04, Python3.13 (uv). OCR=~/ocr-env RapidOCR. STT=~/whisper-env faster-whisper. LiteLLM=~/litellm-env :4000→OpenCodeGo ($10/bln), systemd user service. All venvs via uv.
§
Deployment: start.sh (version-controlled) preferred over direct appCommandLine; startup method must be in repo/zip, not hidden Azure config.
§
Tampermonkey: deliver as .txt via MEDIA:, not inline code. Output: kompleks→satu fail via telegram-file-delivery, chat ringkas 3 ayat. Deployment: copy-paste command blocks with markers (safe/confirm/danger/irreversible), phased, GO/NO-GO, 15-min monitor, rollback.
§
REPORT FORMAT: Always include MYT (UTC+8) alongside UTC: "HH:MM UTC (HH:MM MYT)" text or dual table columns. Don't change DB/log storage — only presentation.
§
Azure: lazy imports (try/except in function) prevent startup exit-code-3. Always health-check BEFORE deploy. 503 root cause was missing db_logger fns, not new import.
§
Composio: ✅ DONE. Plugin kamellperry/hermes-composio. SDK composio==0.18.0 in Hermes venv (~/hermes-agent/venv). Gmail ACTIVE + GitHub ACTIVE. Key format: ak_... from app.composio.dev, sessions=write.
§
D.3+D.5+D.6 CLOSED. Dashboard: date filter+CSV+MYT+face grid+Gender(est.)/Age(est.). Face: Haar cascade, 36% success (conf≥0.7). Attr: cv2.dnn Caffe ~133ms, NO embeddings. UI workflow: implement→verify→"PENDING VISUAL CONFIRMATION" (never "CLOSED" without actual screenshots)→user confirms→CLOSED.
§
Responsive checklist: verify at 1440/1024/768/480/390/360px. Touch min 44px WCAG. No horiz overflow. Font ≥13px phone. Stats: auto-fit grid. Cards: desktop 6-col, tablet 5-col, phone 2-col→1-col @480px.