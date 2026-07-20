# Device-side provisioning (from in-repo docs/firmware-setting.md)

The vendor DIY wiki (Feishu) is login-walled. Use this instead.

## Prerequisites
- Device firmware >= v1.6.1 (supports custom OTA server).
- xiaozhi-server already running; note the OTA address it prints on startup
  (form: `http://<ip-or-domain>:8002/xiaozhi/ota/`).

## Steps (done on the phone, connected to device hotspot)
1. Connect phone to the device's Wi-Fi hotspot (e.g. `ZUOWEI-70DD`).
2. Open the device config portal in a browser: `http://192.168.4.1`.
3. Enter **network-config / 配网模式**.
4. At the top of the page click **Advanced options (高级选项)**.
5. Enter your server's **OTA address** (from server startup log) → Save.
6. Restart the device. It registers with your server and uses your LLM.

## Verify
- Server log should show the device connecting and "OTA接口运行正常".
- Wake the device ("你好小智" / custom wake word) and check it replies.

## Common issues (from repo FAQ)
- Replies show Korean/Japanese/English → ASR language config / device language.
- "TTS 任务出错 文件不存在" → TTS provider misconfigured (check edge voice name).
- TTS times out often → `tts_timeout` too low (default 10s) or provider slow.
- Wi-Fi reaches server but 4G doesn't → NAT/port-forward only covers Wi-Fi path.
