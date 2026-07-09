# Pre-deploy Approval Workflow

**Always show the exact diff before applying changes to production.** This was explicitly established by the user during the SPX regex patch deployment (Jul 2026).

## The 6-Step Workflow

1. **Show diff** — present `before/after` code snippet for every changed function or regex pattern. Use markdown diff blocks or side-by-side comparison.

2. **Explain what changed** — 1-2 sentence justification per change. State the symptom, root cause, and fix in plain language.

3. **Wait for explicit approval** — do NOT deploy until user says "approved", "proceed", "go ahead", or an equivalent affirmative. Phrases like "ok", "yes", "deploy", "continue" count. Silence, emoji, or "I see" do NOT count.

4. **Deploy** — using Kudu VFS PUT (not zip). Upload files one at a time, verify each upload via HTTP status.

5. **Restart + verify** — restart the app, wait for health endpoint to return 200, confirm version marker matches the deployed code.

6. **Report** — one-page summary with:
   - Status (OK / error)
   - Output of verification tests
   - Confirmation that the app is up
   - Clear next steps for the user (what to do in the dashboard)

## Never Skip Step 3

Even if the fix is one line, even if the user seems eager, even if the session is running long — showing the diff and waiting for approval is a hard requirement. The user has repeatedly and explicitly corrected this pattern. Deploying without prior diff+approval is a trust violation.

## Why This Matters

- Production Azure app serves real WhatsApp customers
- DB (`bot_data.db`) is ephemeral — lost on zip redeploy
- Only Kudu VFS PUT preserves the DB while updating files
- The user needs visibility into what code is being pushed
