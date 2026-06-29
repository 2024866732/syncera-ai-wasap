# Example Patch: Applying LLM API Resilience to hermes_ai.py

Below is the diff that was applied to `hermes_ai.py` to add resilience logging, configuration verification, timeout, and fallback handling.

```diff
--- hermes_ai.py
+++ hermes_ai_new.py
@@ -1,6 +1,8 @@
 import os
 import requests
 import subprocess
+import traceback
+import time
 from typing import Optional
 
 OPENROUTER_API_KEY=os.get...Y", "").strip()
@@ -32,7 +34,7 @@
 +60 11-4956 1698
 Lokasi:
 No. 890 Jalan Lestari 20, Taman Amalina Lestari, 27600 Raub, Pahang
-Google Maps: https://g.co/kgs/95C95C9TB
+Google Maps: https://g.co/kgs/95C9TB
 """""
 
 def safe_read_text(path: str, fallback: str) -> str:
@@ -65,14 +67,33 @@
 """""
 
 def ask_openrouter(user_message: str, wa_name: Optional[str] = None) -> Optional[str]:
+    start_time = time.time()
+    print(f"[hermes_ai] [OPENROUTER] Request started at {start_time}")
+   
+    # Verify configuration
+    if not OPENROUTER_API_KEY:
+        print("[hermes_ai] [OPENROUTER] ERROR: OPENROUTER_API_KEY is empty or not set")
+        return None
+    print(f"[hermes_ai] [OPENROUTER] API key (last 6 chars): ...{OPENROUTER_API_KEY[-6:]}")
+   
+    if not OPENROUTER_MODEL:
+        print("[hermes_ai] [OPENROUTER] ERROR: OPENROUTER_MODEL is empty")
+        return None
+    print(f"[hermes_ai] [OPENROUTER] Model: {OPENROUTER_MODEL}")
+   
+    if not OPENROUTER_URL.endswith("/v1"):
+        # Ensure the URL ends with /v1 if not already
+        if not OPENROUTER_URL.endswith("/v1/chat/completions"):
+            print(f"[hermes_ai] [OPENROUTER] WARNING: Base URL might be incorrect. Current: {OPENROUTER_URL}")
+        else:
+            print(f"[hermes_ai] [OPENROUTER] Base URL: {OPENROUTER_URL} (contains /v1)")
+    else:
+        print(f"[hermes_ai] [OPENROUTER] Base URL: {OPENROUTER_URL}")
+   
     customer_name_hint = wa_name.strip() if wa_name else "pelanggan"
     messages = [
         {"role": "system", "content": SOUL_CONTEXT},
-        {"role": "user", "content": f"Nama pelanggan: {customer_name_hint}\\nMesej pelanggan: {user_message}"}
+        {"role": "user", "content": f"Nama pelanggan: {customer_name_hint}\\\\nMesej pelanggan: {user_message}"}
     ]
     headers = {
         "Authorization": f"Bearer {OPENROUTER_API_KEY}",
         "Content-Type": "application/json"
@@ -83,19 +104,48 @@
         "messages": messages,
         "temperature": 0.5
     }
+   
+    # Log payload (without the full message for privacy, but we can log the structure)
+    safe_payload = {
+        "model": payload["model"],
+        "messages_count": len(payload["messages"]),
+        "temperature": payload["temperature"]
+    }
+    print(f"[hermes_ai] [OPENROUTER] Payload: {safe_payload}")
+   
     try:
-        resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=45)
-        print(f"[hermes_ai] OpenRouter status: {resp.status_code}")
+        # Set timeout to 30 seconds as required
+        resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
+        end_time = time.time()
+        duration = end_time - start_time
+        print(f"[hermes_ai] [OPENROUTER] Response status code: {resp.status_code}")
+        print(f"[hermes_ai] [OPENROUTER] Raw response body (first 500 chars): {resp.text[:500]}")
+        print(f"[hermes_ai] [OPENROUTER] Request completed in {duration:.2f} seconds")
+       
         if resp.status_code < 200 or resp.status_code >= 300:
-            print(f"[hermes_ai] OpenRouter error body: {resp.text}")
+            print(f"[hermes_ai] [OPENROUTER] ERROR: Bad status code {resp.status_code}")
             return None
-
-        data = resp.json()
+       
+        try:
+            data = resp.json()
+        except Exception as e:
+            print(f"[hermes_ai] [OPENROUTER] ERROR: Failed to parse JSON: {e}")
+            traceback.print_exc()
+            return None
+       
         content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
-        return content or None
+        if not content:
+            print("[hermes_ai] [OPENROUTER] WARNING: Empty content in response")
+            return None
+       
+        print(f"[hermes_ai] [OPENROUTER] Success: Returning content (first 100 chars): {content[:100]}")
+        return content
+      
     except Exception as e:
-        print(f"[hermes_ai] OpenRouter exception: {e}")
+        end_time = time.time()
+        duration = end_time - start_time
+        print(f"[hermes_ai] [OPENROUTER] EXCEPTION after {duration:.2f} seconds: {e}")
+        traceback.print_exc()
         return None
 
 def ask_hermes_cli(user_message: str) -> Optional[str]:
@@ -107,16 +157,39 @@
             timeout=60
         )
         if result.returncode == 0:
-            return (result.stdout or "").strip() or None
+            output = (result.stdout or "").strip()
+            return output or None
         print(f"[hermes_ai] Hermes CLI failed: {result.stderr}")
         return None
     except Exception as e:
         print(f"[hermes_ai] Hermes CLI exception: {e}")
+        traceback.print_exc()
         return None
 
 def ask_hermes(user_message: str, wa_name: Optional[str] = None) -> Optional[str]:
+    start_time = time.time()
+    print(f"[hermes_ai] [ASK_HERMES] Request started at {start_time}")
+   
+    # Try OpenRouter first
     reply = ask_openrouter(user_message, wa_name=wa_name)
-    if reply:
+    if reply and reply.strip():
+        print(f"[hermes_ai] [ASK_HERMES] OpenRouter succeeded")
+        end_time = time.time()
+        print(f"[hermes_ai] [ASK_HERMES] Total time: {end_time - start_time:.2f} seconds")
+        return reply
+   
+    print(f"[hermes_ai] [ASK_HERMES] OpenRouter returned empty/None, falling back to Hermes CLI")
+    # Fallback to Hermes CLI
     reply = ask_hermes_cli(user_message)
-    return reply or None
\\ No newline at end of file
+    if reply and reply.strip():
+        print(f"[hermes_ai] [ASK_HERMES] Hermes CLI succeeded")
+        end_time = time.time()
+        print(f"[hermes_ai] [ASK_HERMES] Total time: {end_time - start_time:.2f} seconds")
+        return reply
+   
+    print(f"[hermes_ai] [ASK_HERMES] Both OpenRouter and Hermes CLI failed, using fallback message")
+    # Fallback message
+    fallback_msg = "Maaf, sistem sibuk sekejap. Untuk bantuan segera WhatsApp admin:\n+60 16-980 8736 (https://hafjetraub.wasap.my/)"
+    end_time = time.time()
+    print(f"[hermes_ai] [ASK_HERMES] Total time: {end_time - start_time:.2f} seconds")
+    return fallback_msg
```