# Semantic Tokens — Samra Pay Design System

Semantic tokens extend the base color/typography/spacing tokens with higher-level abstractions for typography roles, interaction dimensions, layout structure, motion, elevation, and financial status semantics.

**Source:** `tokens.json` (DTCG format — hand-edit this only)
**Generated output:** `src/generated/semantic-tokens.tsx`
**Build command:** `pnpm tokens`

---

## 1. Typography Roles (textStyle)

Semantic typography roles map font size, weight, line height, and letter spacing to purpose-driven names. Use these instead of inventing ad-hoc typography.

### Display roles (EB Garamond serif)
| Role | Size | Weight | Line Height | Letter Spacing | Use |
|------|------|--------|------------|---------------|-----|
| display.xl | 4.5rem (72px) | 400 | 1.0 | -0.02em | Largest hero |
| display.lg | 3.75rem (60px) | 400 | 1.0 | -0.02em | Large hero |
| display.md | 3rem (48px) | 400 | 1.05 | -0.01em | Section cover |

### Heading roles (Outfit sans)
| Role | Size | Weight | Line Height | Letter Spacing | Use |
|------|------|--------|------------|---------------|-----|
| heading.xl | 2.25rem (36px) | 600 | 1.1 | -0.01em | Page titles |
| heading.lg | 1.875rem (30px) | 600 | 1.15 | -0.01em | Section headers |
| heading.md | 1.5rem (24px) | 600 | 1.2 | 0em | Card headers |
| heading.sm | 1.25rem (20px) | 600 | 1.25 | 0em | Sub-headers |

### Body roles (Outfit sans)
| Role | Size | Weight | Line Height | Letter Spacing | Use |
|------|------|--------|------------|---------------|-----|
| body.lg | 1.125rem (18px) | 400 | 1.6 | 0em | Lead paragraphs |
| body.md | 1rem (16px) | 400 | 1.6 | 0em | Default body |
| body.sm | 0.875rem (14px) | 400 | 1.5 | 0em | Secondary text |

### Label roles (Outfit sans)
| Role | Size | Weight | Line Height | Letter Spacing | Use |
|------|------|--------|------------|---------------|-----|
| label.lg | 0.875rem (14px) | 500 | 1.4 | 0.01em | Form labels, nav |
| label.md | 0.8125rem (13px) | 500 | 1.4 | 0.01em | Compact labels |
| label.sm | 0.75rem (12px) | 500 | 1.4 | 0.01em | Badges, tags |
| caption | 0.6875rem (11px) | 400 | 1.4 | 0.02em | Timestamps, footnotes |

### Numeric roles (financial display)
| Role | Font | Size | Weight | Use |
|------|------|------|--------|-----|
| numeric.balance | EB Garamond | 3rem (48px) | 500 | Account balance hero |
| numeric.amount | Outfit | 1.5rem (24px) | 600 | Transaction amounts |
| numeric.rate | EB Garamond | 1.875rem (30px) | 400 | Exchange rate display |

### Ethiopic roles (Noto Serif Ethiopic)
| Role | Size | Weight | Line Height | Use |
|------|------|--------|------------|-----|
| ethiopic.display | 3rem (48px) | 400 | 1.2 | Amharic hero |
| ethiopic.heading | 1.5rem (24px) | 400 | 1.4 | Amharic headings |
| ethiopic.body | 1rem (16px) | 400 | 1.7 | Amharic body |
| ethiopic.label | 0.875rem (14px) | 400 | 1.5 | Amharic labels |

Note: Ethiopic line heights are higher than Latin counterparts to accommodate the complexity of Ge'ez script.

---

## 2. Interaction Tokens

| Token | Value | Description |
|-------|-------|-------------|
| touchTarget.ios | 44 | iOS minimum touch target in points (Apple HIG) |
| touchTarget.android | 48 | Android minimum touch target in dp (Material) |
| controlHeight.sm | 32px | Compact controls |
| controlHeight.md | 40px | Default controls |
| controlHeight.lg | 48px | Prominent CTAs |
| iconSize.xs | 12px | Status dots |
| iconSize.sm | 16px | Inline icons |
| iconSize.md | 20px | Default icons |
| iconSize.lg | 24px | Standalone icons |
| iconSize.xl | 32px | Feature illustrations |
| focusRingWidth | 2px | Focus indicator width |
| pressedOpacity | 0.75 | Pressed state opacity |
| disabledOpacity | 0.38 | Disabled state opacity |
| loadingOpacity | 0.60 | Loading overlay opacity |

**Safe area insets are NOT in this token set.** They must come from:
- React Native: `useSafeAreaInsets()` from `react-native-safe-area-context`
- Web: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, etc.

---

## 3. Layout Tokens

### Gutters (horizontal page margins)
| Token | Value | Use |
|-------|-------|-----|
| gutter.mobile | 16px | Mobile app horizontal margin |
| gutter.tablet | 24px | Tablet horizontal margin |
| gutter.desktop | 32px | Desktop horizontal margin |

### Section gaps (vertical spacing between sections)
| Token | Value |
|-------|-------|
| sectionGap.sm | 32px |
| sectionGap.md | 48px |
| sectionGap.lg | 64px |

### Card padding
| Token | Value | Use |
|-------|-------|-----|
| cardPadding.sm | 12px | Compact cards |
| cardPadding.md | 16px | Default |
| cardPadding.lg | 24px | Prominent cards |

