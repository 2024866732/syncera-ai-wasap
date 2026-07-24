# YouCam API (Perfect Corp)

AI image/beauty effects API — beautify photos, virtual try-on, skin analysis, hair styling, jewelry try-on, and generative AI image transformations.

## Base Info

| Item | Value |
|------|-------|
| **Base URL** | `https://yce-api-01.perfectcorp.com` |
| **Auth** | Bearer token — set via `YOUCAM_API_KEY` env var |
| **Request format** | Multipart form data (`multipart/form-data`) — image file + params |
| **Response** | Image bytes (if Content-Type starts with `image/`) or JSON with base64-encoded image in `image`/`result_image` field |
| **API Key format** | `sk-*` prefixed |
| **Key file** | Store in `~/.hermes/.env` as `YOUCAM_API_KEY=sk-...` |
| **Public key** | Provided separately for signature verification (RSA 1024-bit) |

## Endpoints

| Method | Path | Function | Params |
|--------|------|----------|--------|
| `POST` | `/skin-analysis` | Analyse skin moisture, clarity, firmness, undertone | — |
| `POST` | `/ai-makeup-transfer` | Apply AI makeup look | `look` (string, e.g. `everyday_glow`) |
| `POST` | `/ai-hairstyle` | Change hairstyle | `style` (string, e.g. `natural_blowout`) |
| `POST` | `/earrings-tryon` | Virtual earrings try-on | `style_family` (string) |

More endpoints are available — discover via the [YouCam API Portal](https://yce.perfectcorp.com/).

## Authentication

```env
# ~/.hermes/.env
YOUCAM_API_KEY=sk-PFi...
```

All requests use `Authorization: Bearer <API_KEY>` header.

## Python Call Pattern

```python
import requests

BASE = "https://yce-api-01.perfectcorp.com"
API_KEY = "sk-..."  # read from env or .env file

def youcam_call(endpoint, image_bytes, params=None):
    """Call YouCam API with an image."""
    headers = {"Authorization": f"Bearer {API_KEY}"}
    files = {"image": ("input.png", image_bytes, "image/png")}
    data = params or {}
    
    resp = requests.post(
        f"{BASE}/{endpoint.lstrip('/')}",
        headers=headers,
        data=data,
        files=files,
        timeout=60,
    )
    resp.raise_for_status()
    
    content_type = resp.headers.get("Content-Type", "")
    if content_type.startswith("image/"):
        return {"image_bytes": resp.content, "data": {}}
    
    payload = resp.json()
    image_b64 = payload.get("image") or payload.get("result_image")
    if image_b64:
        import base64
        return {"image_bytes": base64.b64decode(image_b64), "data": payload}
    return {"image_bytes": None, "data": payload}

# Usage
with open("selfie.jpg", "rb") as f:
    img = f.read()

# Skin analysis
result = youcam_call("skin-analysis", img)
print(result["data"])  # moisture, clarity, firmness, undertone

# Makeup transfer
result = youcam_call("ai-makeup-transfer", img, {"look": "everyday_glow"})
with open("output.png", "wb") as f:
    f.write(result["image_bytes"])
```

## Response Format

**Image response:** Content-Type `image/png` or `image/jpeg` — raw image bytes returned directly.

**JSON response:**
```json
{
    "image": "<base64-encoded result image>",
    "confidence": 0.95,
    "moisture": 75,
    "clarity": 68,
    "firmness": 72,
    "undertone": "warm"
}
```

The `image` or `result_image` field contains the base64-encoded output image.

## Unit-Based Billing

YouCam API uses a unit-based credit system:
- Each API call consumes a fixed number of units
- Units are purchased in bulk
- Monitor usage via the YouCam API portal

## Known Endpoint Variants

The API uses kebab-case paths in the REST API (`/ai-makeup-transfer`) but some client libraries reference them with snake_case (`ai_makeup_transfer`). The REST API accepts only kebab-case.

## See Also

- [YouCam API Portal](https://yce.perfectcorp.com/) — dashboard, key management, usage
- Official docs (login required): https://yce.perfectcorp.com/api/docs
- GitHub example project: https://github.com/MukundaKatta/perfectcorp-tryon-concierge
