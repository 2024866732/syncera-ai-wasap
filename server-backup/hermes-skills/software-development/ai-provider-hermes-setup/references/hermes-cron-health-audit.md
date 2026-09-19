# Hermes cron health audit — failure classes & repair

Use when: a scheduled job "didn't arrive", after ANY global model/provider config change,
or when asked to verify a recurring delivery (digest, sales report, reminder) is actually alive.

## 1. `cronjob action='list'` is NOT a health check

It reports `state: scheduled`, `enabled: true` for jobs whose every fire has failed for weeks.
`last_status` also lags. The truth is only in:

| Source | Path | Fields |
|---|---|---|
| Job definitions | `~/.hermes/cron/jobs.json` | `jobs` is a **list**; the id key is **`id`** (not `job_id`); per job: `model`, `provider`, `last_status`, `last_error`, `failure_streak`, `deliver`, `origin`, `context_from`, `no_agent`, `script` |
| Execution attempts | `~/.hermes/cron/executions.db` | table `executions`: `id, job_id, source, process_id, pid, process_started_at, status, claimed_at, started_at, finished_at, error` |
| Rendered output | `~/.hermes/cron/output/<job_id>/` | timestamped reports; a **stale newest file** is the tell that a job stopped running |

Quick truth pass:

```bash
/usr/bin/python3 ~/.hermes/skills/software-development/ai-provider-hermes-setup/scripts/cron_health_audit.py
```

`context_from: ["self"]` is how **continuity** is stored (the `cronjob` tool calls it `continuity`).

## 2. Failure classes seen in production (Sept 2026)

| Class | Signature in `last_error` / `executions.error` | Root cause | Fix |
|---|---|---|---|
| **Invalid model id** | `HTTP 400: Model "deepseek-v4-flash" is not supported on this endpoint.` | Job `model: null` → inherited a stale/bare `model.default`. Both the interactive session AND the cron inherit it, but only cron dies loudly on every fire. | Pin a live id: `--model deepseek/deepseek-v4.1-flash --provider commandcode` |
| **`[drift_skip]` — SILENT skip** | `RuntimeError: [drift_skip] Skipped to prevent unintended spend: global inference config drifted since this job was created (provider 'xai-oauth' -> 'commandcode'; model 'grok-4.5' -> 'deepseek-v4-flash'), and this job is unpinned. No inference call was made.` | Job is **unpinned** and the global inference config moved since the job was created. The guard refuses to spend on an unintended model. | Pin explicitly — same command. This is the correct fix; do **not** try to disable the guard. |
| **Upstream model retired** | `HTTP 400: Error from provider (Console): Upstream request failed: Model is unavailable.` | Job pinned to a provider/model combo that no longer exists (e.g. `opencode-zen` + `deepseek-v4-flash-free` free tier). | Re-pin to a live id/provider. |
| **Script / infra failure** | `Script exited with code 255` + `ssh: connect to host <tailscale-ip>: Connection timed out` | `no_agent` job hitting an offline host. Not a model or config problem. | Nothing to re-pin — report the offline dependency to the owner. |

**The `[drift_skip]` class is the dangerous one.** It is protective (no unintended spend) but
emits **nothing** to the user — no delivery, no alert, no `last_status` change the list view
surfaces. Jobs can sit dead for months. `:silent` in `[drift_skip:silent]` means the job was
also flagged to suppress noise.

## 3. Repair recipe

```bash
# the cronjob TOOL has no model/provider parameter — the CLI is the only way
hermes cron edit <job_id> --model "deepseek/deepseek-v4.1-flash" --provider commandcode
# same CLI also does: --schedule --prompt --name --deliver --skill/--add-skill --clear-skills
#                    --script --no-agent/--agent --continuity/--no-continuity --reasoning-effort
```

Verify it landed (key is `id`, not `job_id`):

```bash
/usr/bin/python3 ~/.hermes/skills/software-development/ai-provider-hermes-setup/scripts/cron_health_audit.py
```

Then prove ONE job end-to-end with `cronjob action='run'` on the least destructive job —
its real output lands in the user's chat, which is the only acceptable proof.
`failure_streak` and `last_status` clear on the next **actual run**, not on the edit.

