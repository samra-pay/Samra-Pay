# Open design decisions

This is the compact decision register for the Samra Pay design system. The
current implementation remains authoritative until a decision is approved,
implemented, tested, and recorded in the changelog.

| Area | Current default | Decision required | Close gate |
| --- | --- | --- | --- |
| Status colors | `status` tokens contain three local hex values: `#60a5fa`, `#f87171`, and `#ef4444` | Keep them status-only or promote them into the base palette | Programmatic WCAG contrast checks pass for every status foreground/background pair |
| Replit development plugins | Replit-only packages remain development dependencies; one unused banner package is present | Remove the unused package and make the runtime overlay conditional when Replit is retired | Preview and build pass locally, in GitHub Actions, and in the temporary Replit review surface |
| Native typography | EB Garamond uses the registered 500 weight for display styles | Decide whether the 400 weight materially improves the product | Web/native visual review and font-loading tests pass |
| Native safe areas | Screen owners provide insets; toast uses a fixed top offset | Add a `topInset` input to the toast provider | Notch and Dynamic Island checks pass on representative iOS and Android devices |
| Density | Compact, standard, and spacious multipliers exist only as tokens | Keep density consumer-owned unless an Alpha operations use case requires a provider | No provider is added without two real product surfaces that need it |
| Icons | Components accept consumer icons and fall back to Unicode | Select an optional native icon library only if the current approach fails review | Accessibility names, bundle impact, web/native rendering, and dark mode pass |
| Native preview | Native APIs are documented in the web catalog but not rendered through `react-native-web` | Keep code examples for Alpha or adopt a live native preview | Add the dependency only with a tested maintenance owner and measurable review benefit |
| Changelog | Simple prose | Adopt Keep a Changelog before the first version tag | Release process and ownership are documented |

## Alpha priority

Only two decisions block Alpha-quality evidence:

1. Verify status-token contrast programmatically.
2. Verify native safe-area behavior on real device classes.

The other items are controlled improvements, not reasons to expand scope before
the Auth0, Persona, Crossmint, Google Cloud, and Qase Alpha path is proven.
