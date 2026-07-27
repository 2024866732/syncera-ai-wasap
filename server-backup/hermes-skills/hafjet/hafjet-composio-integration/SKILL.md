---
name: hafjet-composio-integration
description: "Sambung Hermes ke 1000+ apps (Gmail, GitHub, Slack, Sheets...) melalui Composio MCP — guna community plugin kamellperry/hermes-composio."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# Composio Integration for Hermes

## Overview

Integrasi **Composio** — bridge yang bagi Hermes akses OAuth ke 1000+ apps (Gmail, GitHub, Slack, Google Sheets, Notion, dsb.) melalui MCP.

Guna **community plugin** `kamellperry/hermes-composio` — lebih ringan & stabil dari official CLI.

⚠️ **Official CLI `composio-core` BROKEN** kat Python 3.10 (Click 8.4.2 conflict — `get_metavar() got unexpected keyword argument 'ctx'`). Guna plugin instead.

---

## Install

### 1. Clone & Link Plugin

```bash
git clone https://github.com/kamellperry/hermes-composio /tmp/hermes-composio
ln -sfn /tmp/hermes-composio ~/.hermes/plugins/composio
hermes plugins enable composio
```

### 2. API Key (Tuan kena edit sendiri)

Dapatkan API key dari [platform.composio.dev](https://platform.composio.dev) (bukan dashboard.composio.dev).

**Tambah ke `~/.hermes/.env`** — AGENT TAK BOLEH TULIS:

```
COMPOSIO_API_KEY=ck_...
```

> Format: `ck_...` (platform key). Kalau dari dashboard lain mungkin `ak_...`.

### 3. Restart & Verify

```bash
/new                          # restart Hermes session
hermes composio doctor        # verify setup
```

---

## Connect Apps

```bash
hermes composio login-help    # tunjuk arahan login
hermes composio connect gmail
hermes composio connect github
hermes composio status        # verify connections
```

Setiap `composio connect` akan print OAuth URL — buka browser, complete flow.

---

## Tools (auto-loaded selepas install)

| Tool | Fungsi |
|------|--------|
| `composio_status` | Auth status + user_id + connections |
| `composio_connections` | Senarai toolkit tersambung |
| `composio_connect` | Start OAuth flow |
| `composio_search` | Cari tool slugs |
| `composio_execute` | Run tool (dengan confirm gate) |
| `composio_proxy` | Authenticated raw API proxy |

---

## Skills (plugin-bundled)

Load via `skill_view("composio:...")`:

- `composio:composio-gmail`
- `composio:composio-gmail-inbox-triage`
- `composio:composio-github`
- `composio:composio-github-pr-triage`

---

## Troubleshooting

### CLI Official BROKEN
```
TypeError: EnumParam.get_metavar() got an unexpected keyword argument 'ctx'
```
→ **Jangan guna `composio init`** — guna plugin je.

### API Key Format
- Platform key: `ck_...` (dari platform.composio.dev)
- Dashboard key: `ak_...` (dari dashboard lain)
- Kalau key tak jalan, cuba generate dari platform.composio.dev

### Plugin tak detect
```bash
ls -la ~/.hermes/plugins/composio   # confirm symlink exists
hermes plugins list                  # check enabled
```

---

## Security Notes

- OAuth tokens disimpan di Composio cloud — trust boundary
- **API key JANGAN paste dalam chat** — edit sendiri kat `~/.hermes/.env`
- **Rotate key** lepas setiap session kalau terdedah
