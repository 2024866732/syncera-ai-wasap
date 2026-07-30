# LiteLLM Config Management — HAFJET

> Patterns learned from fixing the dual-config placeholder issue on PC Office (2026-07-24).

## The Dual-Config Problem

When updating the config from original (5 models, real key) to Claude-mapped version (10 models, placeholder key), the updated file was `cp`'d over the original — destroying the real API key.

**Result:** 5 old entries had real keys, 5 new entries had `YOUR_OPENCODE_GO_KEY` placeholders.

## Detection

```bash
# Count placeholders
grep -c 'YOUR_OPENCODE_GO_KEY' ~/litellm-config.yaml

# Count real keys
grep -c 'api_key.*sk-' ~/litellm-config.yaml

# Show which lines have issues
grep -n 'YOUR_OPENCODE_GO_KEY' ~/litellm-config.yaml
```

## Fix: Extract from old entry, inject everywhere

The config has two sets of entries — old ones with real keys, new ones with placeholders. The real key is identical across all entries (same OpenCode Go key). 

**Extract from old entry → inject into all placeholders:**

```bash
REAL=$(grep 'api_key: "sk-' ~/litellm-config.yaml | head -1 | grep -o 'sk-[^"]*')
sed -i "s|YOUR_OPENCODE_GO_KEY|$REAL|g" ~/litellm-config.yaml
```

**Verify:**
```bash
grep -c 'YOUR_OPENCODE_GO_KEY' ~/litellm-config.yaml
# Should output: 0
```

### Quoting Pitfall

The sed command uses `|` as delimiter (not `/`) because keys never contain `|`. Using `/` would break if the key happened to contain slashes. Single-quote the grep patterns to avoid shell escaping issues with `"` characters.

### Over SSH

When running via SSH from Hermes, use single-quote wrapping for the whole command to avoid nested quoting hell:

```bash
ssh hafizi145@100.121.94.41 'REAL=$(grep ...); sed -i "s|PLACEHOLDER|$REAL|g" ...'
```

## Systemd Service Detail

Service file: `~/.config/systemd/user/litellm-proxy.service`

```ini
[Unit]
Description=LiteLLM Proxy for OpenCode Go
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/uv run --directory %h/litellm-env litellm --config %h/litellm-config.yaml --port 4000
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
```

**Critical:** `--directory %h/litellm-env` ensures `uv run` uses the venv where litellm is installed. Without it, `uv run litellm` may pick up a different environment or fail.

## Safe Update Workflow

Never overwrite the config file with a template. Instead:

1. **Always backup first:** `cp ~/litellm-config.yaml ~/litellm-config.yaml.bak`
2. **Patch in place** with sed, never `cp` a template over the live config
3. **Verify** before restart: `grep YOUR_OPENCODE_GO_KEY ~/litellm-config.yaml` should return nothing
4. **Restart & test:** `systemctl --user restart litellm-proxy && curl -s localhost:4000/models`

## Why sed from same file works

The config already contains the real key in old entries. Extracting from the same file avoids exposing the key in chat or needing to re-enter it. The `grep -o 'sk-[^"]*'` extracts just the key value, which `sed` then substitutes into all placeholder positions.
