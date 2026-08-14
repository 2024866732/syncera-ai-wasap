# Cost Control Pattern for WhatsApp Bots

## Overview
Outbound message limiting and daily counter management for WhatsApp bots to control costs.

## Architecture
```
Send Message Request
    ↓
Check Category Allowed
    ├── marketing → Check ENABLE_MARKETING_MESSAGES
    ├── broadcast → Check ENABLE_BROADCAST
    └── service/utility → Allowed
    ↓
Check Daily Limit
    ├── limit reached → Block
    ├── warning threshold → Alert
    └── OK → Proceed
    ↓
Send Message
    ↓
Update Daily Counter
    ↓
Log Outbound Message
```

## Configuration

```env
# Cost Controls
MAX_OUTBOUND_MESSAGES_PER_DAY=100
OUTBOUND_WARNING_THRESHOLD=80
ENABLE_MARKETING_MESSAGES=false
ENABLE_BROADCAST=false
```

## Implementation

### Check Category Allowed
```python
def check_category_allowed(self, category: str) -> bool:
    if category == "marketing" and not self.marketing_enabled:
        return False
    
    if category == "broadcast" and not self.broadcast_enabled:
        return False
    
    return True
```

### Check Daily Limit
```python
def check_outbound_limit(self) -> dict:
    daily_count = self.get_daily_count()
    current_count = daily_count["outbound_count"]
    
    if current_count >= self.max_outbound_per_day:
        return {
            "allowed": False,
            "reason": "daily_limit_reached",
            "current_count": current_count,
            "max_count": self.max_outbound_per_day
        }
    
    if current_count >= self.warning_threshold:
        return {
            "allowed": True,
            "warning": True,
            "reason": "approaching_limit",
            "current_count": current_count,
            "max_count": self.max_outbound_per_day,
            "warning_threshold": self.warning_threshold
        }
    
    return {
        "allowed": True,
        "current_count": current_count,
        "max_count": self.max_outbound_per_day
    }
```

### Update Daily Counter
```python
def update_daily_counter(self, category: str = "service") -> bool:
    today = date.today()
    
    cur.execute("""
        INSERT INTO daily_message_counter (date, outbound_count, service_count, 
                                           utility_count, marketing_count, 
                                           authentication_count, updated_at)
        VALUES (%s, 1, 
                CASE WHEN %s = 'service' THEN 1 ELSE 0 END,
                CASE WHEN %s = 'utility' THEN 1 ELSE 0 END,
                CASE WHEN %s = 'marketing' THEN 1 ELSE 0 END,
                CASE WHEN %s = 'authentication' THEN 1 ELSE 0 END,
                NOW())
        ON CONFLICT (date) DO UPDATE SET
            outbound_count = daily_message_counter.outbound_count + 1,
            service_count = daily_message_counter.service_count + 
                            CASE WHEN %s = 'service' THEN 1 ELSE 0 END,
            updated_at = NOW()
    """, (today, category, category, category, category, category))
```

### Log Outbound Message
```python
def log_outbound_message(self, customer_phone, message_type, 
                        template_name, category, status, provider_response):
    cur.execute("""
        INSERT INTO outbound_message_log 
        (customer_phone, message_type, template_name, category, 
         status, provider_response, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (customer_phone, message_type, template_name, category, 
          status, provider_response, datetime.now()))
```

## Database Schema

### daily_message_counter
```sql
CREATE TABLE IF NOT EXISTS daily_message_counter (
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
```

### outbound_message_log
```sql
CREATE TABLE IF NOT EXISTS outbound_message_log (
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

## Usage in Send Message

```python
async def send_text_message(self, to: str, text: str, category: str = "service"):
    # Check cost control
    if not cost_control.check_category_allowed(category):
        return {"status": "error", "error_code": 403}
    
    limit_check = cost_control.check_outbound_limit()
    if not limit_check["allowed"]:
        return {"status": "error", "error_code": 429}
    
    # Send message
    result = await self._send(to, text)
    
    if result["status"] == "success":
        # Update counter
        cost_control.update_daily_counter(category)
        
        # Log message
        cost_control.log_outbound_message(
            customer_phone=to,
            message_type="text",
            template_name=None,
            category=category,
            status="sent",
            provider_response=json.dumps(result)
        )
    
    return result
```

## Key Rules

1. **Service messages always allowed** — customer replies, repair updates
2. **Marketing/broadcast blocked by default** — must explicitly enable
3. **Daily limit enforced** — prevents runaway costs
4. **Warning threshold alerts** — notify before limit reached
5. **Log all outbound messages** — audit trail for cost tracking

## Related
- See `references/smart-routing-pattern.md` for intent classification and routing
