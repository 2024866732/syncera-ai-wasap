# CommandCode endpoint — model IDs + cron inheritance

Source of truth: `curl -s https://api.commandcode.ai/provider/v1/models -H "Authorization: Bearer $COMMANDCODE_API_KEY"`
Enumerated 2026-09-17 → **69 model IDs**. Config: `provider: commandcode`, `base_url: https://api.commandcode.ai/provider/v1`, `api_mode: chat_completions`.

## The failure that started this note

```
RuntimeError: HTTP 400: Model "deepseek-v4-flash" is not supported on this endpoint.
```

`config.yaml → model.default` held the **bare** alias `deepseek-v4-flash`. The endpoint only accepts the **fully qualified** id `deepseek/deepseek-v4-flash` (and `deepseek/deepseek-v4.1-flash` for the newer build). The session model had already been switched to `deepseek/deepseek-v4.1-flash` by hand, so interactive use looked healthy while cron was dead.

## ID shapes seen on this endpoint

- **Prefixed vendor ids:** `deepseek/…`, `google/…`, `Qwen/…`, `MiniMaxAI/…`, `moonshotai/…`, `meta/…`, `z-ai/…`(flash), `zai-org/…`(GLM), `xai/…`, `nvidia/…`, `stepfun/…`, `tencent/…`, `xiaomi/…`, `thinkingmachines/…`, `inclusionai/…`, `meituan/…`, `poolside/…`, `sakana/…`
- **Bare ids:** `claude-*`, `gpt-*` (e.g. `claude-sonnet-5`, `claude-opus-5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`)
- **`:free` suffix** exists for a few (`inclusionai/ling-3.0-flash-sante:free`, `meituan/LongCat-2.0:free`, `poolside/laguna-s-2.1-free`)

**Rule:** never infer one shape from another. `deepseek-v4-flash` (bare) ✗ but `deepseek/deepseek-v4-flash` ✓; `glm-5.2` (bare, the config alias for `complex`) ✗ but `zai-org/GLM-5.2` ✓. Always verify against `/models` before pinning anything — including on cron jobs that used to work.

## Alias map in config.yaml (verify before trusting)

```yaml
providers:
  commandcode:
    models:
      easy: mimo-v2.5          # not a live id → verify
      simple: deepseek-v4-flash  # ✗ rejected 2026-09-17
      complex: glm-5.2          # ✗ bare → use zai-org/GLM-5.2
      critical: gpt-5.6-sol     # ✓ matches live id
      free: ox-alpha            # not a live id → verify
```

These aliases are resolved somewhere in the model-router path and are **not** themselves validated against the endpoint. Anything that ends up as `model.default` must be an id present in `/models`.

## Cron inheritance blast radius (Sept 2026)

Five jobs carried `model: null` → all inherited the broken default → all failed on every fire:

| job_id | name | result |
|---|---|---|
| ad7baa160933 | Laporan Teknologi & AI Harian | failure_streak **24** |
| 9408be4cd593 | Daily Sales Report | error |
| 315e1bdcd7fc | HAFJET Server Daily Backup | error |
| 06496e813cd5 | azure-credit-daily-check | error |
| 9a0b34159a84 | daily-budget-check | error |

`cronjob action=list` showed `state: scheduled`, `enabled: true` for every one of them — the list view does not surface the failure reason. Only `executions.db.error` had the truth.

## Repair recipe

```bash
hermes cron edit <job_id> --model "deepseek/deepseek-v4.1-flash" --provider commandcode
# confirm it landed (key is 'id', NOT 'job_id'):
python3 -c "import json;d=json.load(open('/home/hafizi145/.hermes/cron/jobs.json'));print([(j['id'],j['model'],j['provider']) for j in d['jobs']])"
```

Then prove it end-to-end with one real fire (`cronjob action='run'`) — the output lands in the user's chat. Reset expectation: `failure_streak` and `last_status` only clear on the next actual run, not on the edit.
