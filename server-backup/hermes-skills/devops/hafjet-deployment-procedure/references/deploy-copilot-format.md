# Deploy Copilot Communication Format

When Tuan Hafizi switches to operational/deploy mode, these rules apply:

## Reply Format (STRICT)
- **Max 3 lines** per reply
- Format: `STEP: <id>  ACTION: <short>  RESULT: <pass/fail>`
- No code blocks, no explanations, no long text
- If a step needs approval: add `NEED: YES`
- If a dangerous step: add `⚠️` or `💀` marker
- On 🔴 CONFIRM steps: pause and ask briefly

## Autonomous Execution
- Run commands yourself in terminal, don't ask user to paste
- Check PASS/FAIL automatically after each step
- On FAIL: propose minimum corrective action (1 line)
- On pass: immediately proceed to next step
- NEVER paste long code blocks or full diffs in chat during copilot mode

## User Frustration Signals
- "Jangan paste code panjang dalam chat"
- "Jawab maksimum 3 baris"
- "Balas pendek, operasi-style"
- "Saya busy"

When any of these appear, switch to copilot format immediately.
