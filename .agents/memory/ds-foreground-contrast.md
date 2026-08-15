---
name: DS foreground contrast rule
description: Every background/foreground token pair in the Samra Pay DS must pass WCAG AA (4.5:1) in both modes.
---

Every `<color>` / `<color>Foreground` pair in `tokens.json` must hit ≥4.5:1 contrast in BOTH light and dark modes before shipping.

**Why:** Colors "lifted for dark surfaces" easily land in a mid-luminance dead zone where neither a dark nor a light foreground passes AA.

**How to apply:** When adding or adjusting any color token pair, verify WCAG contrast in both modes; prefer nudging the background lighter/darker over swapping the foreground's polarity.
