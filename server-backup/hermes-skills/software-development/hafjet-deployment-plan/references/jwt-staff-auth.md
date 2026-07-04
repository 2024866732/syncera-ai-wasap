# JWT Staff Auth + Inbox API Reference

## DB Schema

```sql
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'agent',
    status TEXT DEFAULT 'offline',
    assigned_phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

## Password Hashing

```python
import hashlib
password_hash = hashlib.sha256(password.encode()).hexdigest()
```

## JWT Token

```python
import jwt
from datetime import datetime, timezone, timedelta

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8

def _create_access_token(staff_id: int, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(staff_id),
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp()),
    }
    return jwt.encode(payload, STAFF_JWT_SECRET, algorithm=JWT_ALGORITHM)
```

## JWT Dependency

```python
from fastapi import Request, HTTPException, Depends

async def get_current_staff(request: Request) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, STAFF_JWT_SECRET, algorithms=[JWT_ALGORITHM])
        staff_id = int(payload["sub"])
        staff = await asyncio.get_event_loop().run_in_executor(None, get_staff_by_id, staff_id)
        if not staff:
            raise HTTPException(status_code=401, detail="Staff not found")
        return {
            "id": staff["id"],
            "name": staff["name"],
            "email": staff["email"],
            "role": staff["role"],
            "status": staff["status"],
            "assigned_phone": staff["assigned_phone"],
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

## Route Decorator Pattern — `Depends` Injection

**Critical distinction:** FastAPI has TWO places for `Depends(...)`:

| Placement | Runs dependency? | Injects return value? | Use case |
|-----------|-----------------|----------------------|----------|
| `dependencies=[Depends(func)]` in decorator | ✅ Yes | ❌ No | Auth check only (401 on bad token, don't need user data) |
| `param: Type = Depends(func)` in function sig | ✅ Yes | ✅ Yes | Need the user object for role checks or filtering |

```python
# ❌ WRONG when you NEED current_staff data — decorator only, result not injected
@app.get("/api/inbox", dependencies=[Depends(get_current_staff)])
async def api_inbox(filter_type: str = "all", current_staff: dict = None):
    current_staff["id"]  # TypeError: 'NoneType' object is not subscriptable

# ✅ CORRECT when you NEED the return value
@app.get("/api/inbox")
async def api_inbox(filter_type: str = "all", current_staff: dict = Depends(get_current_staff)):
    current_staff["id"]  # Works: 1

# ✅ Decorator-only is fine for AUTH CHECKS that don't need user data
@app.get("/api/staff", dependencies=[Depends(get_current_staff)])
async def api_list_staff():
    return get_all_staff()  # Just needs auth, doesn't need current_staff
```

**Rule of thumb:** The moment your handler body references `current_staff["..."]`, move `Depends(get_current_staff)` from the decorator into the function signature.

## API Endpoints

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/api/auth/login` | None | `{email, password}` | `{access_token, staff}` |
| GET | `/api/auth/me` | JWT | — | `{staff}` |
| GET | `/api/staff` | JWT | — | `{staff: [...]}` |
| POST | `/api/staff` | JWT (admin) | `{name, email, password, role}` | `{id, message}` |
| PATCH | `/api/staff/{id}/status` | JWT | `{status: "online"\|"busy"\|"offline"}` | `{message}` |
| GET | `/api/inbox?filter=all` | JWT | — | `{conversations, filter}` |
| PATCH | `/api/conversations/{phone}/assign` | JWT | `{staff_id?: int \| null}` | `{message}` |

## Filter Types for `/api/inbox`

- `all` — all conversations
- `me` — conversations assigned to current staff
- `unassigned` — conversations with `assigned_to IS NULL`

## Conversation Assignment

- `staff_id: null` → unassign conversation, clear `assigned_phone` on staff
- `staff_id: int` → assign conversation, update `assigned_phone` on staff record

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `STAFF_JWT_SECRET` | HMAC secret for JWT signing. **Must be set in Azure app settings.** |
| `DASHBOARD_API_KEY` | Dashboard API key (still required for dashboard API routes, independent of JWT) |

**Pitfall:** `STAFF_JWT_SECRET` must be a real non-empty string. Empty string causes `jwt.encode(...)` to raise `InvalidKeyError: HMAC key must not be empty.` Set it in Azure app settings before deploying staff auth code.
