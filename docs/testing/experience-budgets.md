# Customer experience artifact budgets

## Decision

Samra Pay measures production artifacts after every governed build. A missing,
ambiguous, or oversized artifact fails the same GitHub quality gate that guards
the customer web, mobile, and Operations Portal source.

The machine-readable authority is
[`experience-budgets.json`](experience-budgets.json). Limits are based on the
August 19, 2026 known-good production-mode artifact build with controlled
headroom for normal compiler variation:

| Artifact                         | Baseline raw | Baseline gzip | Enforced raw | Enforced gzip |
| -------------------------------- | -----------: | ------------: | -----------: | ------------: |
| Customer web entry JavaScript    |  1,202,903 B |     347,617 B |  1,350,000 B |     400,000 B |
| Customer onboarding JavaScript   |     20,084 B |       7,043 B |     30,000 B |      10,000 B |
| Customer Auth0 JavaScript        |       lazy B |        lazy B |    150,000 B |      45,000 B |
| Customer web styles              |    187,503 B |      26,500 B |    220,000 B |      32,000 B |
| Operations entry JavaScript      |    516,905 B |     152,682 B |    600,000 B |     180,000 B |
| Mobile iOS production JavaScript |  3,619,606 B |     865,077 B |  4,000,000 B |   1,000,000 B |
| Mobile Android production JS     |  3,617,528 B |     864,877 B |  4,000,000 B |   1,000,000 B |

## Change rule

A budget may increase only in a dedicated pull request that includes the new
measured baseline, a customer or operational reason, and an explicit review of
the regression. Renaming, omitting, or emitting multiple matching entry
artifacts fails closed instead of silently selecting one.

The ceilings are regression stop conditions, not performance targets. The
current customer and operations entry bundles remain candidates for a separate,
measured code-splitting pass; this contract prevents them from growing while
that work is prioritized.

The Auth0 SDK is an explicit lazy artifact. Mock mode never downloads it, and
API mode loads it only after validated public Auth0 configuration reaches the
customer authentication boundary. Its separate ceiling prevents that optional
provider code from silently returning to the initial customer entry bundle.

These budgets prevent artifact-size drift. They do not claim real-device load
time, network latency, interaction responsiveness, or accessibility conformance.
Those remain separate manual evidence until browser/device automation is
approved.
