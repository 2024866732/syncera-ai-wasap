# Dashboard Auth Debug — 401 on Protected Endpoints

## Symptom
- `POST /api/auth/login` returns **200** (browser console shows success).
- `GET /api/inbox?filter=all` → **401 Unauthorized**
- `GET /api/staff` → **401 Unauthorized**
- WhatsApp bot still sends/replies fine (server-to-server path unaffected).
- Dashboard inbox does not load incoming customer messages.

## Root cause
Frontend `dashboard/src/api/api.js` called protected endpoints with **only** the
`X-API-Key` header, but the backend requires a **JWT Bearer** token for those routes.

Backend dependency (webhook_listener.py):
```python
async def get_current_staff(request: Request) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = auth_header.split(" ", 1)[1]
    payload = jwt.decode(token, STAFF_JWT_SECRET, algorithms=[JWT_ALGORITHM])
    ...
```
Login returns `{"access_token": <jwt>}`. Frontend stores it as `localStorage.staff_token`.

## Which endpoints are Bearer-protected (use `Depends(get_current_staff)`)
- `/api/inbox`
- `/api/staff` (GET list + POST create)
- `/api/auth/me`
- `/api/conversations/{phone}/assign`
- `/api/conversations/{phone}/status`
- `/api/customers/{phone}/resolve`
- `/api/customers/{phone}/escalate`
- SPX + Analytics functions (already use `getAuthHeaders()`)

## The unified helper (already exists in api.js)
```js
function getAuthHeaders() {
  const token = localStorage.getItem('staff_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-API-Key'] = import.meta.env.VITE_API_KEY || '';
  }
  return headers;
}
```

## Fix — patch these 8 functions to use `getAuthHeaders()`
`resolveCustomer`, `escalateCustomer`, `fetchStaffMe`, `fetchStaffList`,
`createStaff`, `fetchInbox`, `assignConversation`, `updateConversationStatus`.
Replace `headers: { 'Content-Type': 'application/json', 'X-API-Key': import.meta.env.VITE_API_KEY || '' }`
(or the GET variant without Content-Type) with `headers: getAuthHeaders()`.

## DO NOT touch (backend is NOT Bearer-protected for these)
- `updateNote` / `handoffCustomer` / `staffReply` → backend uses `operator="dashboard"` param + `X-API-Key`
- `createBlast` / `fetchBlastHistory` / `fetchContacts` + variants / `fetchKeywords` + variants → `X-API-Key` only
- `fetchCustomers` / `fetchMessages` → public / `X-API-Key`

## Verification (post-deploy, real)
```bash
BASE="https://hafjet-whatsapp-bot.azurewebsites.net"
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"hafizi@hafjet.com","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -o /dev/null -w "inbox:%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/inbox?filter=all"
curl -s -o /dev/null -w "staff:%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/staff"
# real-phone inbound check:
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/messages/60119999999" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);m=d if isinstance(d,list) else d.get('messages',d);print('total',len(m),'inbound',len([x for x in m if x.get('direction')=='inbound']))"
```
Expect: `inbox:200`, `staff:200`, `inbound` >= 1.
