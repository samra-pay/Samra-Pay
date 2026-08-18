# Samra Pay Design System — Current State Audit

_Generated during Phase 1 preflight. Date: 2025-07-14._

---

## 1. Working Directory

`artifacts/samra-pay-ds/` (absolute: `/home/runner/workspace/artifacts/samra-pay-ds/`)

---

## 2. Complete File Inventory (excluding node_modules, dist)

### Root config
- `package.json` — workspace package `@workspace/samra-pay-ds`, version 0.0.0
- `tsconfig.json` — standalone (does not extend workspace base ✅)
- `vite.config.ts` — Vite 7 + Tailwind 4 + Replit plugins
- `components.json` — shadcn/ui config
- `index.html` — preview entry point
- `tokens.json` — DTCG token source (110 lines)
- `.replit-artifact/artifact.toml`
- `.tsbuildinfo`

### Scripts
- `scripts/build-tokens.mjs` — 229 lines; generates CSS + TS from tokens.json
- `scripts/theme-template.css` — 528 lines; hand-editable CSS with elevation, motion, patterns
- `scripts/build-tokens.d.mts` — type declaration for build script

### Generated outputs
- `src/index.css` — GENERATED web theme (do not hand-edit)
- `src/generated/tokens.tsx` — GENERATED hex token object

### Source: lib + hooks
- `src/lib/native-theme.tsx` — flat hex palettes, numeric radius/spacing, Expo font names
- `src/lib/utils.tsx` — `cn()` helper (tailwind-merge + clsx)
- `src/hooks/use-colors.tsx` — `useColors(schemeOverride?)` hook
- `src/hooks/use-fonts.tsx` — `useDesignSystemFonts()` loading Outfit, EB Garamond, Noto Serif Ethiopic

### Source: components/ui (55 files — all shadcn/ui families)
accordion.tsx, alert-dialog.tsx, alert.tsx, aspect-ratio.tsx, avatar.tsx, badge.tsx,
breadcrumb.tsx, button-group.tsx, button.tsx, calendar.tsx, card.tsx, carousel.tsx,
chart.tsx, checkbox.tsx, collapsible.tsx, command.tsx, context-menu.tsx, dialog.tsx,
drawer.tsx, dropdown-menu.tsx, empty.tsx, field.tsx, form.tsx, hover-card.tsx,
input-group.tsx, input-otp.tsx, input.tsx, item.tsx, kbd.tsx, label.tsx, menubar.tsx,
navigation-menu.tsx, pagination.tsx, popover.tsx, progress.tsx, radio-group.tsx,
resizable.tsx, scroll-area.tsx, select.tsx, separator.tsx, sheet.tsx, sidebar.tsx,
skeleton.tsx, slider.tsx, sonner.tsx, spinner.tsx, switch.tsx, table.tsx, tabs.tsx,
textarea.tsx, toaster.tsx, toast.tsx, toggle-group.tsx, toggle.tsx, tooltip.tsx

**Total: 55 files** (component-inventory.md lists 54 families — 55 files because `toast.tsx` and `toaster.tsx` are separate files for the same family)

### Source: components/patterns (4 files)
- `bank-card.tsx` — 3D tilt credit/debit card with gold branding
- `quote-panel.tsx` — remittance quote display
- `reward-card.tsx` — reward/loyalty card
- `selectable-tile.tsx` — selectable option tile

### Source: components/native
- **DOES NOT EXIST** — must be created in Phase 4

### Source: App + Preview
- `src/App.tsx` — preview app entry
- `src/preview/DesignSystemBrowser.tsx` — grouped navigation shell
- `src/preview/registry.tsx` — nav groups + lazy-loaded page registry
- `src/preview/foundations.tsx` — Overview, Colors, Fonts, Layout, Logo, Elevation, Motion, Patterns pages
- `src/preview/parts.tsx` — shared page helpers
- `src/preview/demos/` — 58 demo files (all 55 UI components + 4 pattern demos - 1 for toast/toaster sharing)

#### Preview demo files (58):
accordion, alert, alert-dialog, applied-dashboard, applied-mobile, applied-remittance,
aspect-ratio, avatar, badge, breadcrumb, button, button-group, calendar, card,
carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer,
dropdown-menu, empty, field, form, hover-card, input, input-group, input-otp,
item, kbd, label, menubar, navigation-menu, pagination, pattern-bank-card,
pattern-quote-panel, pattern-reward-card, pattern-selectable-tile, popover, progress,
radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton,
slider, sonner, spinner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip

