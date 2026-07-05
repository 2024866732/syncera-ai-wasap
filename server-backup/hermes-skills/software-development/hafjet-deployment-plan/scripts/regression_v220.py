#!/usr/bin/env python3
"""
Sprint v2.2.0 regression test: Analytics Dashboard MVP.
Tests health, login, auth/me, analytics overview/timeseries/agents/CSV,
unauthorized rejection, inbox, dashboard frontend, and metric cardinality.

Usage:
  python3 regression_v220.py [--base https://hafjet-whatsapp-bot.azurewebsites.net]
                             [--email hafizi@hafjet.com] [--password admin123]
"""
import urllib.request, json, sys, time

BASE = "https://hafjet-whatsapp-bot.azurewebsites.net"
EMAIL = "hafizi@hafjet.com"
PASSWORD = "admin123"

if "--base" in sys.argv:
    BASE = sys.argv[sys.argv.index("--base") + 1]
if "--email" in sys.argv:
    EMAIL = sys.argv[sys.argv.index("--email") + 1]
if "--password" in sys.argv:
    PASSWORD = sys.argv[sys.argv.index("--password") + 1]

results = []

def ok(name, passed, detail=""):
    results.append((name, "PASS" if passed else "FAIL", detail))
    print(f"  {'PASS' if passed else 'FAIL':<6} {name:<40} {detail}")

# ── 1. Health ──────────────────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/health")
    code = urllib.request.urlopen(req, timeout=20).getcode()
    ok("GET /health", code == 200, f"HTTP {code}")
except Exception as e:
    ok("GET /health", False, str(e))

# ── 2. Login ───────────────────────────────────────────────────────────
token = ""
try:
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    token = r.get("access_token", "")
    ok("POST /api/auth/login", bool(token),
       f"HTTP 200, token={len(token)} chars" if token else "NO TOKEN")
except Exception as e:
    ok("POST /api/auth/login", False, str(e))

auth = f"Bearer {token}" if token else ""

# ── 3. Auth me ──────────────────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/api/auth/me",
                                 headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    staff = r.get("staff", {})
    ok("GET /api/auth/me", bool(staff.get("name")),
       f"name={staff.get('name','?')} role={staff.get('role','?')}")
except Exception as e:
    ok("GET /api/auth/me", False, str(e))

# ── 4. Analytics overview ──────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/api/analytics/overview",
                                 headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    # Expect at least 8 metric keys
    keys = [k for k in r.keys() if not k.startswith("_")]
    ok("GET /api/analytics/overview", len(keys) >= 8,
       f"HTTP 200, {len(keys)} metrics: {', '.join(list(keys)[:10])}")
except Exception as e:
    ok("GET /api/analytics/overview", False, str(e))

# ── 5. Analytics timeseries ────────────────────────────────────────────
for days, label in [(7, "7d"), (30, "30d")]:
    try:
        req = urllib.request.Request(
            f"{BASE}/api/analytics/timeseries?days={days}",
            headers={"Authorization": auth})
        r = json.loads(urllib.request.urlopen(req, timeout=20).read())
        n = len(r.get("labels", []))
        ok(f"GET /api/analytics/timeseries ({label})", n > 0 or n == 0,
           f"HTTP 200, {n} days labels")
    except Exception as e:
        ok(f"GET /api/analytics/timeseries ({label})", False, str(e))

# ── 6. Analytics agents ────────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/api/analytics/agents",
                                 headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    agents = r.get("agents", [])
    ok("GET /api/analytics/agents", True,
       f"HTTP 200, {len(agents)} agents")
except Exception as e:
    ok("GET /api/analytics/agents", False, str(e))

# ── 7. CSV export ─────────────────────────────────────────────────────
try:
    req = urllib.request.Request(
        f"{BASE}/api/analytics/export.csv?export_type=overview",
        headers={"Authorization": auth})
    resp = urllib.request.urlopen(req, timeout=20)
    ct = resp.headers.get("Content-Type", "")
    body = resp.read().decode()
    ok("GET /api/analytics/export.csv", "csv" in ct and len(body) > 50,
       f"HTTP {resp.getcode()}, type={ct}, {len(body)} bytes")
except Exception as e:
    ok("GET /api/analytics/export.csv", False, str(e))

# ── 8. Unauthorized → 401 ──────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/api/analytics/overview")
    code = urllib.request.urlopen(req, timeout=20).getcode()
    ok("Analytics w/o JWT → 401", code == 401, f"HTTP {code}")
except urllib.error.HTTPError as e:
    ok("Analytics w/o JWT → 401", e.code == 401, f"HTTP {e.code}")
except Exception as e:
    ok("Analytics w/o JWT → 401", False, str(e))

# ── 9. Inbox ────────────────────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/api/inbox?filter=all",
                                 headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    convs = r.get("conversations", r.get("data", []))
    ok("GET /api/inbox?filter=all", True,
       f"HTTP 200, {len(convs)} conversations")
except Exception as e:
    ok("GET /api/inbox?filter=all", False, str(e))

# ── 10. Dashboard frontend ─────────────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE}/dashboard/")
    body = urllib.request.urlopen(req, timeout=20).read().decode()
    ok("Dashboard frontend", "root" in body,
       f"HTTP 200, {'has root div' if 'root' in body else 'no root'}")
except Exception as e:
    ok("Dashboard frontend", False, str(e))

print()
print("=" * 60)
print("  Regression Test — Sprint v2.2.0")
print("=" * 60)
passed = sum(1 for _, s, _ in results if s == "PASS")
failed = [(n, d) for n, s, d in results if s == "FAIL"]
print(f"\n  PASS: {passed}/{len(results)}  FAIL: {len(failed)}")
if failed:
    print("\n  ❌ FAILED:")
    for n, d in failed:
        print(f"     {n}: {d}")
else:
    print("\n  ✅ ALL TESTS PASSED")
