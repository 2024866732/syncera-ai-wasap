---
name: hafjet-composio
description: "Composio integration for Hermes — connect Gmail, GitHub, and 1000+ apps via OAuth. Uses kamellperry/hermes-composio plugin."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# HAFJET Composio Integration

## Overview

Composio bridge untuk Hermes — sambung **Gmail, GitHub**, dan 1000+ apps lain via OAuth.

Guna plugin: [kamellperry/hermes-composio](https://github.com/kamellperry/hermes-composio)

### Connected Apps

| App | Status |
|-----|--------|
| Gmail | ✅ ACTIVE |
| GitHub | ✅ ACTIVE |

---

## Install (Fresh Setup)

### 1. Clone Plugin

```bash
git clone https://github.com/kamellperry/hermes-composio /tmp/hermes-composio
ln -sfn /tmp/hermes-composio ~/.hermes/plugins/composio
hermes plugins enable composio
```

### 2. Install SDK

```bash
uv pip install --python ~/hermes-agent/venv/bin/python3 'composio>=0.18'
```

### 3. API Key

1. Daftar → https://app.composio.dev
2. Settings → API Keys → Generate
3. **Pastikan permission "sessions" = WRITE**
4. Tambah ke `~/.hermes/.env`:
   ```
   COMPOSIO_API_KEY=ak_...
   ```
5. Restart: `/new`

### 4. Connect Apps

```bash
hermes composio connect gmail
hermes composio connect github
# Buka redirect_url dalam browser → authorize
```

---

## Daily Usage

```bash
hermes composio doctor       # check status
hermes composio status       # detailed status + connections
hermes composio connect <app> # tambah app baru
```

### Tools Available

| Tool | Purpose |
|------|---------|
| `composio_status` | Auth + connections |
| `composio_search` | Cari tool slugs |
| `composio_execute` | Run tool (confirm gate) |
| `composio_proxy` | Raw API proxy |

---

## Troubleshooting

> 📖 **Full pitfall details:** `references/pitfalls.md` — real issues encountered during HAFJET setup (CLI compatibility, venv path, plugin symlink, API key permissions).

**"403 sessions permission"** — API key takde write access.
→ Dashboard → API Keys → edit → sessions: write

**"401 Invalid API key"** — Key salah format/expired.
→ Regenerate key dari dashboard

**"composio import failed"** — SDK tak install.
→ `uv pip install --python ~/hermes-agent/venv/bin/python3 'composio>=0.18'`

---

## Auto-Install (Hermes Chat)

Paste `https://composio.dev/hermes` dalam chat — Hermes auto-install.

> ⚠️ HAFJET SOP: Skip `curl | bash`, guna install manual di atas.

---

## Config (`~/.hermes/config.yaml`)

```yaml
composio:
  user_id_strategy: profile
  toolkits: [gmail, github]
  router:
    enabled: true
  policy:
    confirm_dangerous: true
    max_result_chars: 40000
  single_account: true
```