### Content widths
| Token | Value | Tailwind equivalent |
|-------|-------|---------------------|
| webContentWidth.sm | 640px | sm: container |
| webContentWidth.md | 768px | md: container |
| webContentWidth.lg | 1024px | lg: container |
| webContentWidth.xl | 1280px | xl: container |
| webContentWidth.max | 1440px | Max content width |
| mobileContentWidth.max | 480px | Mobile max column |

### Breakpoints (match Tailwind defaults)
| Token | Value | Tailwind class |
|-------|-------|----------------|
| breakpoint.sm | 640px | `sm:` |
| breakpoint.md | 768px | `md:` |
| breakpoint.lg | 1024px | `lg:` |
| breakpoint.xl | 1280px | `xl:` |
| breakpoint.xxl | 1536px | `2xl:` |

### Other layout
| Token | Value |
|-------|-------|
| formSpacing | 16px |
| inlineSpacing.sm | 4px |
| inlineSpacing.md | 8px |
| inlineSpacing.lg | 12px |
| density.compact | 0.75× |
| density.standard | 1.0× |
| density.spacious | 1.375× |
| headerHeight.mobile | 56px |
| headerHeight.desktop | 64px |
| bottomNavHeight | 56px |
| modalWidth.sm | 360px |
| modalWidth.md | 480px |
| modalWidth.lg | 640px |

---

## 4. Motion Tokens

Web consumes motion from CSS custom properties in `theme-template.css`. Native code reads from `semantic-tokens.tsx`.

| Token | Value | Use |
|-------|-------|-----|
| motion.swift | 150ms | Hover states, micro-interactions |
| motion.standard | 250ms | Default UI state changes |
| motion.gentle | 400ms | Modal/panel entrance |
| motion.slow | 500ms | Onboarding, empty-state illustrations |
| motion.easing.standard | cubic-bezier(0.4, 0, 0.2, 1) | General transitions |
| motion.easing.entrance | cubic-bezier(0.16, 1, 0.3, 1) | Elements entering view |
| motion.easing.emphasized | cubic-bezier(0.34, 1.3, 0.64, 1) | Expressive moments |
| motion.easing.exit | cubic-bezier(0.4, 0, 1, 1) | Elements leaving view |

**Reduced motion:** All animations must respect `prefers-reduced-motion` (web) and `AccessibilityInfo.isReduceMotionEnabled()` (native). The CSS theme enforces this automatically for web consumers.

---

## 5. Elevation Tokens

Elevation tokens provide reference values for native shadow computation. Web uses CSS variables from `theme-template.css`.

| Level | Web class | Use |
|-------|-----------|-----|
| e1 | shadow-e1 | Hairline lift, adjacent surface separation |
| e2 | shadow-e2 | Cards, list panels |
| e3 | shadow-e3 | Popovers, tooltips, floating elements |
| e4 | shadow-e4 | Drawers, bottom sheets |
| e5 | shadow-e5 | Modals, critical dialogs |
| goldSm | shadow-gold-sm | Subtle gold ambient glow |
| goldMd | shadow-gold-md | Primary buttons, focused inputs |
| goldLg | shadow-gold-lg | Hero elements, featured cards |

---

## 6. Financial Status Tokens

Financial status tokens define the visual and accessibility contract for all transfer status displays. They are in `tokens.json` under the `status` key.

**Rule: textRequired is always `true`. Never use color alone to convey status.**

| Status | Foreground | Background | Icon | A11y role |
|--------|-----------|-----------|------|-----------|
| neutral | #adadad (muted) | #1f1f1f | circle | status |
| information | #60a5fa (blue-400) | #1e2a3a | info | status |
| warning | #cf6644 (berbere) | #2a1a0f | alert-triangle | alert |
| submitted | #e9d99a (accent gold) | #1a1508 | upload | status |
| processing | #d4af37 (gold) | #1a1508 | loader | status/busy |
| completed | #6b9a78 (eucalyptus) | #0d1a10 | check-circle | status |
| failed | #f87171 (red-400) | #1f0a0a | x-circle | alert |
| cancelled | #ef4444 (red-500) | #1f0a0a | x-circle | alert |
| refundPending | #cf6644 (berbere) | #1f1008 | clock | status |
| refunded | #ab7549 (coffee) | #1a1008 | rotate-ccw | status |
| reversed | #ab7549 (coffee) | #1a1008 | arrow-left | status |
| stale | #cf6644 (berbere) | #1f1208 | alert-triangle | alert |
| offline | #adadad (muted) | #141414 | wifi-off | alert |
| unavailable | #adadad (muted) | #141414 | alert-circle | status |

### New hex values (not in original palette)
- `#60a5fa` (information foreground) — blue-400, see `docs/open-decisions.md`
- `#f87171` (failed foreground) — red-400, more legible on dark than #803636
- `#ef4444` (cancelled foreground) — red-500, distinct from failed

---

## 7. Using semantic-tokens.tsx in Code

```tsx
import { semanticTokens } from '../generated/semantic-tokens';

// Typography role
const displayXl = semanticTokens.textStyle.display.xl;
// { fontFamily: "EB Garamond", fontSize: "4.5rem", fontWeight: "400", ... }

// Interaction
const minTouchIos = semanticTokens.interaction.touchTarget.ios; // 44

// Layout
const mobileGutter = semanticTokens.layout.gutter.mobile; // 16

// Status
const completedStatus = semanticTokens.status.completed;
// { foreground: "#6b9a78", background: "#0d1a10", iconName: "check-circle", ... }

// Motion
const standardDuration = semanticTokens.motion.standard; // "250ms"
```
