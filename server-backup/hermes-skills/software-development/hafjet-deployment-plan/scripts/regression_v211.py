import urllib.request, json, time, hmac, hashlib

base = "https://hafjet-whatsapp-bot.azurewebsites.net"
results = []

def ok(name, passed, detail=""):
    results.append((name, "PASS" if passed else "FAIL", detail))
    print(("PASS" if passed else "FAIL") + " " + name + ": " + detail)

# login
token = ""
try:
    req = urllib.request.Request(base + "/api/auth/login",
        data=json.dumps({"email": "hafizi@hafjet.com", "password": "admin123"}).encode(),
        headers={"Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    token = r["access_token"]
    ok("/api/auth/login", bool(token), "Token len=" + str(len(token)))
except Exception as e:
    ok("/api/auth/login", False, str(e))

auth = "Bearer " + token
phone = "60198021500"

# 1 /health
try:
    req = urllib.request.Request(base + "/health")
    code = urllib.request.urlopen(req, timeout=15).getcode()
    ok("/health", code == 200, "HTTP " + str(code))
except Exception as e:
    ok("/health", False, str(e))

# 2 /api/auth/me
try:
    req = urllib.request.Request(base + "/api/auth/me", headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("/api/auth/me", r.get("staff", {}).get("name") == "Tuan Hafizi (Admin)", r["staff"]["name"])
except Exception as e:
    ok("/api/auth/me", False, str(e))

# 3 /api/inbox?filter=all
try:
    req = urllib.request.Request(base + "/api/inbox?filter=all", headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("/inbox all", len(r.get("conversations", [])) >= 1, str(len(r.get("conversations", []))) + " convs")
except Exception as e:
    ok("/inbox all", False, str(e))

# 4 /api/inbox?filter=me
try:
    req = urllib.request.Request(base + "/api/inbox?filter=me", headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("/inbox me", True, str(len(r.get("conversations", []))) + " assigned")
except Exception as e:
    ok("/inbox me", False, str(e))

# 5 /api/inbox?filter=unassigned
try:
    req = urllib.request.Request(base + "/api/inbox?filter=unassigned", headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("/inbox unassigned", True, str(len(r.get("conversations", []))) + " convs")
except Exception as e:
    ok("/inbox unassigned", False, str(e))

# 6 /api/inbox?filter=escalated
try:
    req = urllib.request.Request(base + "/api/inbox?filter=escalated", headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("/inbox escalated", True, str(len(r.get("conversations", []))) + " convs")
except Exception as e:
    ok("/inbox escalated", False, str(e))

# 7 /api/inbox?filter=resolved
try:
    req = urllib.request.Request(base + "/api/inbox?filter=resolved", headers={"Authorization": auth})
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("/inbox resolved", True, str(len(r.get("conversations", []))) + " convs")
except Exception as e:
    ok("/inbox resolved", False, str(e))

# 8 PATCH status escalated
try:
    req = urllib.request.Request(base + "/api/conversations/" + phone + "/status",
        data=json.dumps({"status": "escalated"}).encode(),
        headers={"Authorization": auth, "Content-Type": "application/json"},
        method="PATCH")
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("PATCH escalated", r.get("status") == "ok", "bot_paused=" + str(r.get("customer", {}).get("bot_paused")))
except Exception as e:
    ok("PATCH escalated", False, str(e))

# 9 PATCH status resolved
try:
    req = urllib.request.Request(base + "/api/conversations/" + phone + "/status",
        data=json.dumps({"status": "resolved"}).encode(),
        headers={"Authorization": auth, "Content-Type": "application/json"},
        method="PATCH")
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("PATCH resolved", r.get("status") == "ok", "resolved_at=" + str(r.get("customer", {}).get("resolved_at")))
except Exception as e:
    ok("PATCH resolved", False, str(e))

# 10 PATCH status bot_active reopen
try:
    req = urllib.request.Request(base + "/api/conversations/" + phone + "/status",
        data=json.dumps({"status": "bot_active"}).encode(),
        headers={"Authorization": auth, "Content-Type": "application/json"},
        method="PATCH")
    r = json.loads(urllib.request.urlopen(req, timeout=20).read())
    ok("PATCH bot_active", r.get("status") == "ok", "bot_paused=" + str(r.get("customer", {}).get("bot_paused")))
except Exception as e:
    ok("PATCH bot_active", False, str(e))

print("")
print("=== SUMMARY ===")
passed = sum(1 for _, s, _ in results if s == "PASS")
failed = [n for n, s, _ in results if s == "FAIL"]
print("PASS: " + str(passed) + "/" + str(len(results)))
if failed:
    print("FAILED:", failed)
else:
    print("ALL TESTS PASSED")
