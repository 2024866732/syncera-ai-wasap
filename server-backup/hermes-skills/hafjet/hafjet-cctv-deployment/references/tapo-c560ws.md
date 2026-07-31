# Tapo C560WS — Pre-Purchase Evaluation Notes

**Model**: TP-Link Tapo C560WS (4K 8MP Outdoor Pan/Tilt Wi-Fi Camera)

**Source context**: E-commerce screenshots (Shopee-style listings + app demo carousel) shared by Tuan Hafizi while considering purchase of a camera with AI Facial Recognition capability (July 2026).

## Core Specs & Features (from listings)
- **Resolution**: 4K 8MP for sharper detail (license plates, faces, moving objects)
- **Zoom**: 18× digital zoom + F1.6 aperture
- **Coverage**: Pan/Tilt (full 360° protection)
- **AI Capabilities**:
  - AI Facial Recognition (free, powerful local AI)
  - Local processing only — "All facial data is processed locally without cloud uploads, ensuring privacy and security."
  - Auto-tagging: Familiars (family/friends) vs Strangers
  - Person / Pet / Vehicle detection
- **App Features**:
  - Face Management & Report: Manage familiars, view recognition distribution in past days (bar charts: e.g. 2 familiars & 3 strangers in 7 days)
  - Activity Center: Track specific person/pet clips + activity time heatmaps
  - Smart Playback: Filter events by face type or timeline
  - Familiar gallery with counts; strangers auto-deleted after 90 days (privacy)
  - Live view overlays with name tags + bounding boxes
- **Other**: Wi-Fi (dual-band/Wi-Fi 6 mentioned in official claims), outdoor rated, continuous monitoring, local + cloud storage options.

## Pricing (MYR market, as seen in screenshots)
- From **RM224.40** (42% discount from RM389.00)
- Limited-time offers noted
- PayLater / installment: RM18.70 × 12
- Additional promos: 20% off max RM120, 0% installment fees, 15% coins, etc.
- Seller: TP-Link Flagship Store (high volume, 1200+ sold, 4.9 rating)

## Integration / HAFJET Relevance
- Potential newer alternative or complement to existing Tapo TC74 used in hafjet-cctv-worker (RTSP).
- **Advantage**: On-device/local AI facial recognition + tagging may reduce false positives and server-side compute compared to current MobileNet-SSD person detection.
- **Privacy win**: Local face data aligns with HAFJET preference for on-prem / private processing.
- **Questions to validate before buy**:
  - Does it expose usable RTSP streams (main + sub) like TC74?
  - Can face tags or events be accessed via local API / ONVIF / RTSP metadata for worker ingestion?
  - Night vision / low-light performance vs current setup.
  - Power, mounting, Wi-Fi range for shop/entrance use.
- Recommended workflow: After purchase → test RTSP connectivity first (see pre-flight in main skill) → compare detection quality offline using snapshots before full worker integration.

## Official Claims Cross-Check (summary from product pages)
- "Accurate Facial Recognition, Easy Identification, Local AI Processing"
- "Zoom In, See More" with 18× + F1.6
- "4K: Unmatched Clarity, Extended Range"
- Smart features reduce notifications to relevant ones only.

**Update this file** with real-world test results (RTSP URLs, face data access, actual accuracy on HAFJET premises) once hardware is acquired and tested.

See main SKILL.md for RTSP integration patterns and the "Testing Methodology (sequential)" section.

## Related Camera Notes
Current production: Tapo TC74 (stream1/2, ~167s RTSP session timeout handled by auto-reconnect).
This C560WS appears positioned as a higher-spec upgrade with built-in AI.
