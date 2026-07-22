# Import Cross-Reference Verification

## The Pitfall (discovered Jul 2026, Sprint B deploy)

A full Sprint B deploy (`9ceb0dd`) reached `RuntimeSuccessful` — but the
knowledge CRUD endpoints returned `NameError: name 'add_knowledge_item' is not
defined`. Root cause: the Phase 1 `ai_knowledge_items` API endpoints were added
to `webhook_listener.py`, but the corresponding `from db_logger import ...`
statement was never updated. Azure's Oryx build doesn't catch import errors
until the endpoint is actually called at runtime.

## Pre-Deploy Import Check

Before any build+deploy, run this cross-reference:

```bash
cd ~/.hermes/whatsapp-bot

# Extract ALL function references in API endpoint blocks
echo "=== Functions used in webhook_listener.py API endpoints ==="
grep -oP 'await loop\.run_in_executor\(None, \K[a-zA-Z_]+' webhook_listener.py \
  | sort -u > /tmp/used_functions.txt
cat /tmp/used_functions.txt

# Extract ALL imported function names from db_logger
echo ""
echo "=== Functions imported from db_logger ==="
sed -n '/^from db_logger import (/,/^)/p' webhook_listener.py \
  | grep -v 'from db_logger import' | grep -v '^)' \
  | sed 's/^[[:space:]]*//; s/,$//; s/as.*$//' \
  | grep -oP '^\K[a-zA-Z_]+' \
  | sort -u > /tmp/imported_functions.txt
cat /tmp/imported_functions.txt

# Cross-reference
echo ""
echo "=== MISSING from imports (WILL fail at runtime) ==="
comm -23 /tmp/used_functions.txt /tmp/imported_functions.txt
```

If the third block prints ANY output, those functions will cause runtime errors.
**Fix the import block before building the ZIP.**

## What to add

When adding new Phase/Sprint API endpoints to `webhook_listener.py`, you
MUST simultaneously add their function names to the `from db_logger import (`
block at the top of the file. Common pattern:

```python
# In the import block (lines ~50-82):
from db_logger import (
    # ... existing imports ...
    add_knowledge_item, get_knowledge_item, list_knowledge_items,
    update_knowledge_item, delete_knowledge_item, search_knowledge_items,
    upsert_memory, get_customer_memory_as_dict, get_memory_field,
    list_memory_fields, delete_customer_memory, delete_memory_field,
    count_memory_fields,
    create_keyword_v2, update_keyword_v2, delete_keyword_v2,
    list_keyword_rules_v2, get_keyword_rule_v2, match_keyword_v2,
    get_or_create_sequence_state, advance_sequence, reset_sequence,
)
```

## Regression test tip

After fixing imports and redeploying, re-run the same endpoint that failed:

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('/tmp/login.json'))['access_token'])")

# Test CREATE
curl -s -X POST "https://.../api/knowledge" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","content":"Test content","content_type":"text"}' \
  -o /tmp/test_create.json
python3 -c "import json; d=json.load(open('/tmp/test_create.json')); print('OK' if d.get('id') else 'FAIL:', d)"

# Test SEARCH
curl -s "https://.../api/knowledge/search?q=test" \
  -H "Authorization: Bearer $TOKEN" \
  -o /tmp/test_search.json
python3 -c "import json; d=json.load(open('/tmp/test_search.json')); print(f'Results: {len(d.get(\"results\",[]))}')"
```

## Why this pattern exists

The import block and the API endpoints were added in SEPARATE patching steps
(even separate commits in some sessions). This creates a window where the
endpoint exists but the import doesn't. The cross-reference grep above catches
it before the ZIP leaves your workstation.
