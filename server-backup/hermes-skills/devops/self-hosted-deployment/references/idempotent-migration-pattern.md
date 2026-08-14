# Idempotent Database Migration Pattern

## Overview
Safe, repeatable database migrations that can be run multiple times without errors or data loss.

## Key Principles

1. **IF NOT EXISTS** — Don't fail if table/column/index already exists
2. **DO $$ BEGIN ... END $$ blocks** — Handle errors gracefully
3. **ADD COLUMN only** — Never DROP COLUMN in forward migrations
4. **Rollback script** — Always provide a rollback option

## Pattern: Add Column IF NOT EXISTS

```sql
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'whatsapp_message_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN whatsapp_message_id VARCHAR(100);
    END IF;
END $$;
```

## Pattern: Add Unique Constraint

```sql
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
```

## Pattern: Create Index IF NOT EXISTS

```sql
CREATE INDEX IF NOT EXISTS idx_messages_customer_phone ON messages(customer_phone);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
```

## Pattern: Create Table IF NOT EXISTS

```sql
CREATE TABLE IF NOT EXISTS daily_message_counter (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    outbound_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_counter_date ON daily_message_counter(date);
```

## Pattern: Copy Data Between Columns

```sql
-- Copy data from old column to new column
UPDATE messages SET customer_phone = from_number WHERE customer_phone IS NULL;
```

## Pattern: Handle Existing Tables with Different Schema

```sql
-- Check if column exists before adding
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'outbound_message_log' AND column_name = 'customer_phone'
    ) THEN
        ALTER TABLE outbound_message_log ADD COLUMN customer_phone VARCHAR(50);
    END IF;
END $$;
```

## Rollback Script Pattern

```sql
-- Drop indexes
DROP INDEX IF EXISTS idx_messages_customer_phone;
DROP INDEX IF EXISTS idx_messages_status;

-- Drop unique constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS uk_messages_whatsapp_id;

-- Drop new tables (if created)
DROP TABLE IF EXISTS daily_message_counter;
DROP TABLE IF EXISTS outbound_message_log;

-- NOTE: Columns NOT dropped to preserve data
-- ALTER TABLE messages DROP COLUMN IF EXISTS whatsapp_message_id;  -- COMMENTED OUT
```

## Complete Migration Example

```sql
BEGIN;

-- 1. Add columns to messages table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'whatsapp_message_id'
    ) THEN
        ALTER TABLE messages ADD COLUMN whatsapp_message_id VARCHAR(100);
    END IF;
END $$;

-- 2. Add unique constraint
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

-- 3. Add indexes
CREATE INDEX IF NOT EXISTS idx_messages_customer_phone ON messages(customer_phone);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- 4. Create new table
CREATE TABLE IF NOT EXISTS daily_message_counter (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    outbound_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Copy data
UPDATE messages SET customer_phone = from_number WHERE customer_phone IS NULL;

COMMIT;
```

## Key Rules

1. **Always wrap in BEGIN/COMMIT** — Atomic migration
2. **Use IF NOT EXISTS** — Safe to run multiple times
3. **Use DO $$ BEGIN ... END $$** — Handle errors gracefully
4. **Never DROP COLUMN in forward migration** — Data loss risk
5. **Always provide rollback script** — Recovery option
6. **Test on staging first** — Verify before production

## Related
- See `references/local-python-service-deploy.md` for Docker Compose PostgreSQL schema init issues
