# Customer experience artifact budgets

## Decision

Samra Pay measures production artifacts after every governed build. A missing,
ambiguous, or oversized artifact fails the same GitHub quality gate that guards
the customer web, mobile, and Operations Portal source.

The machine-readable authority is
[`experience-budgets.json`](experience-budgets.json). Version 3 distinguishes
single artifacts, exact-count collections, aggregate limits, and artifacts that
must remain absent. Public web limits use the August 31, 2026 optimized
coming-soon production build; operations and mobile limits retain the August
19, 2026 known-good build. Each ceiling has controlled headroom for normal
compiler variation:

| Artifact                         | Baseline raw | Baseline gzip |       Enforced raw |      Enforced gzip |
| -------------------------------- | -----------: | ------------: | -----------------: | -----------------: |
| Public web entry JavaScript      |    189,970 B |      60,281 B |          240,000 B |           80,000 B |
| Public shell JavaScript          |     11,355 B |       4,263 B |           13,059 B |            4,903 B |
| Public home JavaScript           |     14,021 B |       4,985 B |           16,125 B |            5,733 B |
| Legacy onboarding JavaScript     |       absent |        absent |    required absent |    required absent |
| Legacy Auth0 JavaScript          |       absent |        absent |    required absent |    required absent |
| Public web styles                |     59,744 B |      11,793 B |           68,706 B |           13,562 B |
| Production image files           |     97,392 B |           n/a |     200,000 B each |                n/a |
| Home mobile AVIF candidates      |    133,758 B |           n/a | 400,000 B combined |                n/a |
| Home mobile WebP candidates      |    163,668 B |           n/a | 400,000 B combined |                n/a |
| Home first-load transfer proxy   |    412,250 B |     216,512 B |                n/a | 575,000 B combined |
| Public source maps               |       absent |        absent |    required absent |    required absent |
| Public runtime configuration     |       absent |        absent |    required absent |    required absent |
| Operations entry JavaScript      |    516,905 B |     152,682 B |          600,000 B |          180,000 B |
| Mobile iOS production JavaScript |  3,619,606 B |     865,077 B |        4,000,000 B |        1,000,000 B |
| Mobile Android production JS     |  3,617,528 B |     864,877 B |        4,000,000 B |        1,000,000 B |

## Change rule

A size budget may increase only in a dedicated pull request that includes the
new measured baseline, a customer or operational reason, and an explicit
review of the regression. Renaming, omitting, or emitting multiple required
artifacts fails closed instead of silently selecting one. A forbidden-artifact
budget fails if even one matching file returns.

Collection budgets enumerate an exact number of recursively matched files,
measure every match even when the count is wrong, apply per-file limits to each
artifact, and apply aggregate limits to the complete matched set. The public
image collection therefore fails on an omitted, unexpected, or oversized image.
The two home mobile collections independently cover the four hashed 640-pixel
AVIF assets and their four WebP fallbacks used by the mobile home route: hero,
proof, phone, and pattern. Browser evidence separately proves which assets enter
the initial 390-pixel request set and that below-fold images remain lazy until
they approach the viewport.

The home transfer collection adds the exact index, entry, shell, home, CSS,
32-pixel icon, and four mobile AVIF files. Its gzip sum is a conservative static
proxy below the 600,000-byte Firebase ceiling: Firebase serves text with Brotli,
which is verified after deployment, while already-compressed AVIF and PNG bytes
remain effectively unchanged. The deployed network trace remains authoritative
for protocol overhead, cache behavior, and Firebase's actual encoding.

The ceilings are regression stop conditions, not performance targets. The
current customer and operations entry bundles remain candidates for a separate,
measured code-splitting pass; this contract prevents them from growing while
that work is prioritized.

The public coming-soon surface forbids the Auth0 SDK and legacy onboarding
bundle entirely. Auth0 remains isolated to the unfinished customer application
and can receive a separate, measured release profile when that product is
authorized. This prevents identity-provider or onboarding code from silently
returning to the public acquisition bundle. The public build also forbids the
legacy runtime-configuration response; legacy application builds retain that
separate runtime contract.

These budgets prevent artifact-size drift. They do not claim real-device load
time, network latency, interaction responsiveness, or accessibility conformance.
Browser transfer, cache, LCP, and CLS evidence is recorded separately in
[`public-coming-soon-performance-evidence.md`](public-coming-soon-performance-evidence.md).
