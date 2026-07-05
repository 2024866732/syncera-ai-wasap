# Pre-Deploy Release Readiness Check

> **Source:** Sprint v2.2.0 close (Jul 2026) — Analytics Dashboard MVP release prep
> **Pattern:** After commit + before deploy approval — 5-point checklist validated by Tuan Hafizi

## The 5-Point Checklist

After all TUGAS are implemented, release notes written, and clean ZIP built — but BEFORE asking "approve deploy?" — run this final readiness check.

### 1. Branch Tracking

Local branch must exist and match remote exactly:

```bash
git branch -vv                                # Shows local branch tracking
git ls-remote --heads origin release/v2.2.0   # Shows remote branch hash
git rev-parse HEAD                            # Shows local HEAD hash
```

**Fail if:** Remote doesn't exist, or hashes don't match. Push the branch first.

### 2. Working Tree Clean (Tracked Files)

Only untracked files (test scripts, backups, logs, node_modules) should remain:

```bash
# Count tracked changes pending — must be 0
pending=$(git status --short | grep '^[^?]' | wc -l)
echo "Pending tracked changes: $pending"
```

**Fail if:** `pending > 0` — tracked files still have uncommitted modifications or deletions.

**Known allowable untracked files:** `test_*.py`, `.bak*`, `logs/`, `.backup/`, `dashboard/node_modules/`, `bot_data.db` (never tracked), `.env` (never tracked).

### 3. ZIP Matches Git HEAD

ZIP must be built from the current working tree state (which matches the commit):

```bash
python3 -c "
import zipfile, hashlib

key_files = ['webhook_listener.py', 'db_logger.py', 'start.sh', 'requirements.txt',
             'dashboard/src/components/Analytics.jsx', 'dashboard/src/api/api.js',
             'dashboard/dist/index.html']
all_match = True

with zipfile.ZipFile('/tmp/deploy.zip', 'r') as zf:
    zipped_names = set(zf.namelist())
    for kf in key_files:
        with open(kf, 'rb') as f:
            wh = hashlib.sha256(f.read()).hexdigest()[:16]
        if kf in zipped_names:
            zh = hashlib.sha256(zf.read(kf)).hexdigest()[:16]
            match = '✅' if wh == zh else '❌'
            print(f'  {match} {kf}: work={wh} zip={zh}')
            if wh != zh:
                all_match = False
        else:
            print(f'  ❌ {kf}: MISSING FROM ZIP!')
            all_match = False

print(f'\\n{\"✅ ALL MATCH\" if all_match else \"❌ REBUILD ZIP — files differ\"}')
"
```

**Fail if:** Any key file hash differs, or key file is missing from ZIP.

### 4. Startup Method Confirmed

Verify the startup script is version-controlled and uses absolute paths:

```bash
cat start.sh
# Expected:
#   #!/bin/bash
#   cd /home/site/wwwroot
#   /home/site/wwwroot/antenv/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker \
#     webhook_listener:app --bind 0.0.0.0:8000 --timeout 120
```

**Pass if:**
- Uses absolute path to `antenv/bin/gunicorn` (not `venv/`)
- No local path references (`/home/hafizi145/...`)
- No shell chaining (`&&`) without `bash -c` wrapper
- File is version-controlled in the release branch

### 5. Forbidden Files in Branch

No secrets, DB files, or build artifacts should be in the release branch:

```bash
echo "=== Forbidden Files Check ==="
for pattern in 'bot_data.db' '.env' 'node_modules' '__pycache__' '*.zip' '*.db'; do
  count=$(git ls-tree -r HEAD --name-only | grep -c "$pattern" 2>/dev/null || echo 0)
  status="✅ 0" 
  [ "$count" -gt 0 ] && status="❌ $count"
  echo "  $status — $pattern"
done
```

**Fail if:** Any forbidden file is tracked in git.

**Allowable edge cases:**
- `.env.example` — a template file showing required env vars (no real secrets)
- Dashboard `dist/` files — these are intentionally tracked for deployment

## Output Format (Approved by Tuan Hafizi)

Present the 5-point results in this exact format:

```
## ✅ Final Verification — Release vX.Y.Z

### 1️⃣ Branch Tracking
| Local | Remote | Hash Match |
|-------|--------|------------|
| release/vX.Y.Z | origin/release/vX.Y.Z | ✅ abc123 |

### 2️⃣ Working Tree
- Tracked files: ✅ Clean
- Untracked only scrap/test (excluded from git)

### 3️⃣ ZIP vs Git
| File | Hash Match |
|------|-----------|
| webhook_listener.py | ✅ abc123 |

### 4️⃣ Startup Standard
start.sh — absolute path to antenv/bin/gunicorn, version-controlled

### 5️⃣ Forbidden Files
| File | In Branch? |
|------|-----------|
| bot_data.db | ✅ 0 |
| .env | ✅ 0 |
```

After presenting, **wait** for user to say:
- `✅ APPROVED — RELEASE BRANCH READY` → proceed to deploy
- Any other response → stop and revise

## Common Pitfalls

| Pitfall | Detection | Fix |
|---------|-----------|-----|
| ZIP built before final source change | SHA256 hash mismatch for changed files | Rebuild ZIP after all commits |
| `bot_data.db` accidentally staged | `git ls-tree` shows it tracked | `git rm --cached bot_data.db` |
| Working tree dirty with test_*.py | `git status --short` shows `M test_*.py` | These are untracked — OK. If tracked, `git restore` |
| Remote branch not pushed yet | `git ls-remote` returns empty | `git push origin release/v2.2.0` |
| Remote branch hash differs from local | Another commit was pushed since you last pushed | `git push origin release/v2.2.0` (fast-forward) |
