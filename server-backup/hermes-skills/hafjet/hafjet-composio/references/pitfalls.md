# Composio Installation Pitfalls — HAFJET

> Real issues encountered during setup on HAFJET-Hermes-Server (2026-07-24).

## 1. Wrong CLI package

**Problem:** `pip install composio-core` (v0.7.21) installs the wrong CLI. `composio --help` crashes:
```
TypeError: EnumParam.get_metavar() got an unexpected keyword argument 'ctx'
```
This is a `click` compatibility issue — `composio-core==0.7.21` vs `click==8.4.2`.

**Fix:** Install the `composio` package (not `composio-core`) into the Hermes agent venv:
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

**Fix:** In the Composio dashboard → API Keys → edit key → set **sessions: write** (not read).

## 5. API key format

**Problem:** The `composio` SDK (0.18.0) rejects keys that are too short or from the wrong platform. Both `ak_...` and `ck_...` formats failed initially.

**Fix:** Generate from **app.composio.dev** (not platform.composio.dev). The key must be at least 24 characters. If still rejected, regenerate a fresh key.

## 6. Connection OAuth flow

**Expected:** User opens `redirect_url` in browser, authorizes, then runs `hermes composio status` to confirm.

**Reality:** Works as documented once the key has correct permissions.

## 7. `curl|bash` is BANNED

HAFJET SOP forbids `curl -fsSL https://composio.dev/install | bash`. Use manual install above.
