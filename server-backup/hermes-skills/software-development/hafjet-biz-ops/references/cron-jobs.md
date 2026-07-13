# Cron Jobs

## hafjet-sales-daily-digest
- **Jadual:** `0 21 * * *` (9:00 PM setiap hari)
- **Timezone:** Asia/Kuala_Lumpur
- **Tujuan:** Ringkasan jualan harian owner.
- **Input:** Jualan hari ini, item popular, transaksi gagal, pending repair, low stock.
- **Output:** WhatsApp owner + optional Gmail archive.
- **Skill:** hafjet-biz-ops

## hafjet-repair-pickup-reminder
- **Jadual:** `0 11 * * *` (11:00 AM setiap hari)
- **Timezone:** Asia/Kuala_Lumpur
- **Tujuan:** Reminder item siap pickup melebihi 3 hari.
- **Input:** Semua ticket `ready-pickup` dengan `ready_since >= 3 days`.
- **Output:** WhatsApp customer.
- **Had:** Maksimum satu reminder sehari per customer.
- **Skill:** hafjet-biz-ops

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
