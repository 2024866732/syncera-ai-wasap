# WS Advance AI Messenger - Free

AI-assisted WhatsApp business messenger and desktop CRM built with React, Electron, Baileys, and local-first storage.

## Highlights

- WhatsApp-style inbox with contact, message, and conversation management
- AI auto-reply and outreach support through `electron/bridge/ai.js`
- Broadcast, quick send, templates, reminders, orders, reports, and analytics
- Local SQLite-style database layer through SQL.js
- Electron desktop build setup with Vite and Tailwind CSS
- Documentation for product overview, architecture, setup, privacy, API, and troubleshooting

## Privacy Note

This public repository excludes private customer data, chat exports, phone lists, WhatsApp auth sessions, local databases, build outputs, installers, logs, spreadsheets, and personal import scripts.

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Project Structure

```text
src/                 React UI
electron/            Electron main process and bridge modules
electron/bridge/ai.js AI response and outreach logic
docs/                Product and technical documentation
public/              App icons and static assets
```

## Owner

Created by Nazrin Zainal - MYS.
