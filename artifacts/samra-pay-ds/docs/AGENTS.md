# Samra Pay Design System

This package defines the visual language for the project. Use it whenever you
build or restyle UI so every surface looks like the same product. It is a real
workspace package (`@workspace/samra-pay-ds`): other artifacts depend
on it and import its theme and components directly.

## What's here

- `docs/references/logos/` — retained brand marks: `logo.png` (wordmark), `icon-32.png`, `icon-192.png`. Source: `artifacts/samra-pay/public/`. Always use the real mark here for the preview logo — never invent or regenerate it. The preview loads it from `public/logo.png` (copied alongside).
- `docs/references/component-inventory.md` — full web component inventory (54 UI families + 4 pattern families). All reference links point to actual `.tsx` source files.
- `docs/references/native-component-inventory.md` — full native component inventory (22 primitive components + 15 fintech pattern components).
- `tokens.json` — the single source of truth (DTCG format): colors (full light
  and dark sets, including the cultural palette: `coffee`, `berbere`,
  `eucalyptus`, `injera` + foregrounds; chart2–4 alias them), typography
  (`sans`, `serif`, `mono`, `ethiopic` — Noto Serif Ethiopic for Amharic),
  spacing, radius, **textStyle** (semantic typography roles), **interaction**
  (touch targets, control heights, icon sizes), **layout** (gutters, breakpoints,
  content widths), **motion** (durations and easings), **elevation** (shadow
  definitions for native), and **status** (financial status semantics with
  foreground/background/border/iconName/textRequired/accessibilityNote).
- `scripts/theme-template.css` — the hand-editable CSS template that
  `build-tokens.mjs` fills in. Non-color foundations live here: the 5-step
  elevation ramp (`shadow-e1…e5`) with gold-ambient variants
  (`shadow-gold-sm|md|lg`), motion tokens (`ease-standard|entrance|emphasized|exit`,
  `animate-float-slow`, `animate-fade-up`, `animate-shimmer`, …), the Ethiopian
  pattern utilities (`pattern-telsem|axum|tibeb|mesob` with
  `pattern-sparse|dense` density modifiers), and the reduced-motion contract.
  Edit the template, not the generated `src/index.css`.
- `scripts/build-tokens.mjs` — generates the outputs below from `tokens.json`.
  Validates token structure and WCAG AA contrast before generating. Logs a
  summary table of all contrast pairs.
- `scripts/check-token-drift.mjs` — regenerates tokens in memory and fails
  (exit 1) if the committed generated files differ from what tokens.json produces.
  Run with `pnpm run tokens:check`.
- `src/index.css` — GENERATED token theme (web), exported as `./styles.css`.
- `src/generated/tokens.tsx` — GENERATED hex token object, the package's `.` and
  `./tokens` entry. Mobile (Expo) and other platforms import this.
- `src/generated/semantic-tokens.tsx` — GENERATED portable typed object containing
  textStyle, interaction, layout, motion, elevation, and status token entries.
  Web and native consumers import this for semantic typography roles and financial
  status colors. Do not hand-edit.
- `public/favicon.svg` — GENERATED app icon from `tokens.json` + the title.
- `src/components/ui/` — the initial shadcn scaffold, exported as
  `./components/*`. 54 component families, all implemented.
- `src/components/patterns/` — web pattern components: BankCard, QuotePanel,
  RewardCard, SelectableTile.
- `src/components/native/` — React Native components. Use React Native
  primitives only (View, Text, Pressable, etc.) — no Radix, no web/DOM imports.
  22 primitive components + 15 fintech pattern components. See
  `docs/references/native-component-inventory.md` for the full list.
  These are NOT imported into the web-only Vite preview.
- `src/lib/` (`cn`, `native-theme`) and `src/hooks/` — exported as `./lib/*` and `./hooks/*`.
  Native (Expo) consumers additionally use `src/lib/native-theme.tsx`
  (`nativeTheme`: flat light/dark hex palettes, numeric `radius` scale, a
  `spacing()` helper, and the registered Expo `fontFamily` names derived from
  the generated tokens), `src/hooks/use-colors.tsx` (`useColors(scheme?)`, with
  an override for forced-scheme brands), and `src/hooks/use-fonts.tsx`
  (`useDesignSystemFonts()` loading Outfit, EB Garamond, and Noto Serif
  Ethiopic weights). The RN/font packages are optional peer dependencies so
  web consumers are unaffected.
- `src/App.tsx` — the entry point for the living style guide.
- `src/preview/DesignSystemBrowser.tsx` — the persistent grouped navigation,
  branded header, search, deep links, and active page shell.
- `src/preview/registry.tsx` — preview metadata (`DESIGN_SYSTEM` title,
  description) and ordered navigation. Overview comes first;
  Brand/Colors/Fonts/Layout precede Components; Content/Charts/Motion/Applied
  examples follow when applicable. Each group is a nav section whose entries
  are its nested pages. Empty optional groups stay hidden. Keep component pages
  loaded with `lazy(() => import(...))` so opening the preview does not download
  every story.
- `src/preview/foundations.tsx` — token-driven Overview, Colors, Fonts, Layout,
  semantic typography, interaction tokens, layout tokens, financial status colors,
  and accessibility guide pages.
- `src/preview/parts.tsx` — shared page helpers, including `Guidelines` for design
  and composition do's/don'ts.
- `src/preview/demos/<component>.tsx` — component stories.
- `src/preview/native-catalog/NativeCatalog.tsx` — web reference catalog for all
  native components showing import paths, props, and usage examples.
