# ElevenLabs Quota Exhaustion Reference

## Error transcripts from 2026-07-14 session

### Error 1: Crediti tinggal sikit tapi teks panjang
```
status_code: 401
body: {
  'detail': {
    'type': 'invalid_request',
    'code': 'quota_exceeded',
    'message': 'This request exceeds your quota of 10000. You have 59 credits 
                remaining, while 94 credits are required for this request.',
    'status': 'quota_exceeded',
    'request_id': '2cf9c8808b263b6b41c9394bd1ddac96'
  }
}
```
- Text length: ~150 characters (~30 words)
- Had 59 credits, needed 94 → text too long for remaining budget

### Error 2: After one short test (credits dropped from 59→10)
```
status_code: 401
body: {
  'detail': {
    'type': 'invalid_request',
    'code': 'quota_exceeded',
    'message': 'This request exceeds your quota of 10000. You have 10 credits 
                remaining, while 65 credits are required for this request.',
    'status': 'quota_exceeded',
    'request_id': '48591376082cd6bec97e1248270c663d'
  }
}
```
- Text length: ~74 characters ("Assalamualaikum Tuan Hafizi. Ambo Hermes. Guna ElevenLabs Rachel.")
- Had 10 credits, needed 65 → insufficient
- The short test ("Ambo", 4 chars) cost 49 credits minimum

## Credit consumption pattern

| Test text | Character count | Credits consumed | Notes |
|-----------|----------------|-----------------|-------|
| "Ambo" | 4 chars | 49 credits | Minimum per-request cost |
| "Assalamualaikum Tuan..." | 74 chars | 65 credits required | ~0.88 credits/char |
| Longer text | ~150 chars | 94 credits required | ~0.63 credits/char |

**Pattern:** Base cost ~49 credits + per-character cost. The `eleven_multilingual_v2` model has a significant fixed cost per request.

## Detection and response flow

1. Attempt `text_to_speech` with ElevenLabs
2. If `quota_exceeded` in error body:
   - Check `remaining` vs `required` in the message
   - If remaining > 0 but < required → can still send VERY short texts
   - If remaining == 0 → trial fully exhausted
3. Action: Switch to Edge TTS fallback
   ```
   hermes config set tts.provider edge
   hermes config set tts.edge.voice ms-MY-YasminNeural
   ```
4. Verify: Run `text_to_speech` with a short Malay test → should return `provider: edge` with `success: true`
