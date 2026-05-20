# 01 · Product Overview

## Executive Summary

**SYNCERA** is a desktop-based AI Messenger and Business Operating System designed for small-to-medium enterprises (SMEs) that conduct customer communication primarily through WhatsApp. SYNCERA combines a fully-featured WhatsApp Web client with an offline-capable AI auto-reply engine, customer relationship management, broadcast tools, knowledge base management, sales pipeline tracking, and professional reporting — all in a single privacy-first, locally-hosted application.

Unlike cloud-based competitors that store customer data on third-party servers, SYNCERA operates entirely on the user's own computer. No conversation data, contact records, business knowledge, or AI prompts ever leave the user's machine unless they explicitly enable Google Drive backup.

---

## Problem Statement

Malaysian and Southeast Asian SMEs face three primary pain points in WhatsApp-based customer service:

1. **Manual reply overload** — Single business owners answer 100-500 customer messages daily, leading to slow response times and lost sales.
2. **Cloud dependency & privacy risk** — Existing automation tools (WATI, Respond.io, Twilio) require sending all customer data through foreign cloud servers, incompatible with sensitive industries (healthcare, legal, financial advisory).
3. **High recurring costs** — SaaS WhatsApp tools charge RM200–RM2,000/month per seat, prohibitive for micro-businesses.

## Solution

SYNCERA provides:

- **One-time purchase, no subscription** — Pay once, own forever.
- **100% local data** — DB, conversations, KB stored on user's PC.
- **Local AI brain** — Integrates with Ollama, LM Studio, or free cloud fallback (Pollinations.ai). No OpenAI key required.
- **WhatsApp Web protocol** — Uses official Baileys library, mirrors a paired smartphone.
- **Single binary** — Native Windows installer, no Docker, no setup.

---

## Target Market

### Primary Segments
| Segment | Pain Point | SYNCERA Fit |
|---|---|---|
| Electrical / Plumbing / Hardware retailers | Hundreds of "berapa harga" enquiries daily | KB-based AI auto-quote |
| Beauty salons / Spas / Clinics | Appointment booking, follow-ups | Reminders + templates |
| Online sellers (Shopee/Lazada/IG) | Cross-platform customer service | Broadcasts + bulk send |
| F&B (catering, cloud kitchens) | Order intake via WA | Order tracker + pipeline |
| Service trades (aircond, repair) | Quotation + scheduling | Quick Send + reports |

### Secondary Segments
- Real estate agents (lead nurturing)
- Education centers (parent communication)
- Professional services (initial enquiry filtering)

### Geographic Focus
**Phase 1 (Year 1):** Malaysia, Singapore, Brunei
**Phase 2 (Year 2):** Indonesia, Thailand, Philippines
**Phase 3 (Year 3):** Vietnam, India, broader SEA

---

## Product Pillars

### 1. AI Auto-Reply Engine
- Detects customer intent using a hybrid approach: keyword matching, KB scoring, and LLM-powered natural language generation.
- Supports three AI backends: **Ollama** (local), **LM Studio** (local), **Pollinations.ai** (free cloud fallback).
- Smart fallback: if AI is unavailable, uses synonym-expanded KB matcher.
- Per-conversation persona override for high-touch VIP customers.

### 2. Inbox & Conversations
- WhatsApp-style three-pane UI (sidebar, chat, right panel).
- Full media support: images, videos, audio, documents, stickers.
- Typing indicators, read receipts, presence updates.
- Pin, archive, label conversations.

### 3. Knowledge Base
- Up to unlimited entries (tested with 500+).
- Categories: Products, Services, Pricing, FAQ, Policies, Contact Info.
- AI reads ALL active entries before generating each reply.
- Per-entry enable/disable for A/B testing.

### 4. Pipeline (Sales CRM)
- 5-stage Kanban: New Lead → In Support → Customer → VIP → Closed
- Drag-and-drop reassignment.
- Filter by stage to focus daily work.

