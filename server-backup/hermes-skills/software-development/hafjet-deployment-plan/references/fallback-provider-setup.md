# Fallback Provider Setup

## Pattern: Primary + Fallback in Hermes

Hermes supports automatic failover from a primary provider to a fallback when the primary returns:
- `429` (rate limited)
- `529` (overloaded)
- `503` (service unavailable)
- Connection errors

## Config Structure

In `~/.hermes/config.yaml`:

```yaml
# Primary model (what Hermes tries first)
model:
  provider: openrouter
  base_url: https://openrouter.ai/api/v1
  default: openrouter/owl-alpha

# Fallback provider definition
providers:
  cerebras:
    base_url: https://api.cerebras.ai/v1
    api_mode: chat_completions
    key_env: CEREBRAS_API_KEY

# Fallback trigger config
fallback:
  provider: cerebras
  model: gpt-oss-120b
```

## Key Rules

1. **Always use `key_env`** — never inline API keys in config.yaml
2. **Set env var in `~/.bashrc`** for persistence across restarts
3. **Restart gateway** after changing config (must run from separate shell, not inside gateway process)
4. **Test fallback independently** before relying on it — verify the fallback provider works standalone

## Cerebras API Reference

| Item | Value |
|------|-------|
| Base URL | `https://api.cerebras.ai/v1` |
| SDK | `cerebras-cloud-sdk` |
| Install | `pip install cerebras-cloud-sdk` |
| Model | `gpt-oss-120b` |
| Auth | API key via `CEREBRAS_API_KEY` env var |
| SDK usage | `from cerebras.cloud.sdk import Cerebras; client = Cerebras(api_key=os.environ["CEREBRAS_API_KEY"])` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Inline `api_key` in config.yaml | Use `key_env: CEREBRAS_API_KEY` instead |
| Forgetting to restart gateway | Run `hermes gateway restart` from separate shell |
| Env var not in `.bashrc` | Add `export CEREBRAS_API_KEY=***` to `~/.bashrc` |
| `gh/hosts.yml` in backup | Remove from git history — triggers push protection |
| `fallback_providers` (old key) | Use `fallback.provider` + `fallback.model` (current schema) |

## Validation

```bash
# Test fallback provider independently
python3 -c "
import os
from cerebras.cloud.sdk import Cerebras
client = Cerebras(api_key=os.environ['CEREBRAS_API_KEY'])
r = client.chat.completions.create(
    messages=[{'role':'user','content':'hi'}],
    model='gpt-oss-120b',
    max_tokens=50
)
print(r.choices[0].message.content)
"
```
