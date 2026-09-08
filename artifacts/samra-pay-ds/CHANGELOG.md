# Changelog — Samra Pay Design System

## 2026-09-08 — Preview portability

Removed retired hosting plugins and their unconditional error overlay. Local
and GitHub previews use the standard Vite toolchain; component styles and tokens
are unchanged. Hosted activation still requires its own release approval.

All notable changes to this design system are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — Phase 1–13 Upgrade (S-Tier)

### Added

**Token System (Phase 2)**
- `textStyle` group: 21 semantic typography roles (display, heading, body, label, caption, numeric, ethiopic)
- `interaction` group: touch targets, control heights, icon sizes, focus ring width, pressed/disabled/loading opacity
- `layout` group: gutters, section gaps, card padding, form spacing, inline spacing, density multipliers, content widths, breakpoints, modal widths, header heights, bottom nav height
- `motion` group: duration and easing reference values (portable for native)
- `elevation` group: structured shadow definitions for native (e1–e5, goldSm/Md/Lg)
- `status` group: 14 financial status entries (neutral, information, warning, submitted, processing, completed, failed, cancelled, refundPending, refunded, reversed, stale, offline, unavailable) — each with foreground, background, border, iconName, textRequired, accessibilityNote

**Token Governance (Phase 3)**
- `scripts/build-tokens.mjs` — Added `validateTokens()` (required groups + alias resolution) and `validateContrast()` (WCAG AA 4.5:1 for all color pairs)
- `scripts/build-tokens.mjs` — Added `src/generated/semantic-tokens.tsx` as a third generated output (portable typed semantic token object)
- `scripts/check-token-drift.mjs` — New script: regenerates tokens in memory and fails with exit 1 if committed files differ
- `package.json` scripts: `tokens:check`, `validate`, `test`, `test:a11y`

**Native Components (Phase 4)**
New `src/components/native/` directory with 22 components:
- Text (20 variant roles)
- Button (5 variants × 3 sizes, enforced touch targets)
- IconButton (required accessibilityLabel)
- Card (default/elevated/outlined)
- Input (default/focused/error/disabled states)
- CurrencyInput (display wrapper — never reformats)
- Label (required asterisk, error variant)
- Field (Label + Input + error composition)
- Badge (7 variants × 2 sizes)
- StatusBadge (financial status — always icon + text)
- Spinner (ActivityIndicator wrapper)
- Skeleton (Animated shimmer — text/card/circle)
- Divider (horizontal/vertical)
- Alert (inline — info/warning/error/success)
- EmptyState
- ErrorState
- OfflineState (offline status token colors)
- RetryPanel (compact inline retry)
- ModalShell (React Native Modal with design-system styling)
- BottomSheet (Animated + PanResponder — no third-party deps)
- Toast / ToastProvider / useToast (banner + imperative API)
- ListRow (standard list row pattern)

**Fintech Native Patterns (Phase 5)**
New `src/components/native/patterns/` with 15 components (all presentation-only):
- MoneyAmount
- BalanceDisplay
- AccountSummary
- TransactionRow
- QuotePanel
- ExchangeRateDisclosure
- FeeBreakdown
- RecipientCard
- DestinationSummary
- TransferStatus (always shows transferId)
- TransferTimeline
- TransferReceipt
- ConfirmationPanel
- StaleDataNotice
- ServiceUnavailablePanel

**Tests (Phase 11)**
- `src/tests/tokens.test.mjs` — Token structure and alias resolution tests
- `src/tests/contrast.test.mjs` — WCAG AA contrast for all 22 color pairs
- `src/tests/a11y.test.mjs` — Accessibility token value tests
- `src/tests/docs.test.mjs` — Required doc files and broken link detection

**Documentation (Phases 1, 6–9, 12–13)**
- `docs/current-state-audit.md` — Preflight audit
- `docs/financial-ui-truth.md` — Mandatory financial UI rules
- `docs/accessibility.md` — WCAG AA standards + native contract
- `docs/content-and-voice.md` — English/Amharic copy standards
- `docs/semantic-tokens.md` — Full semantic token reference
- `docs/design-foundations.md` — Visual and conceptual foundations
- `docs/component-governance.md` — Component lifecycle rules
- `docs/ios-android.md` — Platform-specific implementation notes
- `docs/testing.md` — Test suite documentation and results
- `docs/asset-rights.md` — Logo, font, and third-party asset audit
- `docs/open-decisions.md` — Unresolved design decisions
- `docs/localization.md` — Amharic/Ethiopic localization guidance
- `docs/references/native-component-inventory.md` — Native component inventory
- `CHANGELOG.md` — This file

### Changed
- `docs/references/component-inventory.md` — Fixed all broken `.md` reference links (now point to actual `.tsx` source files)
- `docs/AGENTS.md` — Updated to reflect: native components, semantic-tokens.tsx output, new scripts, new doc files
- `scripts/build-tokens.mjs` — Added validation + semantic-tokens.tsx generation (existing logic preserved)
- `tokens.json` — Added 5 new token groups (textStyle, interaction, layout, motion, elevation, status) without changing any existing token values

### Notes
- All 22 original color pair contrast ratios preserved and validated
- Midnight Gold (#d4af37), warm-ivory palette, cultural colors, fonts all unchanged
- All 54 web UI components unchanged
- All 4 web patterns unchanged
- No files outside artifacts/samra-pay-ds/ modified

---

## [0.0.0] — Initial

- Initial design system scaffolding with Midnight Gold tokens
- 54 shadcn/ui component families
- 4 web pattern components (BankCard, QuotePanel, RewardCard, SelectableTile)
- Token system: colors (light/dark), typography font families, radius, spacing
- Web theme: src/index.css
- Portable tokens: src/generated/tokens.tsx
- Native theme helpers: src/lib/native-theme.tsx
- Hooks: useColors, useDesignSystemFonts
- Preview app with foundations + all component demos
