# Click Normalization — Eye Icon Click Fix (v2.7→v2.8)

## Problem

SPX eye icon rendered as `svg.svg-icon.show-icon` inside a `<span>` wrapper.
Calling `svg.click()` throws `TypeError: eyeResult.element.click is not a function`
because SVG elements in some browsers lack the `.click()` method that HTMLElement has.

## Evolution

### v2.7 — Semantic Selector Climb (FAILED)

`normalizeClickable()` climbed up to 5 levels checking for:
- `button`, `a`, `[role="button"]`, `[tabindex]`, `.ant-btn`, `[onclick]`

**Result**: SPX wrapper was non-semantic `<span class="show-icon-wrapper">` with `cursor: pointer` but no `role`, `tabindex`, or `onclick` attribute. All semantic checks failed, returned raw SVG, crash persisted.

### v2.8 — Heuristic Clickable Detection (WORKING)

Added `isProbablyClickable()` with computed-style heuristics:

```javascript
function isProbablyClickable(el) {
    // …
    if (style.cursor === 'pointer') return true;        // ← catches SPX span wrappers
    if (/btn|button|icon|action|click|show/i.test(cls)) return true;
    // …
}
```

Climb extended to 10 levels. Now finds `<span class="show-icon-wrapper">` at level 1-2 via `cursor:pointer` heuristic.

### Synthetic Dispatch Fallback

If `normalizeClickable()` still returns raw SVG (no clickable ancestor within 10 levels),
fall back to synthetic MouseEvent dispatch:

```javascript
rawEl.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, view: window
}));
```

This works because SPX's React event delegation listens for bubbled click events on the root,
not on the specific SVG element.

## Debug Pattern — debugAncestors()

For the first masked row, log every ancestor level with clickable attribution:

```
L0 svg.svg-icon.show-icon | cursor="default" | tabindex="null" | clickable=false
L1 span.show-icon-wrapper | cursor="pointer" | tabindex="0" | clickable=TRUE ✅
L2 td.phone-cell           | cursor="default" | clickable=false
```

This immediately reveals whether the eye click will succeed and at which ancestor level the clickable element lives.

## Guard Pattern

Always check before clicking:
```javascript
if (!eyeResult.element || typeof eyeResult.element.click !== 'function') {
    // try synthetic dispatch
}
```