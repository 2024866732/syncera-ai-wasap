# Workflow Example — LAW299 NotebookLM → Revision Set

Goal: user (UiTM student) wanted an exam revision built EXCLUSIVELY from their
"Final LAW299" NotebookLM notebook. Server = headless Azure VM, 1 GB RAM + 4 GB swap.

## Environment setup (server)
```bash
cd ~ && python3 -m venv .venv-notebooklm
source .venv-notebooklm/bin/activate
pip install notebooklm-py          # NO [browser] extra — no Chromium needed server-side
export PATH="$HOME/.local/bin:$PATH"
notebooklm --version               # 0.7.3
```

## Auth (user's Windows PC)
```powershell
pip install notebooklm-py
notebooklm login                   # opens Chromium, sign in with syahrulhafizi101@gmail.com
```
User sent `storage_state.json` as a Telegram document. Saved to
`~/.notebooklm/profiles/default/storage_state.json`, chmod 600.
Test: `notebooklm list` → listed notebooks incl. "Final LAW299" (Shared).

## Discovery
```bash
notebooklm metadata -n 3b143ab9 --json
# → 23+ sources: mix of PDFs + 7 .m4a lecture audio recordings
```

## Content extraction (3 parallel grounded asks)
Wrote prompt files to /tmp, then:
```bash
notebooklm ask -n 3b143ab9 --prompt-file /tmp/ask_hp.txt         > hp_raw.txt
notebooklm ask -n 3b143ab9 --prompt-file /tmp/ask_agency.txt      > agency_raw.txt
notebooklm ask -n 3b143ab9 --prompt-file /tmp/ask_contract_cases.txt > contract_cases_raw.txt
```

Key finding: the ask bot said many "classic" cases the user named were
NOT in their sources (Jones v Padavatton, May & Butcher, Derry v Peek,
R v Williams, Williams v Bayley, Freeman & Lockyer, United Asian Bank v Lim Hoy).
The lecturer's actual case list was different (Karuppan Chetty, Kesarmal,
Allcard v Skinner, Inche Noriah, Watteau v Fenwick, Tan Khee Chuan, Nash v Inman).
→ Excluded the missing cases from the revision to avoid teaching the wrong material.

Also: the source taught HP repossession under **s16** (not s38/38A), and
"no duty to explain" for banks, s5(1) 21-day copy delivery, s4E Geran delivery,
s4C mandatory contents, Second Schedule Pt1/Pt2. Used the source's version.

## Artifacts generated
- `generate report --format study-guide --prompt-file ... --wait` → download report
- `generate quiz --prompt-file ... --wait` → download quiz (JSON, 10 Q)
- `generate mind-map` (no --wait) → download mind-map (JSON, name/children tree)

## Deliverable note
On iPhone Telegram, `.md` files don't preview and MEDIA:path sends fail.
So we pasted the content inline as Telegram-formatted text instead of sending files.
Quiz JSON was pretty-printed to readable Q&A with correct answers marked.
Mind-map JSON (name/children) was walked and pasted as a hierarchical bullet list.
