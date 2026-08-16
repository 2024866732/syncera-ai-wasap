# n8n Code node — runOnceForEachItem return shape (P0)

## Symptom
Execution fails at a Code node with:
```text
A 'json' property isn't an object [item 0]
```
Often right after an HTTP node with `continueOnFail: true` (e.g. image gen 502). Downstream **text fallback never runs**, so schedules look Active but Telegram is silent.

## Root cause
Code node mode **`runOnceForEachItem`** must return a **single item object**:

```javascript
// CORRECT
return {
  json: {
    field: value,
  }
};
```

**Wrong** (common copy-paste from “all items” examples):

```javascript
// WRONG for runOnceForEachItem
return [{
  json: {
    field: value,
  }
}];
```

n8n then treats the array element incorrectly → validation error above.

## Mode cheat-sheet
| Mode | Return |
|------|--------|
| `runOnceForEachItem` | One object: `{ json: {...}, binary?: {...} }` |
| `runOnceForAllItems` | Array: `[{ json: {...} }, ...]` |

## Merge pattern after HTTP continueOnFail (HAFJET Content)

When previous HTTP may be success JSON **or** error-shaped:

```javascript
function asObj(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  return {};
}

let content = {};
try { content = asObj($('Generate Content').item.json); } catch (e) { content = {}; }

let img = asObj($json);
if (img.error && typeof img.error === 'object') {
  img = Object.assign({}, img, asObj(img.error));
}

const hasImage = !!(img.success === true && img.image_url);

return {
  json: {
    // always emit full content fields for text path
    topic: content.topic || '',
    caption_1: content.caption_1 || '',
    caption_2: content.caption_2 || '',
    hashtags_1: content.hashtags_1 || '',
    hashtags_2: content.hashtags_2 || '',
    visual_prompt: content.visual_prompt || content.visualPrompt || '',
    image_success: hasImage,
    image_url: hasImage ? String(img.image_url) : '',
    image_error: hasImage ? '' : String(img.detail || img.message || 'image_failed').slice(0, 500),
  }
};
```

Then IF `image_success` → download + sendPhoto; else → sendMessage text + keyboard.

## HAFJET nodes that must use this shape
- `Merge Content + Image`
- `Merge New Captions`
- `Merge New Visual`

## Live audit tip
If last executions stop at Merge and never hit `Send Draft *`, check Code return shape first — before blaming Telegram or schedule.