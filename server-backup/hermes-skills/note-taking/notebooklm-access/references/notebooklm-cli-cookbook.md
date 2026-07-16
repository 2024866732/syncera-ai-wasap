# notebooklm-py CLI Cookbook (verified on HAFJET-Hermes-Server)

## Verified facts (v0.7.3)
- Auth lives at `~/.notebooklm/profiles/default/storage_state.json`. No `--notebook` global flag — use `-n <ID>` everywhere. `-n` accepts a partial prefix (e.g. `3b143ab9` matches `3b143ab9-10cb-...`).
- CLI installs to `~/.local/bin/notebooklm` under a plain venv; add `export PATH="$HOME/.local/bin:$PATH"` or call it by full path.

## Working end-to-end flow (LAW299 revision, 2026-07-16)
```bash
# 1. Auth already supplied (storage_state.json copied in). Verify:
source /home/hafizi145/.venv-notebooklm/bin/activate
export PATH="$HOME/.local/bin:$PATH"
notebooklm list                                          # prints notebook table, exit 0

# 2. See what sources are in the target notebook:
notebooklm metadata -n 3b143ab9 --json                   # <- watch "Unknown source type code 0" warning, harmless

# 3. Generate a study guide from ALL sources (targeted prompt via file):
#    write prompt to /tmp/p.txt, then:
notebooklm generate report --format study-guide -n 3b143ab9 --prompt-file /tmp/p.txt --wait --json
#    -> returns {task_id, status:"completed"}  (NO positional arg + --prompt-file together!)

# 4. Download the generated report as markdown:
notebooklm download report /home/hafizi145/law299/study_guide.md -n 3b143ab9 --force

# 5. Targeted extractions (one topic per call to limit context bleed):
notebooklm ask -n 3b143ab9 --prompt-file /tmp/ask_hp.txt > hp_raw.txt 2>&1
notebooklm ask -n 3b143ab9 --prompt-file /tmp/ask_agency.txt > agency_raw.txt 2>&1
notebooklm ask -n 3b143ab9 --prompt-file /tmp/ask_contract.txt > contract_raw.txt 2>&1
```

## Errors hit & fixes
| Error | Cause | Fix |
|---|---|---|
| `No such option '--notebook'` | `-n` is the flag, not `--notebook` | use `-n <id>` |
| `Cannot use both the description argument and --prompt-file` | `generate report` takes one or the other | drop the positional arg, keep `--prompt-file` |
| `No such option '--format'` on `download report` | download infers format from artifact type | just `download report <path>` |
| `Playwright not installed` / `Executable doesn't exist ... chromium-1228` | ran `notebooklm login` without `[browser]` extra | on the BROWSER machine run `pip install "notebooklm-py[browser]" && playwright install chromium` |
| `CommandNotFoundException` on a Windows path like `C:\Users\NAMA_ANDA\...` | user pasted a placeholder; real user dir is in their `PS C:\Users\User>` prompt | tell them to substitute their real username |

## Grounding lesson (LAW299)
The user asked for cases like `Jones v Padavatton`, `Derry v Peek`, `Freeman & Lockyer`, `United Asian Bank v Lim Hoy`. NotebookLM's `ask` returned "Not found in the sources" for ALL of them — the lecturer's syllabus used different (often Malaysian) cases: `Balfour v Balfour`, `Merritt v Merritt`, `Karuppan Chetty v Suah Thian`, `Tan Khee Chuan v Teh Boon Keat`, `Nash v Inman`, `Watteau v Fenwick`, `Allcard v Skinner`, `Inche Noriah`. Also the user's Hire Purchase repossession was **s 16** (not s 38/38A), and "duty to explain" did NOT exist in their materials. ALWAYS build deliverables from what NotebookLM actually returns, and explicitly tell the user which of their requested items are absent from their own notebook.
