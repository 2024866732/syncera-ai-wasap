# Frigate Alert Channel — Telegram (keputusan 2026-08-08)

## Konteks
Fasa A CCTV alert pipeline pada asalnya menghantar person events → Azure bot `/cctv-alert` → WhatsApp owner.
**Semua delivery GAGAL dengan 131047** → keputusan Tuan: **CCTV alerts pindah ke Telegram**.
WhatsApp kekal untuk customer service (Sarah, menu, dll) — JANGAN campur.

## Kenapa WhatsApp gagal (131047 — Re-engagement message)
- WhatsApp Cloud API: mesej `type: text` (session message) hanya boleh dihantar dalam 24 jam selepas
  inbound customer. CCTV alerts adalah **proactive** (tiada inbound) → Meta terima API call (HTTP 200,
  jadi poller log `sent=True`) tetapi **buang delivery** — callback status `failed`, code `131047`.
- **Pengajaran utama:** `sent=True` dari HTTP 200 ≠ delivered. Source of truth = webhook callback
  yang direkod dalam `message_delivery_status` table (bot DB).
- Diagnosis cepat: `SELECT status, COUNT(*) FROM message_delivery_status GROUP BY status;`
  — jika semua `failed` + 131047 → semua outbound proactive dalam masalah.
- Fix di WhatsApp = template message (`type: template`, approved) — rumit, ada approval lag.
  **Pilihan lebih mudah untuk monitoring alerts: Telegram.**

## Keputusan channel (2026-08-08)
- CCTV alert → **Telegram group `-5330700835`** (group "CCTV ALERT" — Bot API `sendMessage`, chat_id negatif = group)
  - ⚠️ Draft awal guna `-5098600919` (SALAH — chat not found). Tuan betulkan ke `-5330700835` pada 08-08.
- WhatsApp bot kekal 100% untuk customer service
- Tiada perubahan Frigate / CCTV lain

## Telegram setup — semak bot dalam group DULU
```bash
# 1. Verify bot identity + semak group membership
curl -s "https://api.telegram.org/bot${TOKEN}/getMe"          # id, username
curl -s "https://api.telegram.org/bot${TOKEN}/getChat?chat_id=-5330700835"
# ok:true → bot dalam group (tunjuk title/type); "chat not found" → bot BELUM di-add
```
- Group chat_id bermula `-` (negatif). Jangan lupa.
- Kalau `chat not found`: user mesti add bot manual (Group Info → Add Members). Beri role Admin
  supaya boleh post tanpa restriction.
- Bot identity (2026-08-08): `Hermes Agent` @hermes_efxcodeowgvsxrw2_bot, token dalam `~/.hermes/.env` (`TELEGRAM_BOT_TOKEN`).

## Poller pattern (Office PC)
- Poller query Frigate DB read-only → hantar terus ke Telegram Bot API dari Office PC
  (tiada libatan Azure untuk alert CCTV).
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CCTV_CHAT_ID=-5330700835` dalam `.env` Office PC
  (`/home/hafizi145/cctv-analysis/.env`, chmod 600).
- Payload: `{"chat_id": -5330700835, "text": "...", "parse_mode": "HTML"}` ke
  `https://api.telegram.org/bot<TOKEN>/sendMessage`.
- **WAJIB `parse_mode: HTML`, BUKAN Markdown** — nama kamera `outdoor_shop` mengandungi underscore
  yang diinterpretasi Telegram Markdown sebagai italic tak berpasangan → HTTP 400 `Bad Request:
  message text is empty`. HTML escape `& < >` sebelum send. (Ditemui 08-08: `Markdown` → 400,
  tukar ke `HTML` → ok=True.)
- Cooldown (5 min) kekal untuk elak spam — Frigate rekod ~100 event/jam.
- Cron: `*/2 * * * *` poller → log `~/cctv-analysis/logs/cctv-alert.log`.

## Tailscale serve untuk UI Frigate (pitfall)
- Frigate bind `127.0.0.1:5000` sahaja — perlu proxy untuk akses dari device lain.
- `tailscale serve --bg 5000` **MENGGANTIKAN root proxy sedia ada** (single root handler).
  Jika sudah ada serve lain (cth dashboard 9119), `serve --bg <port>` akan overwrite.
- **Sentiasa `tailscale serve status` DAHULU.** Untuk multiple services guna path-based mount
  (contoh `tailscale serve --bg /frigate/ http://127.0.0.1:5000`) atau port berasingan.
- Akses tailnet: `https://<hostname>.tailNNNNN.ts.net/` (tailnet only, perlu device join tailscale).