### Source: Applied / pages
- `src/preview/pages/applied-dashboard.tsx`
- `src/preview/pages/applied-mobile.tsx`
- `src/preview/pages/applied-remittance.tsx`
- `src/preview/pages/voice-tone.tsx`

### Docs
- `docs/AGENTS.md` — design system guide (160 lines)
- `docs/consuming-web.md`
- `docs/consuming-expo.md`
- `docs/migrating-web.md`
- `docs/migrating-expo.md`
- `docs/references/component-inventory.md` — **BROKEN** (see §6 below)
- `docs/references/logos/README.md`
- `docs/references/logos/logo.png` — Samra Pay wordmark
- `docs/references/logos/icon-32.png`
- `docs/references/logos/icon-192.png`
- `public/logo.png` — copy of logo for preview
- `public/favicon.svg` — GENERATED gold lettermark

### Missing docs (must be created)
- `docs/current-state-audit.md` — **this file**
- `docs/financial-ui-truth.md`
- `docs/accessibility.md`
- `docs/localization.md`
- `docs/semantic-tokens.md`
- `docs/component-governance.md`
- `docs/ios-android.md`
- `docs/testing.md`
- `docs/asset-rights.md`
- `docs/open-decisions.md`
- `docs/content-and-voice.md`
- `docs/design-foundations.md`
- `CHANGELOG.md`
- `docs/references/native-component-inventory.md`

---

## 3. Build / Typecheck / Token Generation Status

### Token generation
```
cd artifacts/samra-pay-ds && node scripts/build-tokens.mjs
→ "Generated src/index.css, src/generated/tokens.tsx, and public/favicon.svg"
Status: ✅ SUCCESS
```

### Typecheck
Not run at audit time (will be run after Phase 3 additions to avoid false positives).

---

## 4. Component Families and Status

### Web UI Components (55 files, 54 families)

| Family | File | Status |
|--------|------|--------|
| Accordion | ui/accordion.tsx | ✅ implemented |
| Alert | ui/alert.tsx | ✅ implemented |
| Alert Dialog | ui/alert-dialog.tsx | ✅ implemented |
| Aspect Ratio | ui/aspect-ratio.tsx | ✅ implemented |
| Avatar | ui/avatar.tsx | ✅ implemented |
| Badge | ui/badge.tsx | ✅ implemented — has `gold` variant |
| Breadcrumb | ui/breadcrumb.tsx | ✅ implemented |
| Button | ui/button.tsx | ✅ implemented — has `gold` gradient variant |
| Button Group | ui/button-group.tsx | ✅ implemented |
| Calendar | ui/calendar.tsx | ✅ implemented |
| Card | ui/card.tsx | ✅ implemented |
| Carousel | ui/carousel.tsx | ✅ implemented |
| Chart | ui/chart.tsx | ✅ implemented (recharts) |
| Checkbox | ui/checkbox.tsx | ✅ implemented |
| Collapsible | ui/collapsible.tsx | ✅ implemented |
| Command | ui/command.tsx | ✅ implemented |
| Context Menu | ui/context-menu.tsx | ✅ implemented |
| Dialog | ui/dialog.tsx | ✅ implemented |
| Drawer | ui/drawer.tsx | ✅ implemented (vaul) |
| Dropdown Menu | ui/dropdown-menu.tsx | ✅ implemented |
| Empty | ui/empty.tsx | ✅ implemented |
| Field | ui/field.tsx | ✅ implemented |
| Form | ui/form.tsx | ✅ implemented (react-hook-form) |
| Hover Card | ui/hover-card.tsx | ✅ implemented |
| Input | ui/input.tsx | ✅ implemented |
| Input Group | ui/input-group.tsx | ✅ implemented |
| Input OTP | ui/input-otp.tsx | ✅ implemented |
| Item | ui/item.tsx | ✅ implemented |
| Kbd | ui/kbd.tsx | ✅ implemented |
| Label | ui/label.tsx | ✅ implemented |
| Menubar | ui/menubar.tsx | ✅ implemented |
| Navigation Menu | ui/navigation-menu.tsx | ✅ implemented |
| Pagination | ui/pagination.tsx | ✅ implemented |
| Popover | ui/popover.tsx | ✅ implemented |
| Progress | ui/progress.tsx | ✅ implemented |
| Radio Group | ui/radio-group.tsx | ✅ implemented |
| Resizable | ui/resizable.tsx | ✅ implemented |
| Scroll Area | ui/scroll-area.tsx | ✅ implemented |
| Select | ui/select.tsx | ✅ implemented |
| Separator | ui/separator.tsx | ✅ implemented |
| Sheet | ui/sheet.tsx | ✅ implemented |
| Sidebar | ui/sidebar.tsx | ✅ implemented |
| Skeleton | ui/skeleton.tsx | ✅ implemented |
| Slider | ui/slider.tsx | ✅ implemented |
| Sonner | ui/sonner.tsx | ✅ implemented |
| Spinner | ui/spinner.tsx | ✅ implemented |
| Switch | ui/switch.tsx | ✅ implemented |
| Table | ui/table.tsx | ✅ implemented |
| Tabs | ui/tabs.tsx | ✅ implemented |
| Textarea | ui/textarea.tsx | ✅ implemented |
| Toast / Toaster | ui/toast.tsx + ui/toaster.tsx | ✅ implemented |
| Toggle | ui/toggle.tsx | ✅ implemented |
| Toggle Group | ui/toggle-group.tsx | ✅ implemented |
| Tooltip | ui/tooltip.tsx | ✅ implemented |

### Web Patterns (4 families)

| Pattern | File | Status |
|---------|------|--------|
| BankCard | patterns/bank-card.tsx | ✅ implemented |
| QuotePanel | patterns/quote-panel.tsx | ✅ implemented |
| RewardCard | patterns/reward-card.tsx | ✅ implemented |
| SelectableTile | patterns/selectable-tile.tsx | ✅ implemented |

### Native Components
- **NONE EXIST** — `src/components/native/` does not exist

---

## 5. Existing Preview Pages

Foundation pages (src/preview/foundations.tsx):
- Overview
- Colors
- Fonts
- Layout
- Logo
- Elevation
- Motion
- Patterns

Applied pages (src/preview/pages/):
- applied-dashboard.tsx
- applied-mobile.tsx
- applied-remittance.tsx
- voice-tone.tsx

Component demos (src/preview/demos/): 58 demo files covering all 55 UI components and 4 pattern families.

---

## 6. Broken / Missing Documentation References

### docs/references/component-inventory.md — ALL component reference links are broken

The inventory table references `.md` files in a `components/` directory that does **not exist**:

```
components/button.md        ← DOES NOT EXIST
components/badge.md         ← DOES NOT EXIST
components/card.md          ← DOES NOT EXIST
... (all 54 entries use this non-existent path pattern)
```

**Correct actual paths** are:
- Source: `src/components/ui/button.tsx`
- Preview demo: `src/preview/demos/button.tsx`

No `components/*.md` files exist anywhere in `artifacts/samra-pay-ds/`.

### docs/AGENTS.md — Minor contradictions
- Line 11: "docs/references/component-inventory.md — full component inventory index: all 54 UI families" — actually 55 files (toast + toaster), still 54 families ✅ (acceptable)
- Lines 98–101: "Native components live under `src/components/native/`" — this directory **does not yet exist**, creating a false claim
- No mention of `src/generated/semantic-tokens.tsx` (does not exist yet — to be created in Phase 3)
- No mention of new scripts: `tokens:check`, `validate`, `test`, `test:a11y`

### Missing doc references throughout AGENTS.md
- `docs/consuming-web.md` ✅ exists
- `docs/consuming-expo.md` ✅ exists
- `docs/migrating-web.md` ✅ exists
- `docs/migrating-expo.md` ✅ exists
- All other docs referenced in tasks do NOT exist yet

---

## 7. Contradictions Between AGENTS.md, component-inventory.md, and Source

| Document | Claim | Reality |
|----------|-------|---------|
| component-inventory.md | References `components/button.md` etc. | These files do not exist anywhere |
| component-inventory.md | Lists source as `artifacts/samra-pay/src/components/ui/` | Actual source is `src/components/ui/` in this package |
| AGENTS.md | "Native components live under `src/components/native/`" | Directory does not exist yet |
| AGENTS.md | Does not mention `semantic-tokens.tsx` | Planned output not yet implemented |
| AGENTS.md | No mention of `tokens:check`, `validate`, `test`, `test:a11y` scripts | Not yet in package.json |
| component-inventory.md | Lists 54+7 families (55 total?), "7 custom components" | Only 4 pattern files exist; 3 "custom" entries are deferred |

