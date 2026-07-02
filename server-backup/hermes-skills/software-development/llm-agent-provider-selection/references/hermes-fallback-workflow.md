# Hermes Fallback Configuration Workflow

## Primary + Fallback Setup

```bash
# 1. Set primary model + provider
hermes config set model.default deepseek/deepseek-v4-flash
hermes config set model.provider openrouter
hermes config set model.base_url https://openrouter.ai/api/v1

# 2. Verify
hermes config show | grep -E "Model:|base_url|fallback"

# 3. Add fallbacks in preferred order
hermes fallback add   # pick provider/model via interactive picker
hermes fallback add   # repeat for secondary

# 4. Verify chain
hermes fallback list
```

## Pitfalls

- **Do NOT hand-edit fallback entries in config.yaml.** Use `hermes fallback add`.
- **base_url must match provider.** OpenRouter models on Nous endpoint will fail.
- **Quota / billing depletion:** When provider returns "access depleted — top up", switch primary to another provider instead of looping retries.
- **Validation check:** `hermes config check` reports version + key status; optional keys are OK to be unset.
