# Open Design Decisions — Samra Pay Design System

This document tracks unresolved design decisions, known gaps, and items requiring future attention.

---

## 1. New Hex Values in Status Tokens (Outside Existing Palette)

Three new hex values were introduced in the `status` token group that were not in the original color palette. These need design review:

| Token | Value | Role | Decision needed |
|-------|-------|------|-----------------|
| `status.information.foreground` | `#60a5fa` | Blue-400 — information status foreground | Should this map to an existing palette color (primary gold feels wrong for "info"), or should a blue be added to the base palette? |
| `status.failed.foreground` | `#f87171` | Red-400 — more legible on dark than dark-mode destructive (#803636) | Should `#f87171` be added to the main color palette as `destructiveForegroundDark` or similar? |
| `status.cancelled.foreground` | `#ef4444` | Red-500 — distinct from failed for differentiation in text | Same question as above. Consider merging failed and cancelled foregrounds. |

**Current state:** Values are in `tokens.json` as literal hex strings in the `status` group. They are NOT added to `color.light` or `color.dark` and therefore do NOT appear in the generated CSS theme or tokens.tsx.

**Recommendation options:**
1. Add `information`, `informationForeground` to both `color.light` and `color.dark` palette groups
2. Add `statusFailed` foreground variant to palette
3. Accept as status-only hex values (current state) — simpler but means these colors won't be available as Tailwind utilities

---

## 2. Replit-Specific DevDependencies

### Current state

The package has three Replit-specific devDependencies:

| Package | Usage | Portability issue |
|---------|-------|------------------|
| `@replit/vite-plugin-cartographer` | Conditionally loaded in `vite.config.ts` only when `REPL_ID` is set | Harmless outside Replit — guard prevents activation |
| `@replit/vite-plugin-dev-banner` | Listed in `package.json` but NOT imported or used anywhere | Can be removed safely |
| `@replit/vite-plugin-runtime-error-modal` | Used unconditionally in `vite.config.ts` | Required for error overlay in Replit dev environment |

### Actions available

**Option A: Leave as-is for template use**
- All three are `devDependencies` — they don't affect the npm package build.
- `cartographer` is conditionally activated — harmless outside Replit.
- `runtime-error-modal` will be installed but the plugin is dev-only and doesn't affect output.
- Template consumers can remove them after copying.

**Option B: Remove `@replit/vite-plugin-dev-banner`**
- This package is not used anywhere — safe to remove with no functional impact.
- Reduces unnecessary dependencies.

**Option C: Make all Replit plugins conditional**
- Wrap `runtimeErrorOverlay()` in the same `REPL_ID` guard as `cartographer`.
- Template consumers outside Replit would not load this plugin.

**Decision needed:** Whether to pursue Option B or C. Option B is the minimum cleanup.

**Note:** Modifying `vite.config.ts` to remove `runtime-error-modal` unconditionally could break the Replit development environment. This is why changes are documented here rather than made immediately.

---

## 3. Native Font Weights Available

The `fontFamily` export in `native-theme.tsx` currently maps:
- Outfit: 400 Regular, 500 Medium, 600 SemiBold, 700 Bold, 800 ExtraBold
- EB Garamond: 500 Medium, 500 Medium Italic, 600 SemiBold
- Noto Serif Ethiopic: 400 Regular, 600 SemiBold

The `Text.tsx` native component uses `fontFamily.serif.medium` for all EB Garamond styles since there is no 400 Regular registered. If EB Garamond 400 Regular is needed for `display` variants, it needs to be added to `@expo-google-fonts/eb-garamond` loading.

**Decision needed:** Should EB Garamond 400 Regular weight be added to `use-fonts.tsx`?

---

## 4. Bottom Safe Area in Native Components

`BottomSheet.tsx` and `ModalShell.tsx` accept `safeAreaInsets` as props. `Toast.tsx` renders at a fixed offset from top (60px). `ListRow.tsx`, `Card.tsx` etc. do not account for safe areas.

Screen-level safe area handling is the consumer's responsibility. Components should not need to know safe area values. However, for `Toast` (which renders in a `ToastProvider` overlay), the 60px top offset may be too little on devices with a Dynamic Island or notch.

**Decision needed:** Should the `ToastProvider` accept a `topInset` prop from the consumer to position the toast correctly on all devices?

---

## 5. Density Token Application

Layout tokens define `density.compact = 0.75`, `density.standard = 1.0`, `density.spacious = 1.375` as multipliers. Currently these are token values only — no component uses them.

**Decision needed:** Should a `DensityProvider` context be created that components read to adjust their spacing? Or is density a consumer responsibility (override spacing props)?

---

## 6. Icon Library Strategy

Status tokens define `iconName` as descriptive strings (e.g., "check-circle", "x-circle", "wifi-off"). Components use text-based Unicode characters instead of SVG icons (to avoid third-party icon library dependency).

This means the visual quality of icons in native components is limited to Unicode symbols.

**Options:**
1. **Current approach** — Unicode symbols. Zero dependencies. Poor visual quality for some icons.
2. **Optional icon prop** — Consumer passes their icon library's component. Components accept `icon?: ReactNode`. Current approach for most components.
3. **Peer dependency on lucide-react-native** — Add as optional peer. Only activates if consumer installs it.

**Decision needed:** Whether to document a recommended icon library for native and add it as an optional peer dependency.

---

## 7. Contrast Testing for Status Token Colors

Status token foreground/background pairs have not been programmatically contrast-tested. The existing `validateContrast` function in `build-tokens.mjs` only tests the main color palette pairs.

**Decision needed:** Should the contrast validation be extended to check status.*.foreground against status.*.background pairs? The three new hex values (#60a5fa, #f87171, #ef4444) have not been formally WCAG-validated against their respective backgrounds.

Manual estimates:
- `#60a5fa` on `#1e2a3a`: likely ~4.5:1 — needs verification
- `#f87171` on `#1f0a0a`: likely ~5:1 — needs verification
- `#ef4444` on `#1f0a0a`: likely ~4:1 — may be borderline

**Action:** Extend `contrast.test.mjs` to include status token pairs.

---

## 8. Web Preview of Native Components

`src/preview/native-catalog/NativeCatalog.tsx` is a React web file documenting native components. This approach means native components are documented but not live-previewed in the web browser (which would require `react-native-web` or a similar renderer).

**Decision needed:** Whether to add `react-native-web` as a devDependency to enable live preview of native components in the Vite preview app.

**Consideration:** `react-native-web` is a significant dependency that may introduce compatibility issues. The current code-example approach is simpler and avoids these issues.

---

## 9. CHANGELOG Format

CHANGELOG.md uses a simple prose format. Standard options:

- **Keep a Changelog** format (keepachangelog.com) — structured, conventional
- **Conventional Commits** derived — automated from commit messages
- **Simple prose** — current approach

**Decision needed:** Standardize CHANGELOG format before first version tag.
