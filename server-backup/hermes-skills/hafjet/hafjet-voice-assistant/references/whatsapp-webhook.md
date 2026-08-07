# WhatsApp Cloud API Webhook — Voice Note Flow

## Endpoint
```
POST /api/v1/webhook/whatsapp
```

## Incoming Payload (Form Data)

| Field | Description | Example |
|-------|-------------|---------|
| `Body` | Text message (if any) | "HAFJET, berapa stock?" |
| `MediaUrl0` | Voice note download URL | "https://mmg.whatsapp.net/..." |
| `MediaContentType0` | MIME type | "audio/ogg; codecs=opus" |
| `From` | Sender (with prefix) | "whatsapp:+60198021500" |
| `MessageSid` | Message ID | "SMxxxxxxxxxxxx" |

## Processing Flow

```
1. Receive webhook
   │
   ├─► Has MediaUrl0 + audio/* content type?
   │     │
   │     ├─► YES: Download media (Bearer WHATSAPP_TOKEN)
   │     │     │
   │     │     ├─► Convert ogg/opus → WAV (ffmpeg: 16kHz mono)
   │     │     │
   │     │     ├─► Process via voice_assistant.process_voice()
   │     │     │
   │     │     └─► Get response text
   │     │
   │     └─► NO: Check Body for text
   │           │
   │           └─► Process via voice_assistant.process_text()
   │
   └─► Send reply via WhatsApp API
         │
         └─► POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
             Headers: Authorization: Bearer {WHATSAPP_TOKEN}
             Body: {messaging_product: "whatsapp", to: "{from}", type: "text", text: {body: "{response}"}}
```

## Required Environment Variables

```bash
WHATSAPP_TOKEN=your_cloud_api_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token  # For GET verification
```

## ffmpeg Conversion Command

```bash
ffmpeg -y -i input.ogg -ar 16000 -ac 1 -c:a pcm_s16le output.wav
```

- `-ar 16000`: 16kHz sample rate (Whisper optimal)
- `-ac 1`: Mono channel
- `-c:a pcm_s16le`: PCM 16-bit little-endian (WAV)

## Error Handling

| Error | Action |
|-------|--------|
| Download failed (401/403) | Log, send "Ralat sistem" reply |
| ffmpeg conversion failed | Log, send "Ralat sistem" reply |
| STT empty transcription | Send "Tiada audio dikesan" reply |
| Supabase unavailable | Use fallback templates (no DB data) |
| WhatsApp send failed | Log error, don't crash |

## Testing Locally

```bash
# Simulate webhook with ngrok
ngrok http 8090
# Configure Meta webhook URL: https://xxx.ngrok.io/api/v1/webhook/whatsapp
```

## Security

- Verify `X-Hub-Signature-256` header (HMAC-SHA256 of payload with app secret)
- Validate `WHATSAPP_VERIFY_TOKEN` on GET request
- Rate limit per phone number