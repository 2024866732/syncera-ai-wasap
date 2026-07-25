# Container Scoring Algorithm — Detailed Reference

## Problem

SPX Self-Collection portal renders:
- Header row: inside a `<table>` tag (with `<thead>` or first `<tr>`)
- Data rows: in a **separate, virtualized container** (div-based, often `.ant-table-body`, sibling to the header table)

When `querySelectorAll('tr')` is scoped to the header `<table>`, only the header row is found. Data rows live in a sibling div. The challenge is finding WHICH div.

## Naive Approach (v2.4 — FAILED)

Walk up `parentElement` and return the **first** element matching a container clue like `[class*="table" i]`. This almost always matches the **header wrapper** first (e.g., `div.ssc-table-header-scroll-bar-wrapper`) because it's closer to the table in the DOM tree.

## Scoring Approach (v2.5 — WORKING)

### Step 1: Collect Candidates

From the header `<table>`, collect all potential container elements:

1. **Parent chain (8 levels)**: For each ancestor, check if it matches any `CONTAINER_CLUES`. Also check siblings of those ancestors.
2. **closest()**: For each clue, call `table.closest(clue)`.
3. **Fallback**: Add `document`.

All candidates go into a deduplicated set.

### Step 2: Score Each Candidate

For each candidate container `el`, compute:

```
score = 0

For each row selector {sel, pts}:
    rows = el.querySelectorAll(sel)
    for each row in rows:
        if row !== headerRow:
            validCount++
            if hasTrackingNumber(row): hasSPXMY = true
    score += validCount * pts

if hasSPXMY: score += 30

for each PENALTY_PATTERN in [header, scroll-bar, scrollbar, thead, sticky, fixed, shadow, placeholder, filter, pagination]:
    if safeClassName(el).toLowerCase().includes(pattern):
        score -= 30
```

### Step 3: Pick Highest

Sort candidates by score descending. The top candidate is the data row container.

### Step 4: Debug Output

Show top 5 candidates with:
- Tag + class name
- Score, row count, SPXMY presence, penalty
- Per-selector hit counts
- Source (how it was found)

### Selector Points Table

| Selector | Points per row |
|----------|---------------|
| `tr[data-row-key]` | 20 |
| `tr.ant-table-row` | 15 |
| `.ant-table-tbody tr` | 10 |
| `[role="row"]` | 8 |
| `tbody tr` | 6 |
| `[class*="row" i]` | 5 |
| `tr` | 1 |

### Penalty Patterns

Container className containing any of these gets -30 per match:
`header`, `scroll-bar`, `scrollbar`, `thead`, `sticky`, `fixed`, `shadow`, `placeholder`, `filter`, `pagination`

### Worked Example

Real SPX DOM structure:
```
document
  └── div.app
       └── div.ssc-table (header table wrapper)
       │    └── div.ssc-table-header-scroll-bar-wrapper  ← CANDIDATE A
       │         └── table
       │              └── thead → header row
       └── div.ant-table-body                           ← CANDIDATE B
            └── table
                 └── tbody
                      └── tr[data-row-key] × 25          ← data rows!
```

Scoring:
- **A**: `[class*="row"]` = 1 row (header) → +5. Penalty "scroll-bar" → -30. Score = **-25**
- **B**: `tr[data-row-key]` = 25 rows → +500. SPXMY bonus +30. No penalty. Score = **+530**

B wins. Container selected: `div.ant-table-body`.
