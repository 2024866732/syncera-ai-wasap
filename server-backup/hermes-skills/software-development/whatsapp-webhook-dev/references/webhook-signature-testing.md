# Webhook Signature Testing with curl

## Problem
Manually computing HMAC-SHA256 signatures for WhatsApp webhook testing is error-prone. Common failures:
- Pretty-printed JSON produces different signature than compact JSON
- APP_SECRET may have hidden whitespace or special characters
- Inline `-d '{...}'` in curl breaks with nested quotes

## Solution: Python-Generated Signature + File Payload

### Pattern: Generate signature in Python, write payload to file, use curl with @file

```python
import hmac, hashlib, json, subprocess, time

APP_SECRET = "your_exact_secret"  # Verify with repr()!
PHONE_ID = "1089032617637482"
URL = "https://app.azurewebsites.net/webhook"

payload = json.dumps({
    "object": "whatsapp_business_account",
    "entry": [{
        "id": "1558497515847375",
        "changes": [{
            "value": {
                "messaging_product": "whatsapp",
                "metadata": {"display_phone_number": "1149561698", "phone_number_id": PHONE_ID},
                "contacts": [{"profile": {"name": "Test User"}, "wa_id": "60198021500"}],
                "messages": [{
                    "from": "60198021500",
                    "id": "wamid_TEST_001",  # Unique per test to avoid dedup
                    "timestamp": str(int(time.time())),
                    "type": "text",
                    "text": {"body": "hi"}
                }]
            },
            "field": "messages"
        }]
    }]
})  # json.dumps auto-compact — no pretty print!

sig = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()

# Write payload to file
with open('/tmp/test_payload.json', 'w') as f:
    f.write(payload)

# Execute curl
result = subprocess.run(
    ['curl', '-s', '-X', 'POST', URL,
     '-H', 'Content-Type: application/json',
     '-H', f'X-Hub-Signature-256: sha256={sig}',
     '-d', '@/tmp/test_payload.json'],
    capture_output=True, text=True, timeout=15
)

print(f"Response: {result.stdout}")
```

### Key Rules:
1. **Always use `json.dumps(data)`** — never `json.dumps(data, indent=2)` for signature
2. **Never encode yourself** — type it, then JSON encode
3. **Write payload to file** — use `@/tmp/payload.json` in curl
4. **Generate signature BEFORE writing file** — same `payload` string
5. **Include `await asyncio.sleep()` between tests** — avoid rate limiting
6. **Use `connect-timeout 5`** with curl to avoid hanging

## Testing Deduplication

```python
# Test deduplication by sending same msg_id twice
# First: should process → return {"status": "ok"}
# Second within 5 min: should also return {"status": "ok"} but no reply sent
# Check logs for "Dedup: skip msg ..." confirmation
```

## Common Signature Failures

| Error | Root Cause | Fix |
|-------|-----------|-----|
| `{"detail":"Invalid signature"}` | JSON pretty-printed or whitespace difference | Use `json.dumps(data)` without indent |
| `{"detail":"Invalid signature"}` | APP_SECRET wrong/whitespace | `repr(APP_SECRET)` to check exact value |
| `{"detail":"Invalid signature"}` | curl inline `-d` breaks with special chars | Write to file, use `@file` |
| `200 OK` but no reply | Duplicate msg_id (dedup triggered) | Use unique msg_id per test |
