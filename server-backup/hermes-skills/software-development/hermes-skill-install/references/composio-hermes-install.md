# Composio Plugin for Hermes — Install Reference

This is a worked example of the plugin-install pitfalls documented in the parent
skill. Recorded 2026-07-27.

## Architecture

```
Hermes Agent → composio plugin (kamellperry/hermes-composio)
             → Composio SDK (composio>=0.18)
             → Composio Connect API (platform.composio.dev)
             → 1000+ apps (Gmail, GitHub, Slack, etc.)
```

## Install Steps (correct order)

### 1. Clone the plugin repo

```bash
git clone --depth 1 https://github.com/kamellperry/hermes-composio /tmp/hermes-composio
```

### 2. Symlink into Hermes plugins

> ⚠️ `hermes plugins install /tmp/hermes-composio` WILL FAIL — it treats the
> local path as a GitHub URL and tries to clone `https://github.com/tmp/hermes-composio.git`.

Use a symlink instead:

```bash
ln -sfn /tmp/hermes-composio ~/.hermes/plugins/composio
hermes plugins enable composio
```

### 3. Install SDK dependency into Hermes venv

> ⚠️ The Hermes agent venv at `~/hermes-agent/venv/` has **no pip**. 
> System `pip install composio` installs to the wrong Python.

```bash
uv pip install --python ~/hermes-agent/venv/bin/python3 'composio>=0.18'
```

### 4. Set API key

> ⚠️ Keys from `dashboard.composio.dev` (format `ak_...`) are **rejected** by the
> SDK. Use `platform.composio.dev` → API Keys → format `ck_...`.

Add to `~/.hermes/.env` (Tuan edits manually per SOP):
```
COMPOSIO_API_KEY=ck_xxxxxxxxxxxxxxxx
```

### 5. Verify

```bash
hermes composio doctor
```

Should show:
```
sdk:         True
configured:  True
```

### 6. Connect apps

```bash
hermes composio connect gmail
hermes composio connect github
```

Open the printed OAuth URL, complete the flow.

## Key Format Trap

| Source | Key Prefix | Works with SDK? |
|--------|-----------|-----------------|
| `dashboard.composio.dev` | `ak_...` | ❌ "Invalid API key format" |
| `platform.composio.dev` | `ck_...` | ✅ |

The doctor will show `sdk: True` but `connections: (none / unavailable)` with a
401 error when the wrong key format is used.

## Tools Provided

After setup, Hermes gains:
- `composio_status` — check auth + connections
- `composio_search` — find tools by use case
- `composio_execute` — run a tool (confirm gate for side effects)
- `composio_connect` — start OAuth flow for new apps

## Cleanup

```bash
hermes plugins disable composio
rm ~/.hermes/plugins/composio
# Key remains in ~/.hermes/.env — remove manually
```
