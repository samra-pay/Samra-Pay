# Samra Pay design system

This package is the authoritative, code-first design system for Samra Pay web
and native experiences. GitHub source, semantic tokens, governed components,
financial patterns, documentation, and tests define the approved system.

Replit, ZIP exports, screenshots, generated previews, and external design files
are reference or review surfaces. They do not override the versioned source.

## Source of truth

| Concern                                         | Authoritative location            |
| ----------------------------------------------- | --------------------------------- |
| Semantic color, type, spacing, and motion       | `tokens.json`                     |
| Generated web and native tokens                 | `src/generated/`                  |
| Web components                                  | `src/components/ui/`              |
| Web financial patterns                          | `src/components/patterns/`        |
| Native components                               | `src/components/native/`          |
| Native financial patterns                       | `src/components/native/patterns/` |
| Review browser                                  | `src/preview/`                    |
| Design, accessibility, content, and truth rules | `docs/`                           |
| Automated design gates                          | `src/tests/` and `scripts/`       |

## Required workflow

1. Start from current GitHub `main` on an isolated branch.
2. Change tokens before repeating raw visual values across components.
3. Build new screens from governed components and financial patterns.
4. Include loading, empty, stale, offline, unavailable, failure, and retry
   states when the product flow can encounter them.
5. Run token drift, tests, typecheck, and the preview build.
6. Review the GitHub-generated preview artifact at the exact commit under
   consideration.
7. Apply the design review checklist in `docs/design-review-checklist.md`.
8. Merge only after automated gates and manual review pass.

The `Design System Preview` GitHub workflow generates a downloadable static
preview for every relevant pull request and every merged change to `main`.
Later, the same preview can be hosted from the versioned Google Cloud container
without changing its source or relying on Replit.

## Raw files and build exports

- Never copy a raw archive over the versioned package.
- Compare archive source files and hashes before considering individual changes.
- Never commit `dist/`, `.tsbuildinfo`, or package ZIPs.
- Keep licensed logos and source assets only in their governed reference paths.
- Treat screenshots and compiled previews as evidence, not editable source.

Run the source boundary check directly with:

```sh
node artifacts/samra-pay-ds/scripts/check-source-boundary.mjs
```
