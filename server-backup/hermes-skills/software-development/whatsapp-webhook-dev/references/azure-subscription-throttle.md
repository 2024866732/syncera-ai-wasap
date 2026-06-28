# Azure Subscription Throttle — Incident Report (2026-06-27)

Documented during HAFJET WhatsApp Bot recovery when repeated App Service plan create/delete operations triggered subscription-level throttling.

## Error Details

```
HTTP Status: 429 Too Many Requests
Code: 429
ExtendedCode: 51025
Message: App Service Plan Create operation is throttled for subscription <sub-id>. Please contact support if issue persists.
```

### Full Response Body

```json
{
  "Code": "429",
  "Message": "App Service Plan Create operation is throttled for subscription <sub-id>. Please contact support if issue persists.",
  "Target": null,
  "Details": [
    {"Message": "App Service Plan Create operation is throttled for subscription <sub-id>. Please contact support if issue persists."},
    {"Code": "429"},
    {
      "ErrorEntity": {
        "ExtendedCode": "51025",
        "MessageTemplate": "App Service Plan {0} operation is throttled for subscription {1}. Please contact support if issue persists.",
        "Parameters": ["Create", "<sub-id>"],
        "Code": "429",
        "Message": "App Service Plan Create operation is throttled for subscription <sub-id>. Please contact support if issue persists."
      }
    }
  ]
}
```

### Response Headers

```
Retry-After: 5
x-ms-ratelimit-remaining-subscription-writes: 199
x-ms-ratelimit-remaining-subscription-global-writes: 2999
x-ms-failure-cause: service
```

## Timeline (2026-06-27)

| Time (UTC) | Operation | Result |
|------------|-----------|--------|
| ~12:30 | `az appservice plan create` (multiple) | ✅/❌ mixed |
| ~12:45 | `az appservice plan create` after delete | ❌ 429 throttled |
| ~13:02 | After 2-min backoff | ❌ Still 429 |
| ~13:13 | After 10-min wait | ❌ Still 429 |
| ~13:41 | After another wait | ❌ Still 429 |
| ~14:00+ | No further attempts | — |

**Total throttle duration: 30-60+ minutes** (did not test full recovery time)

## Root Cause Analysis

1. **Trigger:** Multiple `az appservice plan create` + `az webapp delete` + `az appservice plan delete` in rapid succession during deployment debugging
2. **Mechanism:** Azure enforces a **per-subscription rate limit** on plan create operations (separate from the global write quota)
3. **Misleading signals:**
   - `Retry-After: 5` suggests 5-second wait is sufficient — it is NOT
   - `x-ms-ratelimit-remaining-subscription-writes: 199` suggests quota is available — but the throttle is a **per-operation rate limit (51025)**, not quota exhaustion
   - Error persists 30+ minutes after last create attempt
4. **ExtendedCode 51025** = specific to App Service Plan operations (Create/Update/Delete)

## Prevention Rules

1. **NEVER create/delete App Service plans in a loop**
2. **If `az appservice plan create` returns 429/51025: STOP immediately** — do not retry for at least 30 minutes
3. **Reuse existing plans** — if a plan exists, use it; do not delete and recreate
4. **Before creating a new plan, verify existing plans:** `az appservice plan list -g <rg>`
5. **If you must delete a web app:** use `az webapp delete --keep-empty-plan` BUT verify the plan survives (Azure sometimes auto-deletes empty plans)
5a. **⚠️ `--keep-empty-plan` does NOT always work:** Azure may auto-delete the plan even with this flag when the web app is the last one on the plan. In our incident, the original B1 plan `hafjet-bot-plan` was auto-deleted despite `--keep-empty-plan`. **Always verify plan survival with `az appservice plan list -g <rg>` immediately after web app deletion.**
5b. **⚠️ Deleting the last web app = deleting the plan:** If you only have 1 web app on a plan, deleting the web app (even with `--keep-empty-plan`) will likely delete the plan too. Safer approach: create a dummy web app on the plan first, THEN delete the real one.
6. **Keep `x-ms-ratelimit-remaining-subscription-writes` visible** in debug logs — if 199 but still throttled, it's 51025 not quota

## Recovery Options

| Option | ETA | Notes |
|--------|-----|-------|
| Wait 30-60 min with zero operations | 30-60min | Usually resets |
| Azure Support ticket | 1-4h | Can request throttle lift |
| Switch to Oracle A1.Flex | 15-30min | See `references/oracle-cloud-deployment.md` |
| Switch to Heroku Eco | 15-30min | $5/mo, use student credits |

## Impact on HAFJET

- Original `hafjet-bot-plan` (B1) was **accidentally auto-deleted** when last web app was removed
- Could not recreate plan due to throttle
- WhatsApp bot was offline for 60+ minutes
- Now evaluating Oracle A1.Flex as fallback primary host
