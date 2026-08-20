# Samra Pay design system current state

Status: current repository snapshot for the Alpha documentation refresh. The
versioned package is authoritative; raw ZIP files, screenshots, Replit previews,
and compiled output are reference evidence only.

## Source inventory

| Area | Current source |
| --- | --- |
| Semantic tokens | `tokens.json`, generated CSS, and generated TypeScript |
| Web components | 55 component files in `src/components/ui/` |
| Web financial patterns | 4 files in `src/components/patterns/` |
| Native components | 23 files in `src/components/native/` |
| Native financial patterns | 16 files in `src/components/native/patterns/` |
| Review browser | 58 component demos plus applied web, mobile, and remittance pages |
| Documentation | 21 Markdown files covering design, accessibility, content, truth, migration, and governance |

The earlier Phase 1 audit stated that native components did not exist. That
finding is superseded by this snapshot and the
[native inventory](references/native-component-inventory.md).

## Governing files

- [Package source of truth](../README.md)
- [Design foundations](design-foundations.md)
- [Semantic tokens](semantic-tokens.md)
- [Component governance](component-governance.md)
- [Financial UI truth](financial-ui-truth.md)
- [Accessibility](accessibility.md)
- [Content and voice](content-and-voice.md)
- [Web inventory](references/component-inventory.md)
- [Native inventory](references/native-component-inventory.md)
- [Testing](testing.md)
- [Design review checklist](design-review-checklist.md)
- [Open decisions](open-decisions.md)
- [Asset rights](asset-rights.md)

## Quality gates

The package provides automated controls for generated-token drift, light and
dark contrast, accessibility rules, required documentation, broken component
references, TypeScript, and the static review build. Pull requests produce a
commit-addressed design preview through GitHub Actions. Google Cloud is the
target hosted preview; Replit remains temporary development convenience.

Every financial surface must represent loading, empty, unavailable, stale,
offline, failure, and retry behavior where applicable. No component or screen
may infer a balance, quote, KYC decision, wallet state, or transaction result
from client fixtures while running in API mode.

## Alpha vendor presentation

Auth0, Persona, and Crossmint are factual internal architecture decisions, not
marketing partnerships. Real vendor marks belong only in controlled
architecture or integration-status surfaces until commercial and trademark use
is approved. Legacy Rain, Caliza, and Chapa preview labels are synthetic fixture
history and should be replaced before public use.

## Remaining evidence gates

- physical iOS and Android review across supported viewport and accessibility
  settings;
- hosted Google Cloud design preview at an immutable commit;
- removal or conditional isolation of remaining Replit-only development
  dependencies after preview parity;
- replacement of unapproved airline, loyalty, card-network, and vendor marks;
- manual design review of the complete Auth0, Persona, Crossmint, failure,
  recovery, and restricted-customer journeys;
- localization review for English, Amharic, and currency/number formatting.

This package is strong enough to govern Alpha implementation. It is not proof
of live vendor integration, production accessibility certification, trademark
permission, or physical-device acceptance.
