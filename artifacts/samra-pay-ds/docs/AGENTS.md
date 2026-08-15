# Samra Pay Design System design system

This package defines the visual language for the project. Use it whenever you
build or restyle UI so every surface looks like the same product. It is a real
workspace package (`@workspace/samra-pay-ds`): other artifacts depend
on it and import its theme and components directly.

## What's here

- `docs/references/logos/` — retained brand marks: `logo.png` (wordmark), `icon-32.png`, `icon-192.png`. Source: `artifacts/samra-pay/public/`. Always use the real mark here for the preview logo — never invent or regenerate it. The preview loads it from `public/logo.png` (copied alongside).
- `docs/references/component-inventory.md` — full component inventory index: all 54 UI families + custom components, chunk assignments, and implementation status. Read this before modifying any cataloged component. Pilot (chunk 1): Button, Badge, Card, Input, Avatar — all implemented. Remaining families are pending in chunks 2–3.
- `tokens.json` — the single source of truth (DTCG format): colors (full light
  and dark sets, including the cultural palette: `coffee`, `berbere`,
  `eucalyptus`, `injera` + foregrounds; chart2–4 alias them), typography
  (`sans`, `serif`, `mono`, `ethiopic` — Noto Serif Ethiopic for Amharic),
  spacing, and radius.
- `scripts/theme-template.css` — the hand-editable CSS template that
  `build-tokens.mjs` fills in. Non-color foundations live here: the 5-step
  elevation ramp (`shadow-e1…e5`) with gold-ambient variants
  (`shadow-gold-sm|md|lg`), motion tokens (`ease-standard|entrance|emphasized|exit`,
  `animate-float-slow`, `animate-fade-up`, `animate-shimmer`, …), the Ethiopian
  pattern utilities (`pattern-telsem|axum|tibeb|mesob` with
  `pattern-sparse|dense` density modifiers), and the reduced-motion contract.
  Edit the template, not the generated `src/index.css`.
- `scripts/build-tokens.mjs` — generates the outputs below from `tokens.json`.
- `src/index.css` — GENERATED token theme (web), exported as `./styles.css`.
- `src/generated/tokens.tsx` — GENERATED hex token object, the package's `.` and
  `./tokens` entry. Mobile (Expo) and other platforms import this.
- `public/favicon.svg` — GENERATED app icon from `tokens.json` + the title.
- `src/components/ui/` — the initial shadcn scaffold, exported as
  `./components/*`. Generated systems keep and theme it; Figma imports prune and
  restyle it; code imports replace it with the source component library.
- `src/lib/` (`cn`) and `src/hooks/` — exported as `./lib/*` and `./hooks/*`.
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
- `src/preview/foundations.tsx` — token-driven Overview, Colors, Fonts, and Layout
  pages.
- `src/preview/parts.tsx` — shared page helpers, including `Guidelines` for design
  and composition do's/don'ts (colour/component usage, hierarchy, voice and tone,
  not technical implementation notes). Populate it only with guidance derived
  from the source; omit it when the source documents no usage rules.
- `src/preview/demos/<component>.tsx` — component stories. Keep these stories and
  the registry aligned with the final web component inventory.
- `docs/consuming-web.md` and `docs/consuming-expo.md` — platform-specific usage.
- `docs/migrating-web.md` and `docs/migrating-expo.md` — replacing scaffolded or
  existing local design-system implementations.

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

## Editing and maintaining the design system

Edit `tokens.json` only, then run `pnpm tokens`; the dev server also regenerates
on change. Never hand-edit `src/index.css` or `src/generated/tokens.tsx`.

Every user-facing web component under `src/components/ui/` must have a family
story in `src/preview/demos/` covering its variants, sizes, and important states.
Register each family once in `src/preview/registry.tsx`. If a component changes,
update its story and registry entry in the same change and note meaningful
additions or customizations in "What's here" above. Register new component pages
with dynamic imports; do not eagerly import stories into the registry.

Native components live under `src/components/native/`. Match an existing web
component family's public API wherever React Native supports it, and document
platform-required differences in "What's here". Native components are not
imported into the web-only Vite preview.

Keep `DESIGN_SYSTEM.title` and `DESIGN_SYSTEM.description` accurate. Update
`NAV_GROUPS` whenever the system gains or loses a foundation, content guideline,
chart, motion rule, or applied example.

## Keep it template-ready

This design system is a prime candidate to be saved to the workspace as a
reusable template, and a template is packaged as this one directory alone. Keep
it self-contained as you maintain it so that save works: use concrete dependency
versions (never `catalog:`), keep `tsconfig.json` standalone (never `extends` a
workspace-relative base), and never import from a sibling artifact or a shared
`@workspace/*` lib. A saved template is consumed as a read-only style donor
(re-authored from, not rebuilt), so keep the generated `src/index.css` and
`src/generated/tokens.tsx` committed so the template carries a readable theme
snapshot. If maintenance ever introduces a cross-artifact or workspace-lib
dependency, load the `prepare-artifact-template` skill and follow it to pull the
dependency back in before the user saves the template.

## Prototyping on the canvas

Use the mockup-sandbox skill's "Design systems" flow. It creates a sandbox entry
for `@workspace/samra-pay-ds` and renders mockups using this package's
theme and components.

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

A freshly scaffolded app counts as a migration when it still contains local
theme, hook, or component copies that this package supersedes. Read the platform
consumption guide first, then its migration guide before authoring UI.

For web/static consumers, follow the workspace dependency placement rules from
the pnpm-workspace skill. Expo is a runtime consumer, so the package belongs in
`dependencies`.

Before migrating an entire app, render one platform-appropriate primitive from
the package and run the consumer's typecheck and dev server. Proceed only after
the import resolves and the primitive uses this design system's theme.

## Universal rules

- Match exact token values. Do not invent colors, fonts, spacing, or radii in a
  consuming app.
- Keep product data, navigation, application state, and product-specific
  compositions in the app. Product-agnostic visual primitives belong here.
- Read these docs in place. Do not copy them into another artifact.
