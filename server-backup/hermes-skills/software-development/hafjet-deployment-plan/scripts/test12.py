#!/usr/bin/env python3
"""Test 12: Inbound Escalation Keyword — verification script.

Simulates an inbound WhatsApp webhook with keyword "tolong",
then verifies the conversation was auto-escalated (status=escalated, bot_paused=1).
Requires: /tmp/app_secret.txt with APP_SECRET, valid staff login, conversation for test phone.
"""
import urllib.request, json, time, hmac, hashlib

base = "https://hafjet-whatsapp-bot.azurewebsites.net"
phone = "60198021500"

req = urllib.request.Request(base + "/api/auth/login",
    data=json.dumps({"email": "hafizi@hafjet.com", "password": "admin123"}).encode(),
    headers={"Content-Type": "application/json"})
r = json.loads(urllib.request.urlopen(req, timeout=20).read())
token = r["access_token"]
auth = "Bearer " + token

with open("/tmp/app_secret.txt") as f:
    app_secret = f.read().strip()

payload = json.dumps({
    "object": "whatsapp_business_account",
    "entry": [{"id": "123", "changes": [{"value": {
        "messaging_product": "whatsapp",
        "metadata": {"display_phone_number": "60123456789", "phone_number_id": "987654321"},
        "contacts": [{"profile": {"name": "Test"}, "wa_id": phone}],
        "messages": [{"id": "wamid.test", "from": phone, "timestamp": str(int(time.time())), "type": "text", "text": {"body": "tolong"}}]
    }, "field": "messages"}]}]
}).encode()

sig = "sha256=" + hmac.new(app_secret.encode(), payload, hashlib.sha256).hexdigest()
req = urllib.request.Request(base + "/webhook", data=payload,
    headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig}, method="POST")
r = json.loads(urllib.request.urlopen(req, timeout=20).read())

print("=== TEST 12: Inbound Escalation Keyword ===")
print("Webhook response:", r)

time.sleep(1)
req2 = urllib.request.Request(base + "/api/customers/" + phone, headers={"Authorization": auth})
r2 = json.loads(urllib.request.urlopen(req2, timeout=20).read())
print("Customer status:", r2.get("status"))
print("bot_paused:", r2.get("bot_paused"))
print("escalated_at:", r2.get("escalated_at"))

passed = (r.get("status") == "ok" and r2.get("status") == "escalated" and r2.get("bot_paused") == 1)
print("Result:", "PASS" if passed else "FAIL")