---

## 8. Replit-Specific Dependencies

Found in `package.json` devDependencies:

| Package | Version | Usage |
|---------|---------|-------|
| `@replit/vite-plugin-cartographer` | `^0.5.1` | File navigation for Replit IDE. Used in `vite.config.ts` conditionally: only loaded when `process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined`. Dev-only, NOT in built output. |
| `@replit/vite-plugin-dev-banner` | `^0.1.1` | Listed in devDependencies but NOT imported or used in `vite.config.ts`. Can be removed safely. |
| `@replit/vite-plugin-runtime-error-modal` | `^0.0.6` | Runtime error overlay in dev mode. Imported and used unconditionally in `vite.config.ts` as `runtimeErrorOverlay()`. Adds a dev overlay plugin — does not affect production build output. |

**Conclusion**: All three are dev-only tools. None affect the built CSS/JS/token outputs. The cartographer plugin only activates in Replit's own environment (guarded by `REPL_ID`). See `docs/open-decisions.md` for portability notes.

---

## 9. Hard-Coded Visual Values Not Drawn From Tokens

Found in source files:

### src/components/patterns/bank-card.tsx
```tsx
// Hard-coded colors for card branding — intentional per source comment:
text-[#1A1A1A], text-[#F9F7F1], text-[#0A0A0A], text-[#D4AF37]
// These are intentionally non-token to read on physical-object gradients
```

### src/preview/foundations.tsx
- Various demo hex values used as illustration (not product UI)

### src/preview/demos/*.tsx
- Demo-specific hard-coded values (acceptable — they're illustrative, not product)

---

## 10. Third-Party Logos, Marks, and Names in Source

| Item | Location | Context |
|------|----------|---------|
| Mastercard wordmark/logo | `src/components/patterns/bank-card.tsx` | Renders a Mastercard-style dual-circle logo in SVG inside the demo bank card. Not an official Mastercard asset — SVG drawn inline. Potentially requires review. |
| "ShebaMiles" | `src/preview/pages/applied-remittance.tsx`, `src/preview/demos/pattern-reward-card.tsx` | Ethiopian Airlines loyalty program name used in demo/preview data. Not in production source. |
| "Ethiopian Airlines" | Same files | Airline name used in demo card branding. |
| "Rain", "Caliza", "Chapa" | `src/preview/pages/applied-remittance.tsx` | Payment provider names used as demo data (not production). |
| Samra Pay logo | `docs/references/logos/logo.png`, `public/logo.png` | Real brand asset. Source: copied from `artifacts/samra-pay/public/`. |

See `docs/asset-rights.md` for detailed licensing analysis.

---

## 11. Token Gaps (to be filled in Phase 2)

The following are NOT in `tokens.json`:
- Semantic typography roles (textStyle group)
- Interaction tokens (touchTarget, controlHeight, iconSize, etc.)
- Layout tokens (gutters, breakpoints, content widths, etc.)
- Motion/elevation portable reference values
- Financial status semantics (completed, failed, processing, etc.)

---

## 12. Summary Assessment

| Area | Status |
|------|--------|
| Token generation | ✅ Working |
| Web UI components | ✅ All 54 families implemented |
| Web patterns | ✅ All 4 implemented |
| Native components | ❌ None exist |
| Semantic typography tokens | ❌ Not in tokens.json |
| Interaction tokens | ❌ Not in tokens.json |
| Layout tokens | ❌ Not in tokens.json |
| Financial status tokens | ❌ Not in tokens.json |
| Token validation/governance | ❌ No validation scripts |
| Token drift check | ❌ No check-token-drift.mjs |
| Test suite | ❌ No tests |
| component-inventory.md links | ❌ All broken (reference non-existent .md files) |
| native-component-inventory.md | ❌ Does not exist |
| Financial UI truth doc | ❌ Does not exist |
| Accessibility doc | ❌ Does not exist |
| Content and voice doc | ❌ Does not exist |
| Semantic tokens doc | ❌ Does not exist |
| CHANGELOG | ❌ Does not exist |
