---
name: Expo preview test routing
description: Testing limitations when validating an Expo artifact alongside a root web artifact.
---

The browser-testing agent may route an Expo flow through the shared web preview even when given the direct Expo preview URL. If its error trace references a sibling web artifact while the direct Expo screenshot renders normally, treat the result as a test-target routing issue rather than an Expo screen failure.

**Why:** Expo artifacts bypass the shared proxy, while the browser-testing environment can retain the web artifact's routing context.

**How to apply:** Use the direct Expo preview returned by the screenshot tool to confirm rendering. Keep application validation in unit/type checks, and distinguish a web-artifact error overlay from an actual Expo failure when reporting any blocked interactive test.