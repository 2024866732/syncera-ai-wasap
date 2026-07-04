# Regression Assertion — API Response Schema Matching

## The Trap

When writing regression tests against API endpoints, the **HTTP status code** may be 200 but the **response body schema** can differ from what the assertion logic expects — producing **false negatives** (test says FAIL when the endpoint actually works correctly).

This wastes time chasing "bugs" that don't exist.

## Specific Schema Patterns Found (Sprint v2.1.1)

### 1. `/api/auth/me` — Response Wrapped in `staff` Key

```python
# ❌ ASSERTION FAILS — response has {'staff': {'email': ..., 'name': ...}}
assert r.get("email")  # Returns None — "email" is nested inside "staff"

# ✅ CORRECT — unwrap the staff wrapper first
staff = r.get("staff", r)
assert staff.get("email")
```

Actual response structure:
```json
{
  "staff": {
    "id": 1,
    "name": "Tuan Hafizi (Admin)",
    "email": "hafizi@hafjet.com",
    "role": "admin",
    "status": "online",
    "assigned_phone": "60198021500"
  }
}
```

### 2. `PATCH /api/conversations/{phone}/status` — `action` Field for Status Transition

```python
# ❌ ASSERTION FAILS — r.get("status") returns "ok", not "escalated"
assert r.get("status") == "escalated"

# ✅ CORRECT — check the action field or nested data
action_ok = r.get("action") == "status->escalated"
customer_status = r.get("customer", {}).get("status") == "escalated"
assert action_ok or customer_status
```

Actual response structure:
```json
{
  "status": "ok",
  "action": "status->escalated",
  "customer": {
    "id": 48,
    "phone": "60119999999",
    "name": "Hermes Tester Admin",
    "status": "escalated",
    "bot_paused": 1,
    ...
  }
}
```

### 3. Inbox Filter Response — `conversations` Key

```python
# The inbox endpoint wraps results
r = api("GET", "/api/inbox?filter=all", headers=auth)

# Access the conversation list:
convs = r.get("conversations", r.get("data", []))
```

## General Principle

**Always inspect the ACTUAL response body BEFORE writing assertion logic.**

The first test run against any endpoint should:
1. Print the raw JSON response to stdout
2. Let you (or the agent) visually confirm the structure
3. Then write assertions that match the actual schema

```python
# First run — discovery mode:
r = api("GET", path)
print(json.dumps(r, indent=2))  # Inspect actual schema

# Second run — assertion mode:
r = api("GET", path)
assert r.get("actual_key") == expected_value
```

## Why This Happens

Backend developers choose response schemas that make sense for the frontend consumer:

| Endpoint | Frontend Expects | Schema Choice | Test Trap |
|----------|-----------------|---------------|-----------|
| `/api/auth/me` | `{email, name, role}` (flat) | Wrapped in `staff` key for consistency | Test checks top-level |
| PATCH status | `{newStatus, customer}` | Conservative `{status: "ok", action: "..."}` | Test checks `status=="escalated"` |
| Inbox | `[{conversations}]` | Keyed under `conversations` | Test expects array at root |

**Schema documentation is often out of date.** The actual response never lies — read it first.

## Prevention in Regression Script Structure

Structure any regression script as:

```python
# Phase 1: Schema Discovery (first run)
for endpoint in ALL_ENDPOINTS:
    resp = api(endpoint.method, endpoint.path, ...)
    print(f"=== {endpoint.label} ===")
    print(json.dumps(resp, indent=2)[:500])
    # Save structure for verification

# Phase 2: Schema-Matched Assertions (subsequent runs, after review)
test("...", r["actual_key"], expected_value)
```

In practice, merge Phase 1 into the try/except to always print raw on failure:

```python
try:
    r = api("GET", "/api/auth/me")
    staff = r.get("staff", r)
    assert staff.get("email")
    test("...", "PASS")
except Exception as e:
    test("...", "FAIL", f"Raw: {json.dumps(r, indent=2)[:200]} - {e}")
```

This way, when an assertion fails, the raw response shows the actual schema for immediate diagnosis — no need for a separate discovery run.
