# Daily AI-news job (the morning digest)

Job `ad7baa160933` — **"Berita AI Harian (Pagi)"**, set up 2026-09-17.

| Field | Value |
|---|---|
| Schedule | `0 0 * * *` UTC = **08:00 MYT** daily (server runs UTC — always subtract 8h from the MYT time the user asks for) |
| Skills | `[tech-news-digest]` |
| Continuity | ON — persisted as `context_from: ["self"]` |
| Deliver | `origin` (back to the asking chat) |
| Model | `deepseek/deepseek-v4.1-flash` + `provider: commandcode` (must be pinned — see below) |

## Daily variant ≠ weekly digest

| | Weekly digest | Daily AI job |
|---|---|---|
| Window | 7 days | **24–48 hours** |
| Length | full 4 sections | **max ~450 words** |
| Scope | tech + AI | **AI only** — models/benchmarks, agents, open-weight releases, AI infra/GPU, policy/regulation, AI business |
| Sections | 🔥 Paling Panas (5-7) / 🤖 Open-Source & Model Baru (3-4) / ⭐ GitHub Naik Bukit (table) / 📌 Apa Kito Patut Tahu (2-4, kait ke stack HAFJET) / 📎 Sumber | same, trimmed |

- Continuity ON means each morning sees its own previous output, so it does not re-report yesterday's stories. `[SILENT]` only when genuinely nothing new.
- The prompt must name **deep-search + curl/`html-extract.py`** explicitly. The stock cron task template that ships with this job literally said "STEP 4: use web_extract to get details from 3-5 URLs" — that line is obsolete on this host and only wastes turns (see `references/cron-safe-extraction.md`).

## The bug this job was born from: cron jobs inherit `model.default`

The job was created with `model: null`, so it ran on `config.yaml → model.default`, which held the **bare** alias `deepseek-v4-flash` — an id the CommandCode endpoint rejects. Result: every LLM-driven cron job failed identically at fire time while still showing `state: scheduled, enabled: true`:

```
RuntimeError: HTTP 400: Model "deepseek-v4-flash" is not supported on this endpoint.
```

This digest job alone had **failure_streak: 24** (dead since 23 Aug, noticed 17 Sept). Four other jobs failed the same way.

**Diagnose — the real error lives in the executions DB, not the job list:**

```bash
python3 -c "
import sqlite3
c=sqlite3.connect('/home/hafizi145/.hermes/cron/executions.db')
for r in c.execute('select status,error,finished_at from executions where job_id=? order by rowid desc limit 5',('ad7baa160933',)): print(r)
"
```

`~/.hermes/cron/jobs.json` is `{jobs: [...], updated_at}` and its **key is `id`**, not `job_id` — filtering on `job_id` silently returns nothing.

**Repair:**

```bash
hermes cron edit <job_id> --model "deepseek/deepseek-v4.1-flash" --provider commandcode
```

The agent-facing `cronjob` tool has **no** model/provider parameter, so use it for the prompt/schedule/skills/continuity and the CLI for the model. Then fire one real run (`cronjob action='run'`) — that delivers to the user's chat and is the end-to-end proof. `last_status`/`failure_streak` only clear on the next actual run, not on the edit.

Full provider detail: skill `ai-provider-hermes-setup` → `references/commandcode-endpoint-models.md`.
