# Deploy ZIP Hygiene — HAFJET bot build_zip.py pitfall

`build_zip.py` walks the **disk**, not git. Any untracked junk in the project
dir enters the deploy ZIP silently.

## Must-exclude patterns (add to exclude_patterns before any build)
- `*.tar.gz`, `*backup*` — catches `db-backup-*.tar.gz`, `azure-settings-backup-*.json` (possible secrets)
- `AGENTS.md`, `DEPLOYMENT*.md`, `oracle-*`, `*.user.js`
- temp/debug scripts: `check_*`, `upload_*`, `debug_*`, `verify_*`, `monitor_*`, `fix_*`
- `business_info.txt` (loose untracked copy), `intent_rules.json`, `media_map.json`

## Post-build verification
```bash
python3 -c "import zipfile;z=zipfile.ZipFile('deploy-hafjet-bot.zip');n=z.namelist();print('files:',len(n));import sys;[print('LEAK:',x) for x in n if any(p in x for p in ['.tar.gz','backup','user.js','AGENTS.md','DEPLOYMENT','oracle-'])]"
```
Must print zero LEAK lines.

## Gotcha
`system_prompt.txt` + `business_info.txt` are gitignored — `git add` is rejected;
use `git add -f` to commit prompt changes.
