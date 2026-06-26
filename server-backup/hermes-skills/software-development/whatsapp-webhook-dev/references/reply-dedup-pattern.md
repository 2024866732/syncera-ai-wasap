# Reply Deduplication Pattern

## Problem
A single inbound WhatsApp message produces multiple outbound replies. Common in production bots.

## Root Causes
1. **Overlapping static + AI fallback:** Static handler returns greeting, AI fallback ALSO returns greeting for same message
2. **Webhook re-triggers:** Meta retries webhook delivery if first response takes too long (>20s)
3. **AI temperature too high:** `temperature=0.7` produces different variations each call
4. **No deduplication:** Same `msg_id` processed multiple times within minutes

## Solution Architecture

### 1. Greeting Detection in BOTH Layers
```python
# In webhook_listener.py (_static_menu_handler)
def _is_greeting(msg_lower: str) -> bool:
    greetings_exact = ["hi", "hello", "hey", "halo", "hai", ...]
    greetings_startswith = ["hi ", "hello ", "halo ", ...]
    return msg_lower in greetings_exact or msg_lower.startswith(tuple(greetings_startswith))

# In hermes_ai.py (should_use_ai)
greetings = ["hi", "hello", "hey", "halo", ...]
if msg_lower in greetings:
    return False  # Never send greetings to AI
```

### 2. Canonical Reply Constants
```python
CANONICAL_GREETING = (
    "Waalaikumsalam! 👋 Selamat datang ke *HAFJET* — kedai repair phone kami.\n\n"
    "Macam mana kami boleh bantu awak hari ni? 😊\n\n"
    "Tulis *1* untuk harga repair\n"
    "Tulis *2* untuk semak status job\n"
    "Tulis *3* untuk hubungi staff\n"
    "Tulis *4* untuk lokasi & waktu operasi"
)
```
**Rule:** One constant string. No f-string variations. Same input = same output, always.

### 3. Message ID Deduplication (5-min window)
```python
from datetime import datetime, timezone, timedelta

_processed_messages: dict[str, datetime] = {}
_DEDUP_WINDOW = 300  # 5 minutes

def _is_duplicate(msg_id: str) -> bool:
    now = datetime.now(timezone(timedelta(hours=8)))
    if msg_id in _processed_messages:
        elapsed = (now - _processed_messages[msg_id]).total_seconds()
        if elapsed < _DEDUP_WINDOW:
            return True
    _processed_messages[msg_id] = now
    # Cleanup old entries
    expired = [k for k, v in _processed_messages.items() 
               if (now - v).total_seconds() > _DEDUP_WINDOW]
    for k in expired:
        del _processed_messages[k]
    return False
```

Apply in `_process_message`:
```python
async def _process_message(msg: dict, value: dict):
    msg_id = msg.get("id", "")
    if _is_duplicate(msg_id):
        return  # Skip silently
    # ... rest of processing
```

### 4. AI Output Constraints
```python
# In OpenRouter payload
payload = {
    "max_tokens": 150,      # 2-3 sentences max
    "temperature": 0.3,     # Low temp = consistent output
}

# In generate_reply()
ai_reply = await ask_hermes(message, sender_name)
if ai_reply and not _is_too_long(ai_reply):  # Reject if >500 chars
    return ai_reply
```

### 5. Routing Order (Priority)
```
INBOUND → Dedup Check → Job ID? → Greeting? → Static Menu? → AI → Fallback
```
**Critical:** Greeting must return immediately with NO AI fallback. Greeting is the #1 source of duplicate replies.

## Deployment Checklist
- [ ] `_is_greeting()` in both static handler AND `should_use_ai()`
- [ ] Canonical greeting constant (no f-string variations)
- [ ] `_is_duplicate()` with 5-min window applied in `_process_message()`
- [ ] AI `temperature` ≤ 0.3, `max_tokens` ≤ 150
- [ ] Reject AI replies > 500 characters
- [ ] One inbound message produces exactly one outbound reply
