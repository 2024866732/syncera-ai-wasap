# Composio Installation Pitfalls — HAFJET

> Real issues encountered during setup on HAFJET-Hermes-Server (2026-07-24). Updated 2026-07-27.

## 1. Wrong CLI package

**Problem:** `pip install composio-core` (v0.7.21) installs the wrong CLI. `composio --help` crashes:
```
TypeError: EnumParam.get_metavar() got an unexpected keyword argument 'ctx'
```
This is a `click` compatibility issue — `composio-core==0.7.21` vs `click==8.4.2`. Affects Python 3.10; Hermes venv uses Python 3.11 which avoids this.

**Fix B (system-level):** Reinstall via `uv tool install --force`:
```bash
uv tool install composio-core --force
```
The `--force` overwrites the broken system-wide install and resolves Click dependencies cleanly.

```bash
uv pip install --python ~/hermes-agent/venv/bin/python3 'composio>=0.18'
```

## 2. Hermes venv path

**Reality:** The Hermes agent's virtual environment is at `~/hermes-agent/venv/` — NOT `~/.hermes/hermes-agent/venv/`. The venv has no `pip` binary.

**Fix:** Always use `uv pip install --python ~/hermes-agent/venv/bin/python3 ...`

## 3. Plugin symlink vs `hermes plugins install`

**Problem:** `hermes plugins install /tmp/hermes-composio` fails — it treats the path as a GitHub URL and tries to git-clone it.

**Fix:** Use direct symlink:
```bash
ln -sfn /tmp/hermes-composio ~/.hermes/plugins/composio
hermes plugins enable composio
```

## 4. API key: "sessions" must be WRITE

**Problem:** After providing a valid API key, `hermes composio doctor` returns:
```
403 — route requires "sessions" write access, but the key has read access
```

**Fix:** In the Composio dashboard → API Keys → edit key → set **sessions: write** (not read). Generate from **app.composio.dev**.

## 5. API key format confusion

**Problem:** The `composio` SDK (0.18.0) rejects keys. Both `ak_...` and `ck_...` prefixes appear depending on generation location.

**Fix:** Generate from **app.composio.dev** → API Keys. Ensure "sessions: write". Both prefixes are valid — don't assume one format is wrong. If a key is rejected with "Invalid API key format", regenerate from app.composio.dev.

## 6. Connection OAuth flow

**Expected:** User opens `redirect_url` in browser, authorizes, then runs `hermes composio status` to confirm.

**Reality:** Works once key has correct permissions. Connections survive key rotation — no need to re-auth after key change.

## 7. ⛔ API Key Exposure in Chat

**CRITICAL:** API keys pasted in chat are instantly compromised. HAFJET setup saw 3+ exposures.

**Consequences:** Key must be rotated, all configs updated, risk of unauthorized usage.

**Safe handling:**
```bash
# Tuan edits .env directly — agent NEVER writes secrets
nano ~/.hermes/.env
# Add: COMPOSIO_API_KEY=***
```

**After exposure:**
1. Dashboard → API Keys → **Revoke** old key
2. Generate new key with "sessions: write"
3. `nano ~/.hermes/.env` → update
4. `hermes composio doctor` → verify
5. Connections intact — no re-auth needed

## 8. `curl|bash` is BANNED

HAFJET SOP forbids `curl -fsSL https://composio.dev/install | bash`. Use manual install above. Applies to ALL `curl URL | sh` patterns.
