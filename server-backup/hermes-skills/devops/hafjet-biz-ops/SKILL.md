---
name: hafjet-biz-ops
description: Operasi bisnes HAFJET — WhatsApp, Loyverse, Gmail, repair updates, invoice dispatch, stock alerts, daily digest. Triggered by webhooks, cron jobs, or manual commands.
version: 1.0.0
author: Hermes-HAFJET
license: MIT
metadata:
  hermes:
    tags: [hafjet, business-ops, whatsapp, loyalty, gmail, invoice, repair, inventory]
---

# HAFJET Biz Ops

Operasi bisnes HAFJET — integrate POS, repair system, inventory, dan messaging.

## Architecture (4 Layers)

```
Layer 1 — Inputs:     WhatsApp, Cron, Loyverse Webhook, Manual
Layer 2 — Middleware:  FastAPI/Express — auth, validation, DB mapping, audit
Layer 3 — Hermes:     Reasoning, message compose, summarize, classify
Layer 4 — Outputs:    WhatsApp (notifikasi), Gmail (invoice), Notion (archive)
```

## Job List (6 Jobs)

| # | Job Name | Trigger | Tindakan |
|:---:|:---|:---|:---|
| 1 | `hafjet-sales-daily-digest` | Cron 9:00 PM | Ringkasan sales → WhatsApp owner |
| 2 | `hafjet-repair-status-notify` | Ticket status berubah | Update WhatsApp customer |
| 3 | `hafjet-repair-pickup-reminder` | Cron 11:00 AM | Reminder item READY >3 hari |
| 4 | `hafjet-invoice-dispatch` | Sale complete | Gmail invoice + WhatsApp ringkasan |
| 5 | `hafjet-low-stock-alert` | Cron pagi | Alert stok bawah threshold |
| 6 | `hafjet-exception-report` | Cron setiap 2 jam | Lapor errors, missing data |

## Standard Payload

```json
{
  "event_type": "sale.completed",
  "source_system": "loyverse",
  "store_id": "hafjet-kulai",
  "order_id": "LV-20260712-00123",
  "ticket_id": null,
  "customer": {
    "name": "Nama Pelanggan",
    "phone": "+60xxxxxxxxx",
    "email": "customer@example.com"
  },
  "items": [
    {
      "sku": "IP11-BAT",
      "name": "iPhone 11 Battery Replacement",
      "qty": 1,
      "unit_price": 129.00
    }
  ],
  "amount_total": 129.00,
  "payment_status": "paid",
  "repair_status": null,
  "pickup_due_date": null,
  "invoice_url": "https://...",
  "notes_internal": "walk-in customer",
  "created_at": "2026-07-12T18:30:00+08:00"
}
```

## Peraturan Utama

1. Jangan hantar mesej customer jika **nombor telefon tiada/tidak sah**
2. Jangan hantar invoice email jika **email customer kosong**
3. Mesej customer: **ringkas, sopan, jelas**
4. Owner report: **exception, nilai, item kritikal, tindakan**
5. Data bercanggah → **exception report dahulu**

## Repair Status Mapping

| Status | Mesej Customer |
|:---|:---|
| `received` | "Peranti anda sudah kami terima dan sedang masuk queue pemeriksaan." |
| `diagnosing` | "Kami sedang periksa masalah peranti anda." |
| `waiting-part` | "Kami sedang tunggu spare part untuk teruskan pembaikan." |
| `in-progress` | "Pembaikan sedang dijalankan." |
| `ready-pickup` | "Peranti anda siap dan boleh diambil di kedai." |
| `completed` | "Kes selesai dan direkodkan." |

## Workflow Rules

### sale.completed
- Check `payment_status`
- If `paid` → compose ringkasan jualan
- If `customer.phone` exists → WhatsApp terima kasih + ringkasan
- If `customer.email` + `invoice_url` → Gmail invoice dispatch
- If no phone/email → log ke exception report

### repair.status_changed
- Translate status teknikal → ayat customer-friendly
- If `ready-pickup` → schedule reminder after 3 days

### cron.daily-sales-digest
- Ringkaskan jumlah jualan harian
- Top items + payment mix
- Pending repair + low stock
- Format: owner, bukan customer

### cron.pickup-reminder
- Cari ticket `ready-pickup` >3 hari
- Max 1 reminder/customer/day
- Escalate ke owner jika tiada respons

### cron.low-stock
- Senaraikan item di bawah threshold
- Susun ikut kategori + kritikal
- Cadangkan reorder shortlist

## Output Format

### WhatsApp Customer
- Pendek, nada mesra
- Nyatakan tindakan seterusnya
- Elak jargon teknikal

### Gmail Invoice
- Subject: "Invoice / Resit HAFJET — [OrderID]"
- Sertakan order_id, amount_total, link/attachment
- Gaya profesional ringkas

### Owner Digest
- Bullet point
- Nombor penting, exception, tindakan

## Edge Cases

| Scenario | Tindakan |
|:---|:---|
| Phone ada, email tiada | WhatsApp sahaja |
| Email ada, phone tiada | Gmail sahaja |
| Dua-dua tiada | Exception report |
| payment_status ≠ paid | Jangan dispatch invoice |
| repair_status tak dikenali | Tandakan untuk semakan manual |

## Credentials Required

| System | Keys Needed |
|:---|:---|
| **Loyverse** | `LOYVERSE_ACCESS_TOKEN`, Webhook URL |
| **Gmail** | OAuth client_id, client_secret, refresh_token |
| **WhatsApp** | Cloud API token, phone_number_id |

## File Structure

```
~/.hermes/skills/hafjet-biz-ops/
├── SKILL.md                    ← This file
├── references/
│   ├── message-templates.md    ← WhatsApp/Gmail templates
│   ├── status-mapping.md       ← Repair status translations
│   └── cron-jobs.md            ← Job schedules & configs
└── assets/
    └── sample-payloads.json    ← Example payloads
```
