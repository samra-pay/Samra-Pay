# Accessibility Standards — Samra Pay Design System

> **Platform Limitation Notice:** Physical iOS and Android device validation cannot be performed in this environment. All claims are based on design-system specifications and must be validated on real devices before release. Screen-reader behavior (VoiceOver on iOS, TalkBack on Android) must be verified on actual hardware.

---

## 1. Contrast Requirements (WCAG 2.1 AA)

**Minimum: 4.5:1 for normal text, 3:1 for large text (≥ 18pt regular or ≥ 14pt bold).**

All palette pairs in the design system pass WCAG AA contrast at both light and dark modes. This is enforced by `scripts/build-tokens.mjs` which runs contrast validation on every token build.

Validated pairs and their ratios (dark mode — canonical):

| Background | Foreground | Ratio | Pass |
|-----------|-----------|-------|------|
| background (#0a0a0a) | foreground (#f5f5f5) | 18.16:1 | ✅ |
| primary (#d4af37) | primaryForeground (#171717) | 8.53:1 | ✅ |
| card (#0f0f0f) | cardForeground (#f5f5f5) | 17.58:1 | ✅ |
| destructive (#803636) | destructiveForeground (#fafafa) | 8.05:1 | ✅ |
| coffee (#ab7549) | coffeeForeground (#1c120a) | 4.71:1 | ✅ |
| berbere (#cf6644) | berbereForeground (#1f0d07) | 5.04:1 | ✅ |
| eucalyptus (#6b9a78) | eucalyptusForeground (#0d1810) | 5.64:1 | ✅ |
| injera (#2a2419) | injeraForeground (#e8dcc0) | 11.31:1 | ✅ |

Run `pnpm tokens` to regenerate and re-validate all pairs.

### Status color contrast

Status tokens use `foreground` colors that must be checked against their `background` values. The semantic-tokens.tsx generated file contains these values. Consumer applications must verify adequate contrast when overlaying status text on backgrounds other than the token's `background` value.

---

## 2. Touch Targets

Interaction tokens define minimum touch target sizes:

| Platform | Minimum | Token |
|----------|---------|-------|
| iOS | 44pt | `interaction.touchTarget.ios = 44` |
| Android | 48dp | `interaction.touchTarget.android = 48` |

**Implementation:** All native components enforce this via `Math.max(componentSize, MIN_TOUCH)` where `MIN_TOUCH = 48` (safe cross-platform value). See `Button.tsx`, `IconButton.tsx`.

**Web:** Interactive elements should have a minimum click area of 24×24px. Use padding to extend the clickable area without changing visual size.

---

## 3. Dynamic Type / Font Scaling

### React Native
- All `Text` components set `allowFontScaling={true}` by default.
- Never hardcode `allowFontScaling={false}` in production UI.
- Line heights are specified as absolute values (computed from ratio × fontSize) to scale with font size.
- Test with iOS Accessibility → Display & Text Size → Larger Text set to maximum.
- Test with Android → Accessibility → Font Size set to maximum.

### Web
- All font sizes use `rem` units in CSS, respecting the user's browser base font size.
- Never use `px` for font sizes in CSS custom properties (use `rem`).
- Line heights use ratio values (e.g., `1.6`) not fixed `px`.

---

## 4. Screen Reader Support

### Web (VoiceOver / NVDA / JAWS)
- All interactive elements have meaningful `aria-label` or visible text.
- Status changes use `aria-live="polite"` (non-urgent) or `aria-live="assertive"` (urgent/error).
- Status badges have `role="status"` for informational, `role="alert"` for errors.
- Financial amounts have `aria-label` that reads both amount and currency: "1234.56 ETB".
- Never rely on color alone for status — always pair with text label.
- Form fields have `label` associated via `htmlFor`/`id` or `aria-labelledby`.
- Error messages use `role="alert"` and are associated with their field via `aria-describedby`.
- Modals/dialogs use `aria-modal="true"`, trap focus, and return focus to trigger on close.

### iOS (VoiceOver)
- All interactive components set `accessibilityRole` (button, text, header, etc.).
- `Button` and `IconButton` require `accessibilityLabel` (enforced by TypeScript — non-optional).
- `StatusBadge` sets `accessibilityLabel` that reads "Status: [status name]".
- Financial amounts set `accessibilityLabel` to "[amount] [currency]".
- Modal components set `accessibilityViewIsModal={true}`.
- Focus order follows visual layout — test with VoiceOver enabled (triple-click home button or side button).

### Android (TalkBack)
- Same accessibility props as iOS — React Native maps them to Android ContentDescription.
- Verify swipe navigation order matches visual order.
- Test with TalkBack enabled (Settings → Accessibility → TalkBack).

---

## 5. Focus Management

### Web
- All interactive elements must be keyboard-focusable (not `tabIndex="-1"` unless intentional).
- Focus ring uses `ring` token color (#d4af37 gold) at 2px width (`interaction.focusRingWidth = 2`).
- Focus order must follow logical reading order.
- Modals trap focus — Tab and Shift+Tab must cycle within the modal.
- When a modal closes, focus returns to the element that opened it.
- Skip-to-main-content link should be present on web at the top of each page.

### Native
- VoiceOver/TalkBack swipe order should match visual top-to-bottom, left-to-right order.
- Avoid complex nested view hierarchies that confuse assistive technology.
- Group logically related elements with `accessible={true}` on the container.

---

## 6. Visible Labels

**Rule: No icon-only controls without an accessible label.**

- `IconButton` requires `accessibilityLabel` — it is a required prop (TypeScript enforces this).
- `Button` requires `accessibilityLabel`.
- Form inputs always display a visible `label` above the field (not just placeholder text).
- Placeholder text is NOT a substitute for a label — placeholder disappears when typing starts.
- All status displays pair a text label with any icon or color.

---

## 7. Error Patterns

### Web
- Error state: `role="alert"` on the error message element.
- Error is associated with its field via `aria-describedby`.
- Field border color change alone is NOT sufficient — must show text error message.
- Error message appears below the field, not just as a tooltip.

### Native
- Error messages set `accessibilityRole="alert"`.
- `Input` component renders error text below the field with `accessibilityRole="alert"`.
- `Field` component propagates error text to screen readers.
- Never show a red border alone — always show the error message text.

---

## 8. Reduced Motion

Web: The theme-template.css includes:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Native: Use `AccessibilityInfo.isReduceMotionEnabled()` before animating. The `Skeleton` component uses Animated API — disable shimmer loop when reduce motion is enabled. `BottomSheet` and other animated components should check this API.

---

## 9. Large Numbers and Long Text

### Large numbers (balances, amounts)
- Format with locale-appropriate separators: "1,234,567.89" not "1234567.89"
- Consumer is responsible for formatting — components render the string as-is.
- `accessibilityLabel` should spell out the number: "1 million 234 thousand 567 point 89".
- Screen readers often read large numbers incorrectly — test with VoiceOver/TalkBack.

### Long names (recipients, banks, countries)
- All Text components support `numberOfLines` — set appropriately to prevent layout overflow.
- Never truncate names in accessibility labels — use full name.
- Test with long Amharic/Ethiopian names that may be 40+ characters.

---

## 10. Amharic / Ge'ez Script

### Line wrapping
- Noto Serif Ethiopic line heights must be ≥ 1.5 for body text, ≥ 1.2 for display text.
- The `ethiopic.body` text role uses `lineHeight: 1.7` — do not reduce this.
- Amharic text should not break in the middle of a syllable — use `word-break: keep-all` equivalent where possible.

### Font loading
- Always load Noto Serif Ethiopic before rendering Amharic text.
- `useDesignSystemFonts()` loads this font — await it before showing Amharic.
- Show a skeleton or spinner while fonts load — do not show fallback system font for Amharic as it may not render Ge'ez correctly.

### Testing
- Test Amharic rendering on iOS and Android devices — system fonts differ.
- Verify the font renders all required Ge'ez characters in your content.
- "Noto" means "no tofu" — the font is designed to eliminate blank boxes for unsupported characters.

---

## 11. Color Independence (WCAG 1.4.1)

**Color must never be the sole means of conveying information.**

This applies to:
- Financial status (completed ≠ green only — must show text label)
- Form validation (error ≠ red border only — must show error text)
- Required fields (required ≠ red color only — must show asterisk and label)
- Chart data (chart series ≠ color only — must have labels, patterns, or text)

The `StatusBadge` component enforces this by always rendering icon + text. Do not bypass it by rendering a colored dot alone.

---

## 12. Known Gaps and Future Work

- Physical device testing for VoiceOver/TalkBack behavior has not been performed.
- Focus management in `BottomSheet` has not been verified with screen readers.
- WCAG 2.2 compliance (pointer cancellation, target spacing) has not been audited.
- High contrast mode support has not been verified.
- Switch access / AssistiveTouch patterns have not been validated.

All items above require real-device validation before production release.
