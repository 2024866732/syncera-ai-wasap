# Meta App Category Selection for WhatsApp Bots

## Correct Category: **Messaging**

When publishing a WhatsApp Business bot on Meta Developer Portal, the correct category is **Messaging**, NOT Business.

### Available Categories (as of 2026)
- Business and pages
- Community & government
- Education
- Entertainment
- Games
- Lifestyle
- **Messaging** ← WhatsApp bots
- Messenger bots for business → Facebook Messenger bots only
- News
- Quizzes and horoscopes
- Shopping

### Why Messaging?
WhatsApp Business API apps primarily function as messaging applications (sending/receiving messages). Meta routes the app review to the team that handles WhatsApp Business integrations when "Messaging" is selected.

### Common Mistake
Selecting "Business" because it sounds correct for a business app. But "Business" category in Meta's ecosystem refers to Facebook Pages management, not WhatsApp messaging.

### Required Fields for Submission
When category is selected, Meta requires:
1. **App icon** (1024x1024) — must be uploaded successfully
2. **Privacy Policy URL** — must be a valid public URL
3. **Category** — must be selected before submission is enabled

If any of these are missing, the app shows "Currently Ineligible for Submission" error.

### Data Deletion URL
Meta also requires a **Data Deletion Instruction URL**. This can be the same as the Privacy Policy URL with a dedicated Data Deletion section included in the page.