- `src/tests/` — Node.js built-in test runner tests:
  - `tokens.test.mjs` — token structure + alias resolution
  - `contrast.test.mjs` — WCAG AA contrast for all color pairs
  - `a11y.test.mjs` — accessibility token values
  - `docs.test.mjs` — required doc files exist, no broken links
- `docs/consuming-web.md` and `docs/consuming-expo.md` — platform-specific usage.
- `docs/migrating-web.md` and `docs/migrating-expo.md` — replacing scaffolded or
  existing local design-system implementations.
- `docs/financial-ui-truth.md` — mandatory financial UI rules (amounts, rates, fees, status).
- `docs/accessibility.md` — WCAG AA standards + native accessibility contract.
- `docs/content-and-voice.md` — English/Amharic copy standards, formatting, tone.
- `docs/semantic-tokens.md` — documentation of textStyle, interaction, layout, motion, elevation, status tokens.
- `docs/asset-rights.md` — inventory of logos, fonts, and third-party marks with licensing status.
- `docs/open-decisions.md` — open design decisions and known gaps.
- `docs/current-state-audit.md` — preflight audit of current state.
- `CHANGELOG.md` — version history.

Every source file in this package is a `.tsx` file, including token, utility,
and hook modules with no JSX, so every export below is a single `*.tsx` glob. Do
not add `.ts` files here.

## What this package exports

```jsonc
".":              "./src/generated/tokens.tsx",
"./tokens":       "./src/generated/tokens.tsx",
"./styles.css":   "./src/index.css",
"./components/*": "./src/components/*.tsx",
"./lib/*":        "./src/lib/*.tsx",
"./hooks/*":      "./src/hooks/*.tsx"
```

Components import each other with relative paths internally, so they resolve
correctly when another package imports them through
`@workspace/samra-pay-ds/components/...`. Never use a `@/` alias inside
this package. Components added through shadcn may use this package's
`#components/*`, `#lib/*`, and `#hooks/*` imports from `package.json`; those are
consumer-safe because they resolve against this package.

## Available scripts

```
pnpm tokens          # Regenerate CSS + TS from tokens.json
pnpm tokens:check    # Check for drift between tokens.json and committed generated files
pnpm validate        # Full: tokens + drift check + typecheck
pnpm test            # Run all tests (tokens, contrast, a11y, docs)
pnpm test:a11y       # Run only accessibility tests
pnpm dev             # Start Vite dev server (tokens auto-regenerate on change)
pnpm build           # Build preview app
pnpm typecheck       # TypeScript check (tokens regenerated first)
```

## Editing and maintaining the design system

Edit `tokens.json` only, then run `pnpm tokens`; the dev server also regenerates
on change. Never hand-edit `src/index.css`, `src/generated/tokens.tsx`, or
`src/generated/semantic-tokens.tsx`.

Every user-facing web component under `src/components/ui/` must have a family
story in `src/preview/demos/` covering its variants, sizes, and important states.
Register each family once in `src/preview/registry.tsx`. If a component changes,
update its story and registry entry in the same change.

Native components live under `src/components/native/`. Match an existing web
component family's public API wherever React Native supports it, and document
platform-required differences. Native components are not imported into the
web-only Vite preview.

### Token governance

The `build-tokens.mjs` script validates:
1. All required top-level token groups are present
2. All `{alias}` references resolve without cycles
3. All required color pairs pass WCAG AA (4.5:1 minimum)

The `check-token-drift.mjs` script fails with exit code 1 if committed generated
files differ from what `tokens.json` would produce. Run `pnpm tokens:check` in CI.

## Keep it template-ready

This design system is a prime candidate to be saved to the workspace as a
reusable template, and a template is packaged as this one directory alone. Keep
it self-contained as you maintain it so that save works: use concrete dependency
versions (never `catalog:`), keep `tsconfig.json` standalone (never `extends` a
workspace-relative base), and never import from a sibling artifact or a shared
`@workspace/*` lib. A saved template is consumed as a read-only style donor
(re-authored from, not rebuilt), so keep the generated `src/index.css` and
`src/generated/tokens.tsx` committed so the template carries a readable theme
snapshot.

## Consuming this package

Never copy token values, component source, hooks, or these docs into a consuming
artifact. Add `@workspace/samra-pay-ds` as a `workspace:*` dependency,
run `pnpm install`, and import directly from this package.

Read only the guides required by the current task:

- Building or styling web UI: `artifacts/samra-pay-ds/docs/consuming-web.md`
- Building or styling Expo UI: `artifacts/samra-pay-ds/docs/consuming-expo.md`
- Replacing an existing or scaffolded web theme/component library:
  `artifacts/samra-pay-ds/docs/migrating-web.md`
- Replacing existing or scaffolded Expo theme/hooks/components:
  `artifacts/samra-pay-ds/docs/migrating-expo.md`
- Financial UI rules: `artifacts/samra-pay-ds/docs/financial-ui-truth.md`
- Accessibility standards: `artifacts/samra-pay-ds/docs/accessibility.md`
- Content and voice: `artifacts/samra-pay-ds/docs/content-and-voice.md`

## Universal rules

- Match exact token values. Do not invent colors, fonts, spacing, or radii in a
  consuming app.
- Keep product data, navigation, application state, and product-specific
  compositions in the app. Product-agnostic visual primitives belong here.
- Read these docs in place. Do not copy them into another artifact.
- Financial amounts: display as received — never reformat, never calculate in UI.
- Status: always show text + icon — never color alone.
- Accessibility: WCAG AA minimum (4.5:1 contrast). Touch targets: 44pt iOS / 48dp Android.