### 5. Broadcast
- Send to thousands of contacts with anti-ban delay controls (0ms / 300ms / 1.5s).
- Filter by label.
- Track sent/failed/pending counts.

### 6. Templates
- Pre-built variable templates: `{nama}`, `{telefon}`, `{tarikh}`, `{produk}`.
- Category-organized.
- Insert mid-chat via keyboard shortcut.

### 7. Orders
- Track customer orders with status (new / processing / shipped / completed / cancelled).
- Revenue summary (paid vs pending).
- Link to source conversation.

### 8. Reminders
- Schedule follow-ups with desktop notifications.
- One-shot or recurring (daily / weekly / monthly).

### 9. Analytics
- KPI dashboard: messages today, AI rate, response time, revenue.
- 7-day message trend chart.
- Top 10 customers by message volume.
- Customer segment distribution by label.

### 10. AI Insights
- Recommendations engine highlights underperforming areas.
- Conversion funnel: Leads → Customers → VIP.
- Suggests KB additions when AI fails frequently on certain queries.

### 11. Reports (PDF Export)
- Generate branded PDF reports with company logo.
- Date range presets: Today / Yesterday / 7d / 30d / 90d / Custom.
- Multi-company profile switching.
- Includes summary, daily trend, top customers, full breakdown.

### 12. Quick Send
- Send to any WhatsApp number without saving as contact.
- Bulk mode supports 1000+ numbers.
- Image / file / emoji attachments.
- Sent history sidebar (last 30 sends).

### 13. Google Drive Backup
- One-click DB backup to user's own Google Drive.
- Optional daily auto-backup.
- Restore on any machine.
- Uses OAuth 2.0 PKCE (no client secret required).

### 14. Multi-Language UI
- English, Bahasa Melayu (default).
- Instant switching, no restart needed.
- Customer-facing AI replies adapt to customer's language (not UI language).

---

## Competitive Analysis

| Feature | SYNCERA | WATI | Respond.io | Twilio + Custom |
|---|---|---|---|---|
| Pricing model | One-time RM999 | RM250/mo per agent | RM330/mo+ | Pay per message |
| Data location | User's PC | WATI cloud (India) | Cloud | Twilio cloud |
| AI included | Yes (local + cloud fallback) | Add-on RM200/mo | Limited | DIY |
| Multi-agent | Single device | Yes | Yes | Yes |
| WhatsApp Business API | No (Web protocol) | Yes | Yes | Yes |
| Setup complexity | 5 minutes | 1-2 days | 1-2 days | 1-2 weeks |
| Offline operation | Yes | No | No | No |
| Bahasa Melayu UI | Yes | No | No | No |
| Code signing / Trust | Optional EV cert | N/A | N/A | N/A |

**SYNCERA's competitive moat:** Single-user, single-device privacy-first design with one-time pricing. Optimized for owner-operator businesses (1-5 staff) who reject monthly subscriptions and want full data control.

---

## Product Roadmap

### Q3 2026 — v1.1
- Multi-device sync (LAN-only)
- Voice note transcription (Whisper local)
- Custom report PDF templates

### Q4 2026 — v1.2
- Plugin marketplace (third-party KB extensions)
- iOS/Android companion app (read-only)
- Webhook integration (Zapier, n8n)

### Q1 2027 — v2.0
- Multi-WhatsApp account management
- Team mode (shared inbox, multi-seat license)
- Advanced AI fine-tuning UI

---

## Success Metrics

For end-users:
- **Reduce reply time** from 4 hours → 30 seconds (AI auto-reply)
- **Handle 5x more enquiries** per day without hiring staff
- **30%+ conversion uplift** from instant first response

For Darksea Network:
- 1,000 paid licenses by end of Year 1
- RM999,000 ARR target Year 1
- <2% refund rate
- 4.5+ star rating

---

## Contact

**Product Lead:** Nazrin Zainal
**Email:** contact@example.com
**Company:** Darksea Network Sdn Bhd
**Address:** Kuala Lumpur, Malaysia
