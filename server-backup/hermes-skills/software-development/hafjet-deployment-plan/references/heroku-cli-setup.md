# Heroku CLI Setup — Headless Server (No Browser)

**Date:** 2026-06-27
**Platform:** Ubuntu (Hermes Server)

## Installation

```bash
curl https://cli-assets.heroku.com/install-ubuntu.sh | sh
```

Requires sudo. Installs via apt. Version verified: heroku/11.7.1.

## Authentication — API Key Only (No Browser Login)

**Problem:** `heroku login` opens a browser — doesn't work on headless servers.

**Solution:** Use `HEROKU_API_KEY` env var.

### Getting the Token

1. Go to https://dashboard.heroku.com/account
2. Scroll to **API Key** section
3. Click **Reveal**
4. Copy the key (starts with `HRKU-...`)

This is the **account's main API key** — it has full access to the entire Heroku account. Keep it secure.

### Storing the Token

```bash
# Add to ~/.bashrc for persistence
cat >> ~/.bashrc << 'EOF'
export HRKU-***"
EOF
source ~/.bashrc
```

**Important:** Heroku API keys contain special chars (`_`, `-`). Use heredoc (`<< 'EOF'`) to avoid shell escaping issues.

### Verify Access

```bash
export HEROKU_API_KEY="paste-here"
heroku auth:whoami
heroku apps:list
```

### Token Type

This is the **account API key**, NOT a scoped OAuth token. It can:
- Create/modify/delete apps
- Deploy code
- Access all config vars
- Scale dynos

If you need restricted access for automation, create a separate authorization via:
```
heroku authorizations:create --description="Hermes Server"
```

But for this use case (emergency fallback deploy), the account key is appropriate.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `heroku login` on headless server | Use `HEROKU_API_KEY` |
| Shell quoting breaks key | Use heredoc, not echo with quotes |
| Token in git/repo | Never commit; only in `.bashrc` or Azure app settings |

## Current State

- CLI: heroku/11.7.1 at `/usr/bin/heroku`
- Auth: via `HEROKU_API_KEY` in `~/.bashrc`
- Account: hafizi145@gmail.com
- Existing apps: hafjetwasap (eu), hafjetwasapbot
- Access level: read-only (no apps created or modified)
