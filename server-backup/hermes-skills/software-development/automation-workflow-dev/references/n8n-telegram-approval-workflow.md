# n8n Telegram Inline Keyboard Approval Workflow Pattern

Reusable pattern for content/action approval workflows via Telegram inline keyboard buttons.

## Core Pattern

```
Schedule Trigger → HTTP Request (generate) → Telegram Send (inline keyboard)
                                                    ↓
Telegram Trigger (callback_query) → Answer Callback Query → Switch (route by callback_data)
                                                               ├─ approve → Edit Message → HTTP Publish → Success
                                                               ├─ revise → Ask Revision Details
                                                               ├─ regen_* → Acknowledge
                                                               ├─ change_schedule → Ask New Time
                                                               ├─ reject → Ask Reason
                                                               └─ manual → Ask Instruction
```

## Critical: Switch Node Data Referencing in n8n

**THE PITFALL:** When you put a processing node (e.g., Answer Callback Query) between the Telegram Trigger and the Switch, the Switch node's input data is the processing node's output (API response `{ok: true}`), NOT the original callback_query data. Attempting `{{ $json.callback_query.data }}` in the Switch will fail because the current `$json` is the Answer Callback response.

**THE FIX:** Always reference the original Telegram Trigger output by node name in Switch conditions:

```
leftValue: ={{ $('Telegram Callback Trigger').item.json.callback_query.data }}
```

NOT:
```
leftValue: ={{ $json.callback_query.data }}   ← WRONG — sees Answer Callback output
```

This pattern (`$('NodeName').item.json.field`) works for any n8n node where an intermediate node transforms data and you need a field from earlier in the chain.

## Inline Keyboard JSON (5 rows, 10 buttons)

```json
{
  "inline_keyboard": [
    [
      {"text": "✅ Approve Option 1", "callback_data": "approve_1"},
      {"text": "✅ Approve Option 2", "callback_data": "approve_2"}
    ],
    [
      {"text": "✍️ Revise Option 1", "callback_data": "revise_1"},
      {"text": "✍️ Revise Option 2", "callback_data": "revise_2"}
    ],
    [
      {"text": "🔄 New Captions", "callback_data": "new_captions"},
      {"text": "🖼️ New Visual", "callback_data": "new_visual"}
    ],
    [
      {"text": "🔁 New Both", "callback_data": "new_both"},
      {"text": "📅 Change Schedule", "callback_data": "change_schedule"}
    ],
    [
      {"text": "❌ Reject Draft", "callback_data": "reject"},
      {"text": "💬 Manual Instruction", "callback_data": "manual_instruct"}
    ]
  ]
}
```

In n8n Telegram node (sendMessage operation), place the keyboard under:
- `additionalFields.reply_markup` — as a **JSON string** (not an object)

## Collecting User Text Input (force_reply)

For branches that need text input from the user (revise details, new schedule, reject reason, manual instruction), use `force_reply`:

```json
{
  "force_reply": true,
  "input_field_placeholder": "Taip arahan di sini..."
}
```

This forces the Telegram client into reply mode with a custom placeholder in the input field.

## Switch Node TypeVersion Compatibility

- n8n `switch` v3.2+ uses the `conditions.conditions[].operator` structure (not the older `dataPropertyName` + `string[]` format)
- Each rule value in the `rules.values[]` array maps to one output index (0-based)
- Use `combinator: "or"` to group multiple callback_data values to the same output
- Use `combinator: "and"` for single-condition rules
- Set `options.fallbackOutput` to an unconnected output index for unmatched callback_data

## Telegram Node Operations Used

| Operation | Resource | Key Fields |
|-----------|----------|------------|
| sendMessage | message | chatId, text, additionalFields.parse_mode, additionalFields.reply_markup |
| answerQuery | callbackQuery | callbackQueryId = `={{ $json.callback_query.id }}`, text |
| editMessageText | message | chatId, messageId, text (references original message from callback_query) |

## Malaysia Timezone (UTC+8) Cron Conversion

n8n schedule triggers use UTC. Convert Malaysia times by subtracting 8 hours:
- 12:25 PM MYT → `25 4 * * *` (04:25 UTC)
- 8:25 PM MYT → `25 12 * * *` (12:25 UTC)
- Combined: `25 4,12 * * *`

Set `settings.timezone: "Asia/Kuala_Lumpur"` in workflow JSON for display/execution timezone awareness.

## Workflow JSON Validation

After writing a workflow JSON:
```bash
python3 -m json.tool workflow.json > /dev/null && echo "Valid"
```

Verify completeness:
```python
import json
with open('workflow.json') as f:
    data = json.load(f)
node_names = {n['name'] for n in data['nodes']}
for src, targets in data['connections'].items():
    for out in targets['main']:
        for t in out:
            assert t['node'] in node_names, f"Missing: {t['node']}"
```
