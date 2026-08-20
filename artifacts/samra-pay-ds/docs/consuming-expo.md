# Consuming Samra Pay Design System in Expo apps

Read `artifacts/samra-pay-ds/docs/AGENTS.md` first. React Native does
not consume web CSS or DOM components. It imports portable tokens, native
theme/hooks, and native components directly from this package. This guide also
owns migration from scaffolded or local Expo design-system copies.

## Native theme and fonts

Build the shared light/dark palette, numeric radius and spacing conversion, and
registered typography names in `src/lib/native-theme.tsx`. Convert CSS lengths
once inside this package:

```tsx
import { tokens } from "@workspace/samra-pay-ds/tokens";

const radius = tokens.radius.endsWith("rem")
  ? Number.parseFloat(tokens.radius) * 16
  : Number.parseFloat(tokens.radius);
```

Export `useColors` from `src/hooks/use-colors.tsx`. Export a font hook from
`src/hooks/use-fonts.tsx` that loads every required weight through `useFonts` and
returns `fontsLoaded` and `fontError`. Use exact registered names such as
`Outfit_400Regular`, not CSS family names.

For Amharic copy, also load Noto Serif Ethiopic (e.g. via
`@expo-google-fonts/noto-serif-ethiopic`) in the same font hook and expose it
through the native typography names — `tokens.fontFamily.ethiopic` names the
CSS stack; native code must map it to the registered Expo font names.

Expo imports these concrete paths directly:

```tsx
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { useDesignSystemFonts } from "@workspace/samra-pay-ds/hooks/use-fonts";
```

Keep the root layout's existing SplashScreen gating around the shared font
hook's `fontsLoaded` and `fontError` result.

## Native components

Before writing screens, inventory the app's visual building blocks and add the
product-agnostic families it needs under `src/components/native/`. Typical
families include Button (including `size="icon"`), typography, Input, Textarea,
Label and Field, Card, Badge, Toggle or ToggleGroup, Empty, Spinner, and
Skeleton.

When `src/components/ui/` has a web counterpart, match its family exports, prop
names, variants, sizes, defaults, and state semantics wherever React Native
supports them. Implement with native primitives and document platform-required
differences in the base `AGENTS.md` inventory.

Import native primitives directly:

```tsx
import { Badge } from "@workspace/samra-pay-ds/components/native/badge";
import { Button } from "@workspace/samra-pay-ds/components/native/button";
import { Card } from "@workspace/samra-pay-ds/components/native/card";
```

Keep product data, navigation, state, and domain compositions in Expo. A
pet-adoption `DogCard`, for example, stays app-owned but composes package Card,
Button, Badge, and typography primitives.

## Dependencies and assets

When native package source imports `react-native`, Expo modules, or font
packages, declare compatible versions in this package's peer and development
dependencies and in the consuming Expo artifact's dependencies.

Metro resolves the workspace package through pnpm symlinks. Do not copy source
or token values. Loose binary assets may still need copying into Expo because
Metro does not watch sibling artifact folders by default.

Set `app.json`'s literal `splash.backgroundColor` from
`tokens.color.light.background` and keep it synchronized when that token changes.

## Verify

Import and render
`@workspace/samra-pay-ds/components/native/button`, then run Expo
typecheck and the development workflow. The import, native theme, and font hook
must resolve before broader screen work begins.

## Migrating an existing Expo app

1. Inventory local colors, theme hooks, font loading, and product-agnostic
   components before deleting anything.
2. Rewrite theme, color, and font imports to the package paths above while
   preserving root-layout SplashScreen gating.
3. Replace local Buttons, typography, Inputs, Fields, Cards, Badges, Toggles,
   Empty states, Spinners, and Skeletons with native package components. Keep
   product-specific compositions local.
4. Delete superseded theme/hooks/components and dependencies only after all
   callers move. Do not leave compatibility re-exports.
5. Search for old local import paths, run Expo typecheck and the development
   workflow, then verify theme, fonts, and one package primitive on device.
