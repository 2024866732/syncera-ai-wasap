# WhatsApp Cost Control Module

## Overview

Control outbound WhatsApp messages to stay within Meta's free tier and prevent abuse.

## Configuration Variables

```env
MAX_OUTBOUND_MESSAGES_PER_DAY=100
OUTBOUND_WARNING_THRESHOLD=80
ENABLE_MARKETING_MESSAGES=false
ENABLE_BROADCAST=false
```

## Implementation Pattern

```python
class CostControl:
    def __init__(self):
        self.max_outbound_per_day = settings.max_outbound_messages_per_day
        self.warning_threshold = settings.outbound_warning_threshold
        self.marketing_enabled = settings.enable_marketing_messages
        self.broadcast_enabled = settings.enable_broadcast
    
    def check_outbound_limit(self) -> dict:
        """Check if outbound limit is reached"""
        daily_count = self.get_daily_count()
        current = daily_count["outbound_count"]
        
        if current >= self.max_outbound_per_day:
            return {"allowed": False, "reason": "daily_limit_reached"}
        
        if current >= self.warning_threshold:
            return {"allowed": True, "warning": True, "reason": "approaching_limit"}
        
        return {"allowed": True}
    
    def check_category_allowed(self, category: str) -> bool:
        """Check if message category is allowed"""
        if category == "marketing" and not self.marketing_enabled:
            return False
        if category == "broadcast" and not self.broadcast_enabled:
            return False
        return True
    
    def update_daily_counter(self, category: str = "service") -> bool:
        """Update daily counter after successful outbound"""
        # UPSERT into daily_message_counter table
        pass
```

## Database Schema

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
```

## Message Categories

| Category | Description | Default |
|----------|-------------|---------|
| service | Customer service replies | ✅ Allowed |
| utility | Transactional (repair status, booking) | ✅ Allowed |
| authentication | OTP, verification | ✅ Allowed |
| marketing | Promotions, announcements | ❌ Disabled |
| broadcast | Bulk messages | ❌ Disabled |

## Usage in Send Function

```python
async def send_text_message(to: str, text: str, category: str = "service"):
    # Check cost control
    if not cost_control.check_category_allowed(category):
        return {"status": "error", "error_code": 403, "error_type": "cost_control"}
    
    limit_check = cost_control.check_outbound_limit()
    if not limit_check["allowed"]:
        return {"status": "error", "error_code": 429, "error_type": "cost_control"}
    
    # Send message...
    
    # Update counter on success
    cost_control.update_daily_counter(category)
    
    # Log outbound
    cost_control.log_outbound_message(to, category, "sent")
```

## Dashboard Integration

```python
@app.get("/api/stats")
async def stats():
    cost_stats = cost_control.get_stats()
    return {
        "daily_outbound_count": cost_stats["daily_outbound_count"],
        "max_outbound_per_day": cost_stats["max_outbound_per_day"],
        "limit_reached": cost_stats["limit_reached"],
        # ... other stats
    }
```
