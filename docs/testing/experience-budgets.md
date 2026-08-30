# Customer experience artifact budgets

## Decision

Samra Pay measures production artifacts after every governed build. A missing,
ambiguous, or oversized artifact fails the same GitHub quality gate that guards
the customer web, mobile, and Operations Portal source.

The machine-readable authority is
[`experience-budgets.json`](experience-budgets.json). Version 2 distinguishes
size-bounded artifacts from artifacts that must remain absent. Public web
limits use the August 30, 2026 coming-soon production build; operations and
mobile limits retain the August 19, 2026 known-good build. Each ceiling has
controlled headroom for normal compiler variation:

| Artifact                         | Baseline raw | Baseline gzip |    Enforced raw |   Enforced gzip |
| -------------------------------- | -----------: | ------------: | --------------: | --------------: |
| Public web entry JavaScript      |    189,970 B |      60,276 B |       240,000 B |        80,000 B |
| Public shell JavaScript          |      8,720 B |       3,410 B |        15,000 B |         6,000 B |
| Public home JavaScript           |     15,800 B |       6,030 B |        25,000 B |         9,000 B |
| Legacy onboarding JavaScript     |       absent |        absent | required absent | required absent |
| Legacy Auth0 JavaScript          |       absent |        absent | required absent | required absent |
| Public web styles                |     60,570 B |      12,060 B |        80,000 B |        18,000 B |
| Operations entry JavaScript      |    516,905 B |     152,682 B |       600,000 B |       180,000 B |
| Mobile iOS production JavaScript |  3,619,606 B |     865,077 B |     4,000,000 B |     1,000,000 B |
| Mobile Android production JS     |  3,617,528 B |     864,877 B |     4,000,000 B |     1,000,000 B |

## Change rule

A size budget may increase only in a dedicated pull request that includes the
new measured baseline, a customer or operational reason, and an explicit
review of the regression. Renaming, omitting, or emitting multiple required
artifacts fails closed instead of silently selecting one. A forbidden-artifact
budget fails if even one matching file returns.

The ceilings are regression stop conditions, not performance targets. The
current customer and operations entry bundles remain candidates for a separate,
measured code-splitting pass; this contract prevents them from growing while
that work is prioritized.

The public coming-soon surface forbids the Auth0 SDK and legacy onboarding
bundle entirely. Auth0 remains isolated to the unfinished customer application
and can receive a separate, measured release profile when that product is
authorized. This prevents identity-provider or onboarding code from silently
returning to the public acquisition bundle.

These budgets prevent artifact-size drift. They do not claim real-device load
time, network latency, interaction responsiveness, or accessibility conformance.
Those remain separate manual evidence until browser/device automation is
approved.
