# Testing — Samra Pay Design System

This document describes the test suite, how to run tests, and test results.

---

## Test Suite Overview

Tests use the Node.js built-in test runner (`node:test` + `node:assert`). No additional test framework is needed.

| Test file | Description |
|-----------|-------------|
| `src/tests/tokens.test.mjs` | Token structure, alias resolution, required groups |
| `src/tests/contrast.test.mjs` | WCAG AA contrast for all color pairs |
| `src/tests/a11y.test.mjs` | Accessibility token values |
| `src/tests/docs.test.mjs` | Required docs exist, no broken `.md` links |

## Running Tests

```bash
# All tests
pnpm test

# Accessibility tests only
pnpm test:a11y

# Individual test file
node --test src/tests/tokens.test.mjs
```

---

## Test Results

Results recorded after Phase 11 implementation. See "Latest Run" below.

### Latest Run

```
tokens.test.mjs:
  ✅ tokens.json is valid JSON
  ✅ Required top-level groups are present (color, typography, textStyle, interaction, layout, motion, elevation, status)
  ✅ Generated tokens.tsx starts with GENERATED comment
  ✅ Generated semantic-tokens.tsx starts with GENERATED comment
  ✅ All color alias references resolve

contrast.test.mjs:
  ✅ [light] background/foreground: 17.27:1 (≥ 4.5)
  ✅ [light] card/cardForeground: 18.21:1 (≥ 4.5)
  ✅ [light] primary/primaryForeground: 8.53:1 (≥ 4.5)
  ✅ [light] secondary/secondaryForeground: 15.38:1 (≥ 4.5)
  ✅ [light] muted/mutedForeground: 4.98:1 (≥ 4.5)
  ✅ [light] accent/accentForeground: 5.07:1 (≥ 4.5)
  ✅ [light] destructive/destructiveForeground: 5.93:1 (≥ 4.5)
  ✅ [light] coffee/coffeeForeground: 6.86:1 (≥ 4.5)
  ✅ [light] berbere/berbereForeground: 5.46:1 (≥ 4.5)
  ✅ [light] eucalyptus/eucalyptusForeground: 5.69:1 (≥ 4.5)
  ✅ [light] injera/injeraForeground: 8.81:1 (≥ 4.5)
  ✅ [dark] background/foreground: 18.16:1 (≥ 4.5)
  ✅ [dark] card/cardForeground: 17.58:1 (≥ 4.5)
  ✅ [dark] primary/primaryForeground: 8.53:1 (≥ 4.5)
  ✅ [dark] secondary/secondaryForeground: 15.96:1 (≥ 4.5)
  ✅ [dark] muted/mutedForeground: 7.34:1 (≥ 4.5)
  ✅ [dark] accent/accentForeground: 8.51:1 (≥ 4.5)
  ✅ [dark] destructive/destructiveForeground: 8.05:1 (≥ 4.5)
  ✅ [dark] coffee/coffeeForeground: 4.71:1 (≥ 4.5)
  ✅ [dark] berbere/berbereForeground: 5.04:1 (≥ 4.5)
  ✅ [dark] eucalyptus/eucalyptusForeground: 5.64:1 (≥ 4.5)
  ✅ [dark] injera/injeraForeground: 11.31:1 (≥ 4.5)

a11y.test.mjs:
  ✅ interaction.touchTarget.ios >= 44
  ✅ interaction.touchTarget.android >= 48
  ✅ All status entries have textRequired: true
  ✅ Every status entry has accessibilityNote
  ✅ interaction.disabledOpacity <= 0.5
  ✅ interaction.pressedOpacity < 1.0

docs.test.mjs:
  ✅ docs/current-state-audit.md exists
  ✅ docs/financial-ui-truth.md exists
  ✅ docs/accessibility.md exists
  ✅ docs/content-and-voice.md exists
  ✅ docs/semantic-tokens.md exists
  ✅ docs/asset-rights.md exists
  ✅ docs/AGENTS.md exists
  ✅ docs/references/native-component-inventory.md exists
  ✅ CHANGELOG.md exists
  ✅ No broken .md component references found in docs/
```

---

## Platform Limitations

The following accessibility and visual claims are based on specification only and require physical device validation:

- VoiceOver behavior on iOS (requires iPhone/iPad with VoiceOver enabled)
- TalkBack behavior on Android (requires Android device with TalkBack enabled)
- Dynamic Type scaling at maximum size (requires iOS device)
- Android font size at maximum scale (requires Android device)
- Noto Serif Ethiopic rendering on real device keyboards/fonts
- BottomSheet PanResponder behavior on actual touch screens
- Toast positioning on notched / Dynamic Island devices
- Reduced motion behavior on iOS and Android system settings
- Contrast appearance on OLED vs LCD displays at various brightness levels

---

## Future Test Additions

See `docs/open-decisions.md` for pending decisions on:
- Status token contrast validation (new hex values not yet WCAG-tested programmatically)
- Native component snapshot tests
- Visual regression tests for web components
