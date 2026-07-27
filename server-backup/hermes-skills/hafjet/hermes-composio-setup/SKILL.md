---
name: hermes-composio-setup
description: "Install and configure Composio plugin for Hermes Agent — connect 1000+ apps (Gmail, GitHub, etc.) via OAuth. Pitfalls: avoid curl|bash, API key format, SDK venv path."
version: 1.0.0
author: HAFJET (M) SDN BHD
---

# Composio Plugin Setup for Hermes

## Overview

Composio connects Hermes to 1000+ SaaS apps (Gmail, GitHub, Slack, Notion, etc.)
via managed OAuth. This skill covers the **safe install method** using
`kamellperry/hermes-composio` plugin — avoids the unsafe `curl | bash` path.

## Prerequisites

- Hermes Agent installed and running
- Composio account (free tier) at `platform.composio.dev`
- API key from platform.composio.dev (format: `ck_...`)

---

## Installation

### 1. Clone the plugin

```bash
git clone https://github.com/kamellperry/hermes-composio /tmp/hermes-composio
```

### 2. Install to Hermes

```bash
# Symlink (fastest)
ln -sfn /tmp/hermes-composio ~/.hermes/plugins/composio

# Enable
hermes plugins enable composio
```

### 3. Install SDK in Hermes venv

The Hermes agent Python lives at `~/hermes-agent/venv/`. Install composio
there using `uv` (Hermes venv has no pip):

```bash
uv pip install --python ~/hermes-agent/venv/bin/python3 'composio>=0.18'
```

### 4. Set API key

Edit `~/.hermes/.env` (user must do this — agent cannot write there):

```
COMPOSIO_API_KEY=***
```

> Key comes from **platform.composio.dev** → Settings → API Keys.
> Format: `ck_...` (30-50 chars). NOT the `ak_...` format from other Composio dashboards.

### 5. Verify

```bash
hermes composio doctor
```

Expected output:
```
Composio doctor
  configured:  True
  sdk:         True
  message:     ... 200 OK (no error)
```

---

## Connecting Apps

```bash
hermes composio connect gmail
hermes composio connect github
hermes composio status
```

Open the OAuth URL printed, complete the flow, then re-run status.

---

## Available Tools

| Tool | Purpose |
|------|---------|
| `composio_status` | Auth + profile + connections |
| `composio_connect` | Start OAuth flow for an app |
| `composio_search` | Find tools by use case |
| `composio_execute` | Run a tool (confirm gate) |
| `composio_proxy` | Authenticated raw API proxy |

---

## Pitfalls

### ❌ DO NOT use `curl | bash`

The official docs suggest `curl -fsSL https://composio.dev/install | bash`.
This is BANNED by HAFJET SOP — use the plugin method above instead.

### ❌ Wrong API key format

- Composio has multiple dashboards: `dashboard.composio.dev`, `app.composio.dev`, `platform.composio.dev`
- The plugin needs a key from **platform.composio.dev** (format `ck_...`)
- Keys from other dashboards (`ak_...`) will get `401 Invalid API key format`

### ❌ Wrong venv path

- `composio` must be installed in `~/hermes-agent/venv/` — NOT system Python
- Hermes venv has **no pip** — use `uv pip install --python`
- Doctor will show `sdk: False` if installed in wrong env

### ❌ CLI incompatibility

- `composio` CLI (from `composio-core` 0.7.x) crashes on Click ≥8.4
- Don't use `composio init hermes` or `composio login` — use the plugin instead

---

## Troubleshooting

**"composio import failed: No module named 'composio'"**
→ SDK not in Hermes venv. Run step 3 again.

**"Invalid API key format" (401)**
→ Key is from wrong platform or wrong format. Get from `platform.composio.dev`.

**"Failed to create Composio session"**
→ API key valid but network/auth issue. Check `curl https://backend.composio.dev/health`.

**Plugin not showing tools**
→ May need Hermes restart (`/new`). Plugin loads on session start.

---

## Config (`~/.hermes/config.yaml`)

```yaml
composio:
  user_id_strategy: profile
  toolkits: [gmail, github]   # or ['*'] for all
  router:
    enabled: true
  policy:
    confirm_dangerous: true
```
