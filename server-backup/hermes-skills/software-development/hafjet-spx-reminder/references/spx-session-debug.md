# SPX Session Debugging Protocol

## Symptom
`GET /api/spx/session-status` returns `{"active": false, "error": "SPX_SESSION_EXPIRED"}` (HTTP 401).

This means:
- ✅ Cookies are stored in DB (otherwise returns `"No session configured"`)
- ✅ Backend sent the Cookie header to SPX
- ❌ SPX rejected with HTTP 401

## Diagnosis Steps

### Step 1: Verify cookies are stored
Call session-status endpoint with JWT auth:
```bash
curl -s -H "Authorization: Bearer <token>" https://<app>.azurewebsites.net/api/spx/session-status
```
Response `"SPX_SESSION_EXPIRED"` → cookies are in DB.  
Response `"No session configured"` → no cookies saved → UI save failed.

### Step 2: Check what SPX actually returns
Test SPX portal directly from the server:
```bash
# Without cookies — baseline 401 response
curl -s "https://sp.spx.shopee.com.my/sp-api/point/order/collection/list?pageno=1&count=1" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Referer: https://sp.spx.shopee.com.my/" \
  -H "Origin: https://sp.spx.shopee.com.my"
# → {"retcode": 401, "message": "request header cookie is required", "data": null}
```

### Step 3: Check container logs for the exact SPX response
```bash
az webapp log tail -n 20 --name <app> --resource-group <rg> | grep "sp.spx.shopee.com.my"
```
Expected log line:
```
HTTP Request: GET https://sp.spx.shopee.com.my/sp-api/point/order/collection/list?... "HTTP/1.1 401 Unauthorized"
```

**Limitation:** The backend only checks `resp.status_code == 401` → raises `SPX_SESSION_EXPIRED`. It does NOT log the SPX response body. So we cannot distinguish between "cookie missing", "session expired", "CSRF token missing", or "other auth error" without enhancing the code.

## Root Cause Analysis

When SPX returns 401 despite cookies being sent, possible causes:

| Cause | Likelihood | Evidence |
|-------|-----------|----------|
| Session expired (browser logged out) | Medium | Re-login to SPX portal fixes it |
| Missing CSRF cookie in the paste | **High** | Shopee uses double-submit cookie CSRF |
| Wrong format (partial paste) | Medium | User copied `value` not `key=value; key=value` |
| IP/device binding | Low | SPX checks User-Agent or IP consistency |
| Cookie sent but in wrong header format | Low | Backend sends `Cookie` header directly from stored string |

## Expected SPX Auth Requirements

From observed behavior:
- SPX API at `sp.spx.shopee.com.my` requires valid session cookies
- Without cookies: `{"retcode": 401, "message": "request header cookie is required"}`
- The session likely includes:
  - `SPC_*` or `SPX_*` — main session token (long alphanumeric)
  - `csrftoken` or similar — CSRF protection cookie
  - `REC_T_ID` — tracking/recommendation
- **CSRF protection hypothesis:** Shopee platforms (Shopee/SPX) commonly use a double-submit cookie pattern. A cookie named `csrftoken` or similar must be present AND its value must be echoed in a custom header like `X-CSRF-Token`. If the user's browser has this, the cookie part is sent but the header part is NOT — causing 401.

## Recommended Cookie Capture Method

**✅ CORRECT method — from Network tab (not Application tab):**

1. Open Chrome DevTools → **Network** tab
2. Login to SPX portal and navigate to Self-Collection page
3. Refresh the page
4. Find any XHR/Fetch request to `sp.spx.shopee.com.my`
5. Click the request → **Headers** → **Request Headers** section
6. Find the **`Cookie:`** header — it's a single long string like:
   ```
   SPC_=abc123...; csrftoken=def456...; REC_T_ID=ghi789...
   ```
7. **Copy the ENTIRE Cookie header value** (everything after `Cookie: `)
8. Paste into the dashboard textarea — do NOT trim, edit, or select only some cookies

**❌ WRONG method — from Application tab:**
- Browsers show individual cookies key by key
- It's easy to miss a cookie or paste only the value, not `key=value`
- Critical: `csrftoken` or `x-csrftoken` cookies may not be visible in the Application tab list (HttpOnly or other flags)

## After Fixing Cookies

After re-pasting cookies from Network tab:
1. Click **Save & Test Connection** — should show `✅ SPX Session Active — 2346 orders found`
2. Click **Sync from SPX Now** — imports all orders into local DB
3. If still `SPX_SESSION_EXPIRED`:
   - Open a **new incognito browser**, login to SPX portal fresh
   - Repeat the Network tab capture
   - Try again immediately (don't navigate away from the page first)

## If Still Fails Despite Fresh Session

Possible SPX anti-bot measures:
- **User-Agent check** — SPX may require the exact User-Agent of the original browser session. Our backend sends `Mozilla/5.0` which may differ from Chrome/Safari.
- **IP consistency** — If SPX binds session to IP, our backend's Azure IP differs from the user's browser IP. This would cause instant 401 regardless of cookies.
- **Additional headers** — SPX may check `Sec-Fetch-*`, `Accept-Language`, or `Accept-Encoding` consistency.

**Code enhancement suggestion (if cookie capture still fails):**
```python
# Log the SPX response body to distinguish 401 types:
if resp.status_code == 401:
    body = await resp.text()
    log.warning(f"[SPX] 401 response: {body[:200]}")
    raise Exception("SPX_SESSION_EXPIRED")
```
This would reveal whether SPX says "cookie required", "session expired", "CSRF mismatch", or other.
