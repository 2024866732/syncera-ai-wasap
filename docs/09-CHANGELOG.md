# 09 · Changelog & Release Notes

All notable changes to SYNCERA are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-16

🎉 **Initial public release.**

### Added — Core Features
- **WhatsApp integration** via Baileys (@whiskeysockets/baileys 6.7.9)
  - QR code login with persistent session
  - Full message support: text, image, video, audio, document, sticker
  - Typing indicators, read receipts, presence updates
  - History sync from phone (up to 1000+ messages)
  - Anti-ban send delay controls

- **AI Auto-Reply Engine**
  - Three backends: Ollama (local), LM Studio (local), Pollinations.ai (cloud free)
  - Smart fallback with Malay↔English synonym expansion
  - KB-based scoring matcher (title 3× weight, basic-entry boost)
  - Per-conversation persona override
  - Configurable reply delay (0.5-10 seconds)
  - First-message disclaimer system

- **Knowledge Base**
  - Unlimited entries with category organization
  - Per-entry enable/disable
  - Live search and filter
  - Categories: Products, Services, Pricing, FAQ, Policies, Contact Info, Custom

- **Inbox & Conversations**
  - WhatsApp-style three-pane UI
  - Filter tabs: All / AI / Pinned
  - Pin, archive, label, tag, note any conversation
  - Reset AI Memory (delete only AI-generated messages)
  - Clear Chat (local-only message deletion)
  - Collapse sidebar (Ctrl+B) — smooth slide animation

- **Pipeline (Sales CRM)**
  - 5-stage Kanban: New Lead, In Support, Customer, VIP, Closed
  - Drag-and-drop reassignment
  - Per-stage filtering

- **Broadcast**
  - Send to unlimited recipients (tested with 1000+)
  - Filter by label
  - Anti-spam delay controls
  - Track sent / failed / pending

- **Templates**
  - Pre-built variable templates: `{nama}`, `{telefon}`, `{tarikh}`, etc.
  - Category-organized
  - Mid-chat insertion via shortcut
  - Usage tracking

- **Orders**
  - 5-status workflow: new / processing / shipped / completed / cancelled
  - Revenue summary (paid + pending)
  - Linked to source conversation

- **Reminders**
  - One-shot or recurring (daily / weekly / monthly)
  - Desktop notifications via Windows API

- **Analytics**
  - KPI dashboard with 7-day trend chart
  - AI Performance metrics
  - Customer segmentation
  - Order status breakdown
  - Top 10 most active customers

- **AI Insights**
  - Smart recommendations based on activity
  - Conversion funnel visualization
  - Customer distribution by stage

- **Reports (PDF Export)**
  - Date range presets: Today / Yesterday / 7d / 30d / 90d / Custom
  - Multi-company profile support
  - Branded PDF with logo
  - Includes summary, charts, top customers, daily trend

- **Quick Send**
  - Single number mode (no contact save needed)
  - Bulk mode (1000+ recipients)
  - Image / file / emoji attachments
  - History sidebar (last 30 sends)

- **Google Drive Backup**
  - OAuth 2.0 PKCE (no client secret required)
  - Manual & daily auto-backup
  - One-click restore on any machine
  - User-controlled Google Cloud OAuth Client ID

- **Multi-Language UI**
  - English (en)
  - Bahasa Melayu (ms) — default
  - Instant switching, no restart
  - 200+ translation keys covering all UI surfaces

- **Theme System**
  - Dark / Light / System (follows OS)
  - CSS variables architecture
  - Live theme switching

- **Settings**
  - Profile (business name, currency, AI brain)
  - AI configuration (backend, model, delay, persona)
  - Drive Backup
  - Language picker
  - Appearance (theme, font size)
  - Notifications (desktop, sound, preview)
  - Security & disconnect
  - About with credits

### Added — Branding & UX
- SYNCERA logo + custom splash screen (10s minimum display)
- Custom title bar with live clock badge
- iOS-style toggle switches in Settings
- Credits panel in About: developer (Nazrin Zainal) + company (Darksea Network Sdn Bhd)
- 11 unique tab colors in left navigation (each ~30° hue apart)

### Added — Build & Distribution
- Professional NSIS Windows installer
- License agreement display during install
- Custom installer icon
- Per-user installation (no admin required)
- Desktop + Start Menu shortcut auto-creation
- Proper uninstaller with data preservation option
- ASAR packaging with asarUnpack for native modules (sql.js wasm, baileys)
- Maximum compression (~72 MB installer)

### Technical
- Electron 31.7.7
- React 18.3.1 + TypeScript 5.5.2
- Vite 5.3.1 (build tooling)
- Zustand 4.5.4 (state management)
- TailwindCSS 3.4.4 (styling)
- sql.js 1.12.0 (pure WASM SQLite — no native compilation)
- Lucide React 0.395.0 (icons)

### Known Limitations
- Windows-only (Mac/Linux planned for future)
- Single-user-per-install (multi-user planned for v2.0)
- No code signing in v1.0 (Windows SmartScreen warning may appear)
- No online activation (DRM planned for v1.5)
- Group chat AI replies OFF by default (spam prevention)

---

## Upcoming — [1.1.0] — Q3 2026

### Planned
- Voice note transcription (Whisper local model)
- Multi-device LAN sync (read-only viewer mode)
- Custom report PDF templates
- AI temperature / creativity slider
- Auto-translate incoming messages (preview)
- Improved KB import from CSV/Excel

---

## Upcoming — [1.2.0] — Q4 2026

### Planned
- Plugin marketplace (third-party KB packs, industry templates)
- iOS / Android companion app (read-only viewer)
- Webhook integration (Zapier, n8n, Make)
- Bulk template editor
- Calendar integration for Reminders (Google Calendar, Outlook)

---

## Upcoming — [1.5.0] — Q1 2027

### Planned
- Online license activation system
- License key management UI
- Volume / enterprise licensing
- Update auto-checker
- Crash reporter (opt-in)

---

## Upcoming — [2.0.0] — Mid 2027

### Planned
- **Team Mode** — shared inbox across multiple staff
- Multi-WhatsApp account management
- Role-based permissions (admin / agent / viewer)
- Real-time collaboration on conversations
- Advanced analytics with custom dashboards
- AI fine-tuning UI (upload your own training data)
- Mac & Linux native builds
- Mobile companion apps (full-feature)

---

## Versioning Policy

- **MAJOR.MINOR.PATCH**
- **MAJOR** — Breaking changes, paid upgrade may apply
- **MINOR** — New features, free update for existing license holders
- **PATCH** — Bug fixes, security patches, free for all

---

## Support Lifecycle

| Version | Status | Security Updates Until |
|---|---|---|
| 1.0.x | Current | 2028-05-16 |
| 1.1.x | Planned | 2028-09 |

End-of-life versions stop receiving security patches. Users on EOL versions are encouraged to upgrade.
