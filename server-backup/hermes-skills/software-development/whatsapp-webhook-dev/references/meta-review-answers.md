# Meta Review Answers — Copy-Paste Ready

## whatsapp_business_messaging — Use Case Description

```
HAFJET is a mobile phone repair business in Malaysia. We use the WhatsApp Business API to operate an automated customer service chatbot that:

1. Responds to customer inquiries about repair pricing (screen, battery, charging port, etc.)
2. Provides real-time repair job status updates when customers send their job number
3. Shares store information (operating hours, location, contact)

The bot operates 24/7 and responds in Bahasa Malaysia. We need this permission to send automated text replies to customers who message our business number via the WhatsApp Cloud API.
```

## whatsapp_business_messaging — Data Usage

```
We process the customer's WhatsApp phone number (to route replies), display name (to personalize responses), and message content (to understand inquiries). Data is retained for max 30 days for debugging, then auto-deleted. We do not share data with third parties. All data is processed through Meta's WhatsApp platform in compliance with WhatsApp Business Terms.
```

## whatsapp_business_management — Use Case Description

```
We need this permission to manage our WhatsApp Business account programmatically, including:

1. Registering and verifying our business phone number
2. Subscribing our app to webhook events (messages) for real-time inbound message handling
3. Managing our WABA (WhatsApp Business Account) configuration

This is required for our chatbot to receive and respond to customer messages via the WhatsApp Cloud API.
```

## whatsapp_business_management — Data Usage

```
This permission is used for account management only — registering phone numbers, configuring webhooks, and managing subscriptions. No additional customer data is collected through this permission beyond what is already processed under whatsapp_business_messaging.
```
