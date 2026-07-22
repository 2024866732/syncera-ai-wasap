# Cron Jobs

## hafjet-sales-daily-digest
- **Jadual:** `0 21 * * *` (9:00 PM setiap hari)
- **Timezone:** Asia/Kuala_Lumpur
- **Tujuan:** Ringkasan jualan harian owner.
- **Input:** Jualan hari ini, item popular, transaksi gagal, pending repair, low stock.
- **Output:** WhatsApp owner + optional Gmail archive.
- **Skill:** hafjet-biz-ops

## hafjet-repair-pickup-reminder
- **Job ID:** ebdae9cc10ab
- **Jadual (UTC):** `0 3 * * *`
- **Jadual (MYT):** 11:00 AM setiap hari
- **Tujuan:** Reminder item siap pickup.
- **Input:** Google Sheet `REPAIR BARU` — filter `Status == SIAP`.
- **Output:** WhatsApp customer (free-form text).
- **Had:** Maksimum satu reminder sehari per customer.
- **Pre-flight:** Test WhatsApp credential dengan satu send ke OWNER_PHONE dulu. Kalau gagal (code 100/subcode 33), abort terus — jangan batch.
- **Credential failure escalation:** Jika cron ke-2+ berturut-turut gagal dengan error yang sama, report mesti include langkah Tuan perlu buat (buka Meta Business → WhatsApp → API Setup → dapatkan Phone Number ID baru).
- **⚠️ Env var gap (known, since Jul 2026):** Script needs 7 env vars but 5 are
  NOT in `~/.hermes/.env`. See `hafjet-biz-ops` skill → Pitfalls → "Cron job env var gap"
  for details and hardcoded values. Every agent run must supply them inline.
- **Skill:** hafjet-biz-ops (software-development)

## hafjet-low-stock-alert
- **Jadual:** `0 8 * * *` (8:00 AM setiap hari)
- **Timezone:** Asia/Kuala_Lumpur
- **Tujuan:** Semak stok rendah sebelum operasi harian bermula.
- **Input:** Inventory list + threshold.
- **Output:** WhatsApp owner/admin.
- **Skill:** hafjet-biz-ops

## hafjet-exception-report
- **Jadual:** `0 */2 * * *` (Setiap 2 jam)
- **Timezone:** Asia/Kuala_Lumpur
- **Tujuan:** Kumpul semua exception operasi.
- **Input:** Failed send logs, missing contacts, OAuth issues, webhook failures.
- **Output:** Owner summary.
- **Skill:** hafjet-biz-ops

## Implementation Order
1. **hafjet-sales-daily-digest** — Risiko rendah, tiada customer-facing
2. **hafjet-repair-status-notify** — Event-driven, perlu webhook
3. **hafjet-invoice-dispatch** — Perlu Gmail OAuth (dah siap)
4. **hafjet-repair-pickup-reminder** — Cron-based
5. **hafjet-low-stock-alert** — Cron-based
6. **hafjet-exception-report** — Monitoring
