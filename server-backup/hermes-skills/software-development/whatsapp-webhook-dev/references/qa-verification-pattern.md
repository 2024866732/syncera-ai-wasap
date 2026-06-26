# QA Verification Pattern — WhatsApp Bot

 diagnostic checklist and test scripts for verifying WhatsApp bot deployment.

## Quick Test Matrix

After deployment, verify these 4 scenarios:

| Input | Expected Route | Expected Behavior |
|-------|---------------|-------------------|
| `"hi"` | Canonical greeting (static) | 1 reply, consistent text, <2s |
| `"menu"` | Static menu handler | 1 reply, menu content, <2s |
| `"Berapa harga repair?"` | OpenRouter AI | 1 reply, short BM, <10s |
| `"JOB-2026-001"` | DB lookup | 1 reply, status or not found, <2s |

## Test Script (run from any terminal)

```python
import hmac, hashlib, json, time, subprocess

APP_SECRET = "your_app_secret_here"  # Verify with repr()!
PHONE_ID = "your_phone_number_id"
URL = "https://your-app.azurewebsites.net/webhook"
TO_NUMBER = "60123456789"

tests = [
    {"id": "wamid_QA_GREETING_001", "body": "hi", "label": "GREETING"},
    {"id": "wamid_QA_MENU_001", "body": "menu", "label": "MENU"},
    {"id": "wamid_QA_PRICE_001", "body": "Berapa harga tukar bateri iPhone?", "label": "PRICE_QUERY"},
    {"id": "wamid_QA_JOB_001", "body": "JOB-2026-001", "label": "JOB_STATUS"},
]

for t in tests:
    payload = json.dumps({
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "YOUR_WABA_ID",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "11234567890", "phone_number_id": PHONE_ID},
                    "contacts": [{"profile": {"name": "QA Test"}, "wa_id": TO_NUMBER}],
                    "messages": [{
                        "from": TO_NUMBER,
                        "id": t["id"],
                        "timestamp": str(int(time.time())),
                        "type": "text",
                        "text": {"body": t["body"]}
                    }]
                },
                "field": "messages"
            }]
        }]
    }, separators=(',', ':'))  # IMPORTANT: Compact JSON for signature!
    
    sig = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    
    with open('/tmp/qa_payload.json', 'w') as f:
        f.write(payload)
    
    result = subprocess.run(
        ['curl', '-s', '-X', 'POST', URL,
         '-H', 'Content-Type: application/json',
         '-H', f'X-Hub-Signature-256: sha256={sig}',
         '-d', '@/tmp/qa_payload.json'],
        capture_output=True, text=True, timeout=15
    )
    
    print(f"✅ TEST {t['label']}: {result.stdout}")
    time.sleep(3)
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"detail":"Invalid signature"}` | APP_SECRET wrong or JSON pretty-printed | Use `repr(verify APP_SECRET)`, use `separators=(',',':')` in json.dumps |
| `{"status":"ok"}` but no reply in logs | AI call hanging or failing | Check Azure logs for OpenRouter timeout |
| Multiple replies for one message | Greeting not detected in both layers | Add greeting patterns to both `_static_menu_handler()` and `should_use_ai()` |
| Reply too long (>500 chars) | AI max_tokens too high | Set `max_tokens=150` and add `_is_too_long()` check |

## Log Analysis

After running tests, download logs:
```bash
az webapp log download --resource-group <rg> --name <app> --log-file /tmp/app_logs.txt
```

Extract and grep:
```bash
python3 -c "
import zipfile
with zipfile.ZipFile('app_logs.txt', 'r') as z:
    names = [n for n in z.namelist() if 'containerStream' in n]
    latest = sorted(names)[-1]
    content = z.read(latest).decode('utf-8', errors='replace')
    lines = content.split('\n')
    for line in lines:
        if any(k in line for k in ['QA', 'wamid_QA', 'Dedup', 'OpenRouter', 'Routing', 'Reply sent']):
            print(line)
"
```

### Expected Log Output

```
[INFO] 👋 Greeting detected — using canonical reply
[INFO] ✅ Reply sent to 60123456789: Waalaikumsalam! 👋 Selamat datang ke *HAFJET*...
[INFO] 👋 Greeting detected — using canonical reply  
[INFO] ✅ Reply sent to 60123456789: Waalaikumsalam! 👋 Selamat datang ke *HAFJET*...
[INFO] 💬 User said: 'Berapa harga tukar bateri iPhone?'
[INFO] 🤖 Routing to Hermes AI: 'Berapa harga tukar bateri iPhone?'
[INFO] 🤖 OpenRouter reply: Harga tukar bateri iPhone lebih kurang RM120-200...
[INFO] ✅ Reply sent to 60123456789: Harga tukar bateri iPhone lebih kurang RM120-200...
[INFO] 💬 User said: 'JOB-2026-001'
[INFO] 🔍 Checking repair status for: JOB-2026-001
[INFO] ✅ Reply sent to 60123456789: 📋 *Status Job: JOB-2026-001*
```

### Dedup Verification

```
[INFO] ⏭ Dedup: skip msg wamid_QA_GREETING_001 (processed 244s ago)
```
Appears when same msg_id received within 5 minutes — confirms dedup working.
