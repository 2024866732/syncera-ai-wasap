# Safe Orchestrator API Testing Pattern (HAFJET multi-node)

**Rule (Tuan explicit):** When testing the VPS orchestrator worker APIs (POST /register-node, GET /jobs, POST /jobs/{id}/result, health), **never** use `curl | python3`.

Always:
1. `curl -s "URL" -o /tmp/hafjet_*.json`
2. Separate python invocation that reads the file with `pathlib.Path` + `json.loads`

This was required and demonstrated throughout the 2026-07-31 orchestrator setup for:
- Polling pending jobs for light-worker (hafjet-pc-office) and gpu-worker (desktop-rhdusf3-1)
- Extracting job_id for result submission
- Verifying job cleared after submit (0 pending)
- Capturing health responses before updating worker registry status

**Example for light job poll + verify:**
```bash
curl -s "http://127.0.0.1:8080/jobs?node_id=hafjet-pc-office&tag=light&status=pending" -o /tmp/hafjet_jobs.json
python3 -c '
import json
from pathlib import Path
data = json.loads(Path("/tmp/hafjet_jobs.json").read_text())
print(len(data), "pending")
if data:
    print("Latest:", data[-1]["job_id"])
'
```

Same for heavy jobs, result POST verification, and health_monitor output capture.

This pattern aligns with the broader `curl -s URL -o /tmp/file.json` then separate parse rule and avoids tirith blocks on pipe-to-interpreter.

Cross-reference: main hafjet-command-safety SKILL.md banned patterns section.