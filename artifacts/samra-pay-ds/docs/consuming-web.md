# Consuming Samra Pay Design System in web apps

Read `artifacts/samra-pay-ds/docs/AGENTS.md` first. This guide covers
React/Vite and other shadcn/Tailwind web consumers. If the app already contains
a local theme or component library, also read
`artifacts/samra-pay-ds/docs/migrating-web.md` before writing UI.

## Theme

Import this package's theme once from the app's main CSS:

```css
@import "@workspace/samra-pay-ds/styles.css";
```

`styles.css` already imports Tailwind, its plugins, and this package's token
theme. It also registers this package's component sources. Do not add a separate
Tailwind import or a `node_modules` source path in a Tailwind v4 consumer.
Tailwind v3 consumers keep their existing `@tailwind` directives and add
`node_modules/@workspace/samra-pay-ds/src/components` to `content`.

## Fonts (required)

The theme references three web fonts that `styles.css` does NOT bundle — the
system loads them as non-blocking `<link>` tags to avoid render-blocking CSS
`@import`. Every consuming web app must add this to its `index.html` `<head>`
(this exact set: Outfit for UI, EB Garamond for display, Noto Serif Ethiopic
for Amharic / `font-ethiopic`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700;1,800&family=Noto+Serif+Ethiopic:wght@400;500;600;700&display=swap">
```

Without this, `font-sans`, `font-serif`, and `font-ethiopic` silently fall back
to generic system fonts — Amharic text in particular will not render in the
intended typeface. The design-system preview's own `index.html` is the
reference implementation.

## Components and helpers

Import every provided primitive, `cn`, and toast API directly from this package:

```tsx
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { cn } from "@workspace/samra-pay-ds/lib/utils";
import {
  toast,
  useToast,
} from "@workspace/samra-pay-ds/hooks/use-toast";
```

Use the package component whenever it provides the required family. Keep
product-specific compositions in the app, but compose them from package
primitives rather than recreating those primitives locally.

The packaged `Toaster` and toast hook share one in-memory store. Do not call a
local toast hook while rendering the packaged `Toaster`.

## Signature patterns

Four higher-order Samra Pay compositions ship as pattern components. They are
built from package primitives and tokens; import them from the patterns path:

```tsx
import { BankCard, Card3DWrapper } from "@workspace/samra-pay-ds/components/patterns/bank-card";
import { QuotePanel } from "@workspace/samra-pay-ds/components/patterns/quote-panel";
import { RewardCard } from "@workspace/samra-pay-ds/components/patterns/reward-card";
import {
  SelectableTile,
  SelectableTileGroup,
} from "@workspace/samra-pay-ds/components/patterns/selectable-tile";
```

- **`bank-card`** — `BankCard` (variants `charge` / `co-brand` / `debit`, front +
  back flip, accessible toggle) and `Card3DWrapper` (pointer tilt + glare). Card
  faces are intentionally fixed art and mode-independent; keep surrounding UI
  token-driven. Use `coBrandSlot` for a partner mark on the co-brand variant.
- **`quote-panel`** — `QuotePanel` remittance calculator (You send USD → They
  receive ETB, fee row, illustrative-rate row, total, gold CTA). Controlled via
  `amount` + `onAmountChange` or uncontrolled via `defaultAmount`. All demo
  figures are labelled illustrative.
- **`reward-card`** — `RewardCard` gold-stripe loyalty spotlight (balance, tier,
  optional goal progress + action). Carries an "Illustrative demo reward" line.
- **`selectable-tile`** — `SelectableTile` and `SelectableTileGroup` for
  radio-semantics choice tiles; selected state is `border-primary` + `bg-accent`
  + a gold check, with roving keyboard focus and a disabled state.

## Verify

After wiring the workspace dependency, import and render
`@workspace/samra-pay-ds/components/ui/button`. Run the app's typecheck
and dev server. The import must resolve and the Button must use this package's
theme before broader UI work begins.

## Ongoing rules

- Keep one source of theme variables.
- Import package-provided primitives and helpers from the package path.
- Add reusable product-agnostic components to this package first.
- For a non-shadcn app, use the tokens as the source of truth and adapt existing
  components to the token CSS variables without copying token values.
