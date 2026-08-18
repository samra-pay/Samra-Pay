# Component Governance — Samra Pay Design System

This document defines how components are added, modified, and maintained.

---

## 1. Component Classification

### Tier 1: Primitive Components (src/components/ui/)
Shadcn/ui-derived components using Radix UI primitives. Theming comes from CSS custom properties. 54 families implemented.

**Governance:**
- Source of truth: this package
- Modification: requires updating both the component and its preview demo
- Addition: requires shadcn/ui as the scaffold base, or manual Radix primitive wrapping

### Tier 2: Pattern Components (src/components/patterns/ and src/components/native/patterns/)
Compositions of primitives for Samra Pay-specific use cases.

**Governance:**
- Must be presentation-only — no business logic, API calls, or state management
- Financial patterns must follow `docs/financial-ui-truth.md` rules
- Addition requires: component file + documentation update

### Tier 3: Native Primitive Components (src/components/native/)
React Native-only implementations. No Radix, no DOM elements.

**Governance:**
- Match web component API where React Native supports it
- Touch targets must meet minimum dimensions
- All interactive components require `accessibilityLabel`

---

## 2. Adding a Web UI Component

1. Use shadcn/ui CLI or manually create in `src/components/ui/<name>.tsx`
2. Create demo at `src/preview/demos/<name>.tsx`
3. Register in `src/preview/registry.tsx` using `lazy(() => import(...))`
4. Add to `docs/references/component-inventory.md`
5. Run `pnpm typecheck` to verify types

**Rules:**
- All files are `.tsx` (even if no JSX)
- Import other components with relative paths
- Never use `@/` alias
- Never import from outside this package

---

## 3. Adding a Native Component

1. Create `src/components/native/<Name>.tsx`
2. Export named export + default export
3. Add to `src/components/native/index.tsx` (exports + types)
4. Add to `docs/references/native-component-inventory.md`
5. Add usage example to `src/preview/native-catalog/NativeCatalog.tsx`

**Rules:**
- React Native primitives only (View, Text, Pressable, etc.)
- No Radix UI, no DOM imports
- Minimum touch targets from interaction tokens (48px cross-platform)
- `accessibilityLabel` required prop on interactive components

---

## 4. Modifying Existing Components

- If a prop is added, make it optional with a sensible default (do not break consumers)
- If a prop is removed, treat it as a breaking change (document in CHANGELOG.md)
- If visual output changes, update the preview demo to reflect the change
- Run `pnpm validate` after any modification

---

## 5. Breaking Changes

Breaking changes require:
1. Major version bump in `package.json`
2. CHANGELOG.md entry with migration instructions
3. Update to `docs/migrating-web.md` or `docs/migrating-expo.md`

Breaking changes include:
- Removing a prop
- Changing a prop's type
- Changing a component's default behavior
- Removing a color token
- Removing a CSS custom property

Non-breaking:
- Adding optional props
- Improving contrast ratios
- Adding new token groups
- Adding new components

---

## 6. Token Governance

See `docs/semantic-tokens.md` for the full token reference.

**Rules:**
- Edit `tokens.json` only — never hand-edit generated files
- All alias references (`{color.dark.eucalyptus}`) must resolve — the build script validates this
- All required top-level groups must be present — the build script validates this
- All color pairs must pass WCAG AA — the build script validates this
- Run `pnpm tokens:check` to verify no drift between `tokens.json` and committed generated files

**Adding a token:**
1. Add to `tokens.json` in the appropriate group
2. Run `pnpm tokens` to regenerate
3. Verify in `src/generated/semantic-tokens.tsx`
4. Update `docs/semantic-tokens.md` if the change is user-facing

**Removing a token:**
1. Check if any component references it (search the codebase)
2. If removing a color pair, run contrast validation to confirm no other pairs are affected
3. Treat as breaking change

---

## 7. Preview Story Requirements

Every web component family must have a preview story that demonstrates:
- All variants
- All sizes (if applicable)
- Disabled state (if applicable)
- Loading state (if applicable)
- All meaningful prop combinations

Stories must not contain business logic, API calls, or mock data with real names/numbers.

---

## 8. File Naming Convention

| Type | Convention | Example |
|------|-----------|---------|
| Web component | kebab-case.tsx | button-group.tsx |
| Native component | PascalCase.tsx | ButtonGroup.tsx |
| Preview demo | kebab-case.tsx | button-group.tsx |
| Pattern | PascalCase.tsx or kebab-case.tsx | QuotePanel.tsx |
| Script | kebab-case.mjs | build-tokens.mjs |
| Test | kebab-case.test.mjs | tokens.test.mjs |
| Doc | kebab-case.md | content-and-voice.md |

All TypeScript source files use `.tsx` extension — even if they contain no JSX.
All scripts use `.mjs` (ES module, not TypeScript).
All tests use `.test.mjs`.

---

## 9. Review Checklist

Before merging any design system change:

- [ ] `pnpm validate` passes (tokens + drift check + typecheck)
- [ ] `pnpm test` passes (all 4 test files)
- [ ] Preview demo updated
- [ ] component-inventory.md or native-component-inventory.md updated
- [ ] CHANGELOG.md updated
- [ ] No imports from outside artifacts/samra-pay-ds/
- [ ] No `@/` alias used
- [ ] All .tsx extension (no .ts files added)
- [ ] No `catalog:` in package.json dependencies
- [ ] Touch targets ≥ 48px for any new interactive native component
- [ ] Financial components display-only (no calculations)
