# WhatsApp Production Database Schema

## Overview

PostgreSQL schema for HAFJET WhatsApp AI Bot production deployment.

## Tables

### messages
```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    whatsapp_message_id VARCHAR(100) UNIQUE,  -- For duplicate protection
    from_number VARCHAR(50) NOT NULL,
    to_number VARCHAR(50),
    customer_phone VARCHAR(50),               -- Denormalized for queries
    content TEXT,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    message_type VARCHAR(50) DEFAULT 'text',
    status VARCHAR(50) DEFAULT 'received',
    provider_status VARCHAR(100),
    response_time_ms INTEGER,
    latency_ms INTEGER,
    ai_model VARCHAR(50),
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_customer_phone ON messages(customer_phone);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE UNIQUE INDEX idx_messages_whatsapp_id ON messages(whatsapp_message_id);
```

### ai_requests
```sql
CREATE TABLE ai_requests (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER,
    customer_phone VARCHAR(50),
    route_type VARCHAR(50) DEFAULT 'llm',     -- llm, supabase, human_handoff
    request_text TEXT,
    response_text TEXT,
    model VARCHAR(100),
    prompt_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    confidence NUMERIC(3,2),
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_requests_customer_phone ON ai_requests(customer_phone);
CREATE INDEX idx_ai_requests_route_type ON ai_requests(route_type);
CREATE INDEX idx_ai_requests_status ON ai_requests(status);
CREATE INDEX idx_ai_requests_created ON ai_requests(created_at);
```

### webhook_events
```sql
CREATE TABLE webhook_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100),
    event_type VARCHAR(50) DEFAULT 'message',
    payload_hash VARCHAR(64),
    processing_status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_processing_status ON webhook_events(processing_status);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);
```

### customers
```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255),
    language_preference VARCHAR(10) DEFAULT 'ms',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
```

### conversations
```sql
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    customer_phone VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    context_summary TEXT,
    last_message_at TIMESTAMPTZ,
    needs_human BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_phone ON conversations(customer_phone);
CREATE INDEX idx_conversations_status ON conversations(status);
```

### repairs
```sql
CREATE TABLE repairs (
    id SERIAL PRIMARY KEY,
    repair_number VARCHAR(50) UNIQUE,
    customer_phone VARCHAR(50) NOT NULL,
    device VARCHAR(255),
    issue TEXT,
    status VARCHAR(50) DEFAULT 'received',
    price_estimate DECIMAL(10,2),
    final_cost DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repairs_phone ON repairs(customer_phone);
CREATE INDEX idx_repairs_number ON repairs(repair_number);
CREATE INDEX idx_repairs_status ON repairs(status);
```

### products
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    price DECIMAL(10,2),
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(active);
```

### outbound_message_log
```sql
CREATE TABLE outbound_message_log (
    id SERIAL PRIMARY KEY,
    customer_phone VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    template_name VARCHAR(100),
    category VARCHAR(50) DEFAULT 'service',
    status VARCHAR(50) DEFAULT 'sent',
    provider_response TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outbound_log_customer_phone ON outbound_message_log(customer_phone);
CREATE INDEX idx_outbound_log_created ON outbound_message_log(created_at);
CREATE INDEX idx_outbound_log_category ON outbound_message_log(category);
```

### daily_message_counter
```sql
CREATE TABLE daily_message_counter (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    outbound_count INTEGER DEFAULT 0,
    service_count INTEGER DEFAULT 0,
    utility_count INTEGER DEFAULT 0,
    marketing_count INTEGER DEFAULT 0,
    authentication_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_counter_date ON daily_message_counter(date);
```

## Key Design Decisions

1. **whatsapp_message_id UNIQUE**: Prevents duplicate message processing
2. **customer_phone denormalized**: Fast queries without JOIN
3. **route_type in ai_requests**: Track whether response came from LLM, Supabase, or human handoff
4. **daily_message_counter**: Cost control without querying full message table
5. **TIMESTAMPTZ**: Timezone-aware timestamps for global deployments
