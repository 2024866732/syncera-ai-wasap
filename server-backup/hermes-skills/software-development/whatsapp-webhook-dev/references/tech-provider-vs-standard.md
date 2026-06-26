# Tech Provider vs Standard App — Decision Guide

## Overview

Meta offers two paths for WhatsApp Business API apps:

| Path | Description | Use Case |
|------|-------------|----------|
| **Standard App** | Your own business's WhatsApp bot | WhatsApp Bot untuk satu business |
| **Tech Provider** | Manage multiple clients' WhatsApp accounts | Offer WhatsApp Bot service to clients |

## Decision Tree

```
Nak handle WhatsApp untuk multiple clients?
├── YA → Tech Provider (onboarding more complex)
│     - Requires video documentation
│     - Messaging: record video showing app sending message to user
│     - Management: record video showing template creation via API
│     - Advanced access required for client management
│     - Embedded Signup optional (surfaces signup form on your website)
└── TIDAK → Standard App (simpler, faster to approve)
      - Just review → approve → live
      - No video docs required
      - Enough for single business use
```

## Tech Provider Requirements (Additional)

1. **Business Verification** — usually auto-approved for registered businesses
2. **Video Documentation:**
   - `whatsapp_business_messaging`: Record screen showing app sending outbound message + recipient's WhatsApp receiving it
   - `whatsapp_business_management`: Record screen/API call showing message template creation
3. **App Review** — same as standard plus video evidence
4. **Embossed Signup** (optional) — for clients to sign up via your website

## Standard App Path

1. Submit app review (icon + privacy + category)
2. Add `whatsapp_business_messaging` + `whatsapp_business_management` permissions
3. Wait approval (typically 3-7 days)
4. Toggle Live → done

## Recommendation

For a **repair shop WhatsApp bot** (single business), always choose **Standard App** unless you plan to resell the service to other businesses.

## Common Confusion

The Meta dashboard sometimes shows "Tech Provider" messaging even for standard apps. This is UI copy — you do NOT need to complete Tech Provider onboarding unless you specifically need the Tech Provider features.
