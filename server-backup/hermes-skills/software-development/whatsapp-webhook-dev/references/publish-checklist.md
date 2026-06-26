# Meta App Publish Checklist — Development to Live

## Requirements for Going Live

### 1. Privacy Policy URL (REQUIRED)
- Generate HTML using `templates/privacy-policy.html` — replace `[COMPANY_NAME]`, `[SHOP_PHONE]`, `[CONTACT_EMAIL]`
- Must include: data collected, purpose, retention, third-party sharing (Meta only), PDPA 2010 mention, contact info
- **Host on GitHub Pages** (fastest free option, proven workflow):
  1. Create repo: `gh repo create <name> --public --clone=false`
  2. Clone, add `index.html`, commit, push to main
  3. Enable Pages via API:
     ```bash
     gh api repos/{owner}/{repo}/pages -X POST -f "source[branch]=main" -f "source[path]=/"
     ```
  4. URL: `http://[username].github.io/[repo-name]/` (propagation takes ~1-5 min)
  5. Verify: `gh api repos/{owner}/{repo}/pages -X GET` → `status: "built"`
- **Alternative:** Any public URL (your website, etc.)

### 2. App Settings (REQUIRED)
- App icon: 1024x1024 PNG
- App category: **Messaging** (NOT Business — WhatsApp bots fall under Messaging category)
- Support email: valid email address
- Terms of Service URL: optional but recommended (can reuse Privacy Policy URL)

### 2a. Data Deletion URL (REQUIRED)
- Meta requires a **Data Deletion Instruction URL** showing users how to request data deletion
- Can be the same page as Privacy Policy with a dedicated section (e.g., section "Data Deletion")
- Must include: how to contact (WhatsApp/email), retention/deletion timeline (e.g., 30 days), confirmation process
- **Optional:** Data Deletion Callback URL (POST endpoint that Meta calls to trigger deletion — for advanced use)
- See `templates/privacy-policy.html` — includes a Data Deletion section template

### 3. Advanced Access / Permissions (REQUIRED)
Request in App Dashboard → Permissions:
- `whatsapp_business_messaging` — for sending replies
- `whatsapp_business_management` — for account management

Use concise business-focused descriptions (see meta-review-answers.md).

### 4. Business Verification (SOMETIMES REQUIRED)
- Check: https://business.facebook.com/settings/security/
- If "Unverified": upload SSM/registration certificate
- May be required before Meta approves Advanced Access

### 5. Subscribe App to WABA
```bash
# Use WABA ID, NOT Phone Number ID
curl -s -X POST "https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"

# Verify
curl -s "https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Toggle Live
- Dashboard → App Mode (top banner) → Development → Live
- If rejected, Meta shows the missing requirement

## Workaround While Waiting for Live Approval

### Add Tester (Development Mode Testing)
**⚠ REQUIRES Facebook Developer Account** — personal Facebook accounts are rejected with "A Facebook Developer Account is required."

If Tester addition fails, the only path to test real inbound messages is completing Publish requirements and toggling Live.

## Common Mistakes
- Using Phone Number ID instead of WABA ID for `subscribed_apps`
- Not verifying model availability before deploying AI integration
- Using `load_dotenv(override=True)` in Azure (destroys platform-injected env vars)
- Not having a default fallback response when AI fails
- **Wrong app category:** Selecting "Business" instead of "Messaging" for WhatsApp bots
- **Missing Data Deletion URL:** Meta requires this alongside Privacy Policy — include a Data Deletion section in your privacy policy page
- **"Currently Ineligible for Submission" error:** Meta checks ALL required fields before allowing submission. Common missing items: App icon (must be 1024x1024), Privacy Policy URL, Category. Fill ALL three before attempting to submit.
- **DPO (Data Protection Officer) section:** Only REQUIRED if you have a physical office/presence in the EU or target EU users. For Malaysia-based apps targeting Malaysian users, this section can be skipped.
