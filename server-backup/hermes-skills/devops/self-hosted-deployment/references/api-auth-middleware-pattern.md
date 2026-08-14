# API Authentication Middleware Pattern

## Overview
X-API-Key authentication middleware for FastAPI endpoints with constant-time comparison.

## Implementation

### Middleware Function
```python
from fastapi import Request, HTTPException, Depends
import hmac

async def verify_api_key(request: Request):
    """
    Verify X-API-Key header using constant-time comparison
    Returns 401 if key is missing or invalid
    """
    # Skip if no API key configured (development mode)
    if not settings.internal_api_key:
        print("[SECURITY WARNING] INTERNAL_API_KEY not configured, skipping authentication")
        return
    
    # Get API key from header
    api_key = request.headers.get("X-API-Key", "")
    
    if not api_key:
        print("[SECURITY] Missing X-API-Key header")
        raise HTTPException(
            status_code=401,
            detail="Missing X-API-Key header"
        )
    
    # Constant-time comparison (prevents timing attacks)
    if not hmac.compare_digest(api_key, settings.internal_api_key):
        print("[SECURITY] Invalid API key")
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )
    
    print("[SECURITY] API key verified")
```

### Apply to Endpoint
```python
from fastapi import APIRouter, Depends

router = APIRouter()

@router.post(
    "/api/ai/chat", 
    response_model=AIChatResponse, 
    dependencies=[Depends(verify_api_key)]  # <-- PROTECTED
)
async def ai_chat(req: AIChatRequest):
    # ... implementation
```

### Generate API Key
```bash
# Generate secure key
openssl rand -hex 32

# Output: 3d4caf0f526200472a2bd241328cf38788e2ad9fe496413af799ef911295786e
```

### Store in Environment
```env
# .env
INTERNAL_API_KEY=3d4caf0f526200472a2bd241328cf38788e2ad9fe496413af799ef911295786e
```

### Settings Class
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    internal_api_key: Optional[str] = None
    
    class Config:
        env_file = ".env"
```

## Usage Examples

### With Valid API Key
```bash
curl -X POST http://localhost:8200/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: 3d4caf...86e" \
  -d '{"phone":"60198021500","message_text":"test"}'

# Response: 200 OK
```

### Without API Key
```bash
curl -X POST http://localhost:8200/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"phone":"60198021500","message_text":"test"}'

# Response: 401 Missing X-API-Key header
```

### With Wrong API Key
```bash
curl -X POST http://localhost:8200/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: wrong_key_123" \
  -d '{"phone":"60198021500","message_text":"test"}'

# Response: 401 Invalid API key
```

## Key Security Features

1. **Constant-time comparison** — `hmac.compare_digest()` prevents timing attacks
2. **No key logging** — Only logs "Invalid API key", not the actual key
3. **Development mode** — Skips auth if `internal_api_key` not configured
4. **401 for missing/invalid** — Proper HTTP status codes

## Rate Limiting (Optional)

```python
from fastapi import Request
import time

rate_limit_store = {}

def check_rate_limit(client_ip: str, limit: int = 60) -> bool:
    now = time.time()
    minute_ago = now - 60
    
    # Clean old entries
    rate_limit_store[client_ip] = [t for t in rate_limit_store.get(client_ip, []) if t > minute_ago]
    
    # Check limit
    if len(rate_limit_store.get(client_ip, [])) >= limit:
        return False
    
    # Add current request
    rate_limit_store.setdefault(client_ip, []).append(now)
    return True

@app.post("/api/ai/chat")
async def ai_chat(request: Request, ...):
    client_ip = request.client.host
    
    if not check_rate_limit(client_ip, limit=100):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    # ... implementation
```

## Key Rules

1. **Always use `hmac.compare_digest()`** — Prevents timing attacks
2. **Never log the actual API key** — Security best practice
3. **Use environment variables** — Never hardcode keys
4. **401 for auth failures** — Proper HTTP status codes
5. **Development mode** — Skip auth when key not configured

## Related
- See `references/smart-routing-pattern.md` for the endpoint implementation
