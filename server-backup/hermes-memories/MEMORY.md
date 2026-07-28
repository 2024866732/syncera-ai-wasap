Tuan Hafizi runs HAFJET, Raub. VPS=main controller/orchestrator; PC Office (Tailscale)=least-privilege executor for local backup/sync/monitor/report/internal automation. Max 3 concise lines (STEP/ACTION/RESULT); explicit confirmation before destructive/critical changes; report only verified state.
§
Git: origin=github.com/2024866732/hafjet-whatsapp-bot.git. Convention: release/vX.Y.Z. Format: sprint(vX.Y.Z): desc. Strict: no direct push/force-push/rebase main.
§
PC Office (100.121.94.41 Tailscale): i3, 16GB RAM, Ubuntu 26.04, CPU-only. Tuan strongly prefers natural Malay TTS; VoxCPM2 (Apache-2.0, Malay, 48kHz) sounded natural in testing. Spell brand as `HAF-JET`/`Haf Jet` in prompts to avoid pronunciation “half-jad”.
§
REPORT FORMAT: MYT (UTC+8) alongside UTC — "HH:MM UTC (HH:MM MYT)". Deploy: start.sh version-controlled, in repo/zip not hidden Azure config.
§
PC Office SSH: `hafizi145` key-only; no `hafjet` account unless requested. Workers are allowlisted+SHA-256; VPS logs metadata only. LiteLLM config backups: age only (no GPG absent new approval), encrypted archive only—never plaintext on unencrypted drive; PC has public recipient only, Tuan holds private identity; metadata may include config_sha256 but never secrets.
§
Primary HAFJET operating reference: `/home/hafizi145/HAFJET-Operating-Manual-v1.md`; explicit Tuan approval overrides it.
§
CRITICAL: ALL cctv-worker restarts need explicit Tuan Hafizi approval — no exceptions. Never auto-restart. Especially during monitoring where process state must not reset.
§
CCTV UI changes remain pending until actual rendered screenshots verify desktop, tablet, and phone layouts; structural HTML/CSS checks alone are insufficient. CCTV investigations require complete time-series evidence before code changes or process resets.
§
JANGAN guna Kudu ZIP API utk deploy dashboard — ia wipe seluruh /site/wwwroot/ (backend+start.sh hilang, app 503). Guna upload file-by-file VFS ke path tepat dashboard/dist/<file>, update index.html terakhir sbg atomic switch. DB di /home/data/bot_data.db selamat drpd wipe.