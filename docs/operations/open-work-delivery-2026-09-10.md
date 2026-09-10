# Open work delivery inventory — 2026-09-10

Owner: David Haile. Live GitHub open-PR inventory inspected September 10.
PR #213 merged at 15:06 UTC; its runtime source is unchanged in protected main.
PR #214 carries the access correction and dated activation evidence.
This assigns the next required acceptance path; it does not assert existing PR
contents were fully reviewed, merged, deployed or accepted.

| Open PRs | Affected work | Next delivery requirement |
| --- | --- | --- |
| #214 (follows merged #213) | Shared Dev/Test access verification and activation evidence | Preserve exact image/operator versions; deployment/session proof completed; real two-user acceptance and alert delivery remain |
| #215 | Native SDK compatibility and Dev/Test callback isolation | Local custom build, installed Dev/Test auth acceptance, then staging; no Expo-major upgrade |
| #194 | Returning customer account access | Rebase/review current main; Dev login/resume/logout; Test repeat login, isolation and pending KYC |
| #190 | Persona hosted inquiry | Synthetic Dev/Test onboarding first; real Persona activation remains blocked on company/provider prerequisites |
| #193, #156 | Personal funding and customer-controlled wallets | Dev/Test idempotency, provider-failure and ownership tests; production provider acceptance and separate funding authorization remain required |
| #208, #210, #206, #163 | Marketing verification, consent and measurement | Reconcile dependencies; disposable automated tests, isolated synthetic Dev/Test validation and site preview; verify email/consent behavior before separate public release |
| #174 | Auth0 theme | Isolated login-theme review and Dev/Test readability/authentication regression; saved artwork is not active branding |
| #173 | Hosting/image release | Inspect current deployed artifact and preview diff; existing separate site-release authorization and rollback boundary |
| #159 | Historical vendor test/Qase work | Review against merged Qase retirement; reuse unique tests and evidence; do not restore Qase as a release dependency |
| #179, #178, #141, #138 | Mobile runtime dependencies | Resolve compatible dependency set and lockfile; installed Dev and Test iOS/Android builds, auth redirects, secure session persistence and affected flows |
| #146, #145, #140 | Web/UI/compiler dependencies | Compatible lockfile review, build checks, affected Dev/Test customer and public-site regression |
| #143, #137 | Logging/PostgreSQL dependencies | Runtime redaction, persistence, TLS, ledger idempotency and restart regression in Dev/Test |
| #135 | Container Node major upgrade | Reconcile supported Node version before approval; full containers/migrations and Dev/Test startup/drain/restart proof |
| #176, #136 | CI action dependencies | Relevant workflow/provenance/artifact verification; document any runtime-test non-applicability |

All application candidates then pass the existing Staging rehearsal and separate
Production authorization. No PR in this inventory is implicitly approved to merge.
Keep the existing GitHub issues/Project and user-test scenarios as the record.

The first facilitated session is tracked in [issue #216](https://github.com/samra-pay/Samra-Pay/issues/216). Participant execution is blocked until the two testers and private sign-in are available; preserve failures and append retests.
