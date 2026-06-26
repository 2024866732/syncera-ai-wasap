# Security Audit Patterns for Webhook Services

## Key Scanning Checklist (task-specific, non-exhaustive)

When reviewing a webhook receiver (Meta WhatsApp Cloud API, Stripe, GitHub, etc.), check these categories:

### 1. Signature Verification Bypass

```bash
# Scan for: disabled verification when secret is empty
grep -n "not.*secret" webhook_handler.py
grep -n "not APP_SECRET\|not SECRET\|return True" webhook_handler.py
```

**Severity:** CRITICAL — anyone can forge webhook payloads if secret is not set in production.

### 2. Sync I/O in Async Handlers

```bash
# Scan for: blocking calls in async functions
grep -nE "open\(|json\.load\(|subprocess|time\.sleep" async_handler.py
```

**Severity:** MEDIUM — blocks event loop, causes timeouts under load.

### 3. Hardcoded Secrets

```bash
# Scan for: API keys, tokens, passwords in source
grep -iE "(api_key|secret|password|token)\s*=\s*['\"][^'\"]{6,}" .
```

**Severity:** CRITICAL — secrets in repo history forever.

### 4. Overly Broad Keyword Routing

```bash
# Scan for: single-word static triggers that match unrelated user messages
grep -nE "in msg_lower|in message" router.py
```

**Severity:** LOW — causes wrong responses but not data loss.

### 5. Debug/Cache Files in Repo

```bash
# Scan for: .env, __pycache__, .pyc, venv in repo
git ls-files | grep -E "(\.env|__pycache__|\.pyc|venv/|\.venv/)" 
```

**Severity:** MEDIUM — .env may expose production secrets.

### 6. Gunicorn/Server Working Directory

```bash
# Scan for: startup scripts missing cd before gunicorn
cat startup.txt  # should have cd /path/to/module first
```

**Severity:** LOW — fails to start if not fixed.

## Severity Classification

| Level | Action Required |
|-------|-----------------|
| CRITICAL | Must fix before deployment — security bypass, hardcoded secrets |
| MEDIUM | Should fix before scaling — performance, debug files in repo |
| LOW | Fix when convenient — minor logic errors, startup niceties |

## Relevant File: `references/whatsapp-webhook-security.md`
Zoom's official docs require `X-Hub-Signature-256` validation. Production
deployments should return 403 on bad signature AND when secret is unset.
