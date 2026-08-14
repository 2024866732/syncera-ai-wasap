# API Authentication Dev Mode Behavior

## Problem

When `INTERNAL_API_KEY` is not set in `.env`, the API authentication middleware skips verification entirely.

## Root Cause

The `verify_api_key` function has a development mode bypass:

```python
async def verify_api_key(request: Request):
    # Skip if no API key configured (development mode)
    if not settings.internal_api_key:
        print("[SECURITY WARNING] INTERNAL_API_KEY not configured, skipping authentication")
        return
    # ... rest of verification
```

## Expected Behavior

| INTERNAL_API_KEY | Behavior | Use Case |
|------------------|----------|----------|
| Not set | Auth skipped | Development/testing |
| Set | Auth enforced | Production |

## Production Setup

### 1. Generate API Key

```bash
# Generate random 32-byte hex key
openssl rand -hex 32
```

### 2. Add to .env

```bash
INTERNAL_API_KEY=your_generated_key_here
```

### 3. Rebuild Container

```bash
sudo docker compose down && sudo docker compose up -d --build
```

### 4. Test

```bash
# Without API key (should return 401)
curl -X POST http://localhost:8200/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"phone":"60198021500","message_text":"test"}'

# With valid API key (should work)
curl -X POST http://localhost:8200/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_generated_key_here" \
  -d '{"phone":"60198021500","message_text":"harga iPhone 11?"}'
```

## Security Notes

- API key is NOT logged (only "Invalid API key" message)
- Uses constant-time comparison (prevents timing attacks)
- Missing key → HTTP 401
- Invalid key → HTTP 401
- Dev mode warning is logged when INTERNAL_API_KEY is not set

## Example: HAFJET Bot

```python
# In api/ai_chat.py
from fastapi import Depends, HTTPException
import hmac
from settings import settings

async def verify_api_key(request: Request):
    if not settings.internal_api_key:
        print("[SECURITY WARNING] INTERNAL_API_KEY not configured")
        return
    
    api_key = request.headers.get("X-API-Key", "")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    
    if not hmac.compare_digest(api_key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

@router.post("/api/ai/chat", dependencies=[Depends(verify_api_key)])
async def ai_chat(req: AIChatRequest):
    # ... implementation
```
