# Database Migration with Existing Tables

## Problem

When running migration scripts on databases that already have tables, you may encounter:

1. Column already exists errors
2. Table already exists with different columns
3. Unique constraint conflicts

## Solution Pattern

Use `DO $$ BEGIN IF NOT EXISTS ...` blocks for safe, idempotent migrations:

```sql
BEGIN;

-- Add column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'whatsapp_message_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN whatsapp_message_id VARCHAR(100);
    END IF;
END $$;

-- Add unique constraint (handle existing constraint)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uk_messages_whatsapp_id'
    ) THEN
        ALTER TABLE messages ADD CONSTRAINT uk_messages_whatsapp_id UNIQUE (whatsapp_message_id);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add index (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_messages_customer_phone ON messages(customer_phone);

-- Create table if not exists
CREATE TABLE IF NOT EXISTS daily_message_counter (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    outbound_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
```

## Rollback Pattern

```sql
BEGIN;

-- Drop indexes
DROP INDEX IF EXISTS idx_messages_customer_phone;

-- Drop unique constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS uk_messages_whatsapp_id;

-- Drop table (careful - data loss!)
DROP TABLE IF EXISTS daily_message_counter;

-- NOTE: Columns NOT dropped to preserve data
-- ALTER TABLE messages DROP COLUMN IF EXISTS whatsapp_message_id;  -- COMMENTED OUT

COMMIT;
```

## Key Rules

1. **Always use `IF NOT EXISTS`** for columns and tables
2. **Use `DO $$ BEGIN IF NOT EXISTS ...`** blocks for DDL
3. **Wrap in `BEGIN`/`COMMIT`** for atomic migrations
4. **Add rollback script** for every migration
5. **Don't drop columns** in rollback - preserve data
6. **Test on non-production first** if possible
7. **Use unique constraint names** to avoid conflicts
8. **Log migration steps** for debugging

## Example: Oracle Cloud HAFJET Bot

```bash
# Run migration
ssh -i /tmp/hafjet-oracle-key ubuntu@100.124.99.52 \
  "cd ~/HAFJET-AI-WhatsApp-Bot && sudo docker exec -i hafjet-ai-db psql -U hafjet -d hafjet_ai < db/migration_v2.sql"

# Verify migration
ssh -i /tmp/hafjet-oracle-key ubuntu@100.124.99.52 \
  "sudo docker exec hafjet-ai-db psql -U hafjet -d hafjet_ai -c '\d messages'"
```
