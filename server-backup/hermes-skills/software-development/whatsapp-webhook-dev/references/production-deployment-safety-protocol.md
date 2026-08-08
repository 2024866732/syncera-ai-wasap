# Production Deployment Safety Protocol

## Mandatory Workflow (Tuan Hafizi requirement)

### Phase 1: Audit (NO changes)
1. Audit repository structure
2. Audit docker-compose.yml
3. Audit .env.example
4. Audit routes (webhook, /api/ai/chat)
5. Audit Supabase schema
6. Audit dashboard data sources
7. Audit WhatsApp Cloud API (official vs unofficial)
8. Present gap report

### Phase 2: Implementation (NO production changes)
1. Create all files locally
2. Run tests locally
3. Present list of changes with:
   - File path
   - Change description
   - Impact assessment
4. Get approval

### Phase 3: Deployment (WITH approval)
1. Upload files to VM
2. Apply database migration (if approved)
3. Rebuild container (if approved)
4. Restart container (if approved)
5. Verify health
6. Commit + push (if approved)

## Approval Gates

| Action | Requires Approval |
|--------|-------------------|
| Restart production container | ✅ YES |
| Change firewall/iptables | ✅ YES |
| Migrate database | ✅ YES |
| Push to GitHub | ✅ YES |
| Change Meta webhook | ✅ YES |
| Send real WhatsApp messages | ✅ YES |
| Create files in repository | ❌ NO (local only) |
| Run tests | ❌ NO |
| Read logs | ❌ NO |

## What NOT to Do

- ❌ Do NOT deploy and ask for approval after
- ❌ Do NOT restart container "to test"
- ❌ Do NOT push to GitHub without showing diff
- ❌ Do NOT migrate database without showing SQL
- ❌ Do NOT change production config without approval

## What TO Do

- ✅ DO present all changes before execution
- ✅ DO wait for explicit "APPROVED" before any production action
- ✅ DO show diff/summary of changes
- ✅ DO provide rollback scripts for migrations
- ✅ DO test locally before deploying