## 4. Audit-wide rule

When one job breaks from inherited model config, **assume every unpinned agent job is broken too
and sweep them all in the same pass** — the same drift hits all of them. In one Sept 2026 sweep,
fixing the 4 reported jobs exposed 5 more dead ones (monthly P&L, BSN payment reminder, low-stock
alert, gaji tracker, pickup reminder), including business-critical monthly finance jobs.

Leading indicator to scan for first: `no_agent: false` **and** `model: null` → drift_skip risk.

## 5. Adjacent pitfalls

- **Stale delivery thread — ROOT CAUSE CONFIRMED (2026-09-19).** `deliver: telegram` can carry a dead
  topic id, logging `configured thread_id 29352 for telegram:1485374469 was not found; delivered
  without thread_id`. Source of that id: **`~/.hermes/.env` → `TELEGRAM_HOME_CHANNEL_THREAD_ID`**,
  pointing at a topic that no longer exists. Degraded-but-delivered, so it reads cosmetic — it is
  not: the topic is dead and the config is lying.
  - Diagnose correctly: **`sendChatAction` is LENIENT** — it returns `"ok":true` for a bogus thread
    id, so it cannot tell a live topic from a dead one. Use `editForumTopic` instead:
    live topic → `Bad Request: TOPIC_NOT_MODIFIED`, dead/bogus → `Bad Request: TOPIC_ID_INVALID`.
  - Fix: comment the var out (delivery falls back to the main DM, warning gone) or set a VALID topic
    id. `~/.hermes/.env` is a **protected credential file** — the file/patch tools refuse it; edit via
    terminal after `cp -a ~/.hermes/.env ~/.hermes/.env.bak-<date>`, and restart Hermes to reload.
  - `deliver: origin` (with an explicit `origin.chat_id`) is more predictable than `deliver: telegram`.
- **Cron job pointing at a `/tmp` script.** `/tmp` gets wiped and the job dies with no visible cause.
  Keep job scripts under `~/.hermes/scripts/` or the owning skill's `scripts/`.
  Audit: `grep -o '/tmp/[^ "]*\.py' ~/.hermes/cron/jobs.json`.
- **Script crashes: `NameError: name 'TOKEN' is not defined`.** Present-but-broken looks healthy from
  outside. Real case: `gaji_profit_calc.py` had `TOKEN = load_token()` as a *local* inside `main()`
  while `api_get()` read the *global* → the monthly job had been silently dead since 20 Jul 2026.
  Fix = `global TOKEN` in `main()` + a module-level `TOKEN = ""` default. Always smoke-test the
  script, not just the job config.
- **Never test-fire a finance/report job outside its window.** Loyverse returns only the last 31 days,
  so re-running a "previous month" job on the 19th silently writes a PARTIAL month into the CSV.
  Prove the script functionally instead: import the module in a wrapper, repoint the path globals
  (`CSV_PATH` / `PNL_CSV` / `DASHBOARD_PATH`) at a `/tmp` dir, then call `main()` and confirm the
  production file's mtime/size is untouched.
- **Idle-host guard for SSH-based scripts.** A remote job that cannot reach its host exits non-zero
  every tick and buries real failures under a 300+ streak. Add a fast reachability pre-check that
  exits 0 silently: `timeout 6 bash -c "exec 3<>/dev/tcp/HOST/22" 2>/dev/null || { echo "[skip] host
  unreachable"; exit 0; }` — the job then auto-resumes the moment the host returns.
- **Duplicate jobs.** Before creating a cron job for a recurring need, LIST existing jobs first.
  The daily AI digest already existed under a differently-named job; editing it preserved its
  origin, history and continuity setting, and avoided two jobs firing the same content.
  Related: an old job's stored prompt can be years-of-convention stale (it still commanded
  `web_extract`, which is documented-broken on this host) — rewrite the prompt while you are in there.
- **Blind spot, not a bug.** Because skips are silent, propose a scheduled health job
  (`cronjob` action='create', `no_agent=True`, script = the audit script, empty stdout = silent).
