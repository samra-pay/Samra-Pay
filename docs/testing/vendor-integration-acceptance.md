# Vendor integration acceptance

Initial baseline: main `39a8babf4927685ce05b5f4623b6d258f6280380`, inspected 2026-09-05.
Validation checkout: `11f45f54efa5673722f0ff8ee885f739c01a843c`, which adds PR #158's private staging review package; those changes are preserved.
This package adds automated local-fixture evidence and pending connected
acceptance. It does not activate a vendor, provision a wallet, send an SMS,
change an account plan, deploy, or certify production readiness.

## Coverage and ownership

| Boundary                                   | Executable source / report                                                                                                       | Remaining connected evidence                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Auth0 tokens                               | `artifacts/api-server/src/auth0-token-boundary.test.ts`; `vendor-auth0-token.xml`                                                | Real tenant callback, mobile/web login, recovery, configured key rotation/outage behavior     |
| Auth0 identity and financial authorization | `artifacts/api-server/src/api.test.ts`; `test/postgres.test.ts` (SAMP-139–141); `test/postgres-http.test.ts` (SAMP-142)          | Exact deployed customer identity and consent journey                                          |
| Crossmint staging adapter                  | `artifacts/api-server/src/crossmint-customer-sandbox.test.ts`; `vendor-crossmint-sandbox.xml`                                    | Deployed allowlisted provisioning and timeout/retry against staging                           |
| Crossmint orchestration                    | `artifacts/api-server/src/customer-wallet.test.ts`; `vendor-customer-wallet.xml`; database cases in `test/postgres-http.test.ts` | Native database restart/replay; restriction during provisioning; tester signer/recovery proof |
| Persona                                    | `artifacts/api-server/src/persona.test.ts`; `vendor-persona.xml`; `src/customer-identity.test.ts`; database identity-event cases | Configured sandbox inquiry/webhook round trip and state binding                               |
| Twilio Verify                              | No adapter found in this baseline; no automated integration claim                                                                | Purpose decision, implementation and all five draft Twilio cases                              |

All `test/` paths above are relative to `artifacts/api-server/`.
Existing database and HTTP suites remain in their governed reports; do not
duplicate those cases or invent Qase IDs. The new named vendor reports expose
tests that were previously only present in general code testing.

Run the four `test:vendor-*:junit` commands in `artifacts/api-server/package.json`.
Each emits normal JUnit to `artifacts/api-server/test-results/`. CI's Linux
quality gate runs them using synthetic inputs with no vendor credentials. The
Auth0 test uses the real middleware with RSA-signed tokens and loopback HTTP
discovery/JWKS. Crossmint and Persona use injected, simulated provider responses.
Passing these tests is not evidence of configured tenant or deployed readiness.

## Connected acceptance catalog

`qase-vendor-connected-acceptance.csv` contains 17 **draft, unexecuted** cases:
four Auth0, five Twilio, six Crossmint and two Persona. Case IDs are blank;
no live import or execution is asserted. Review CSV field mapping in Qase's
import preview before import. These can also be executed as a GitHub release
checklist without Qase API access. Record actual IDs only after import.

Engineering owns implementation and evidence. David owns the scope/activation
decision. Before each connected run record the exact commit, deployed revision,
environment, test identity reference, approved operations, expiry, cost ceiling,
cleanup and responsible operator. Never place OTPs, tokens, full phone numbers,
identity documents or provider secrets in reports.

Twilio acceptance remains **blocked on implementation and purpose**. Select
phone possession, login, MFA or recovery explicitly; preserve an alternative
factor. Do not mark mocked OTP examples as a working Twilio integration.

Crossmint remains bounded by `docs/operations/crossmint-sandbox-connection.md`:
fake by default, one approved staging tester, immutable provider mapping and
identity/consent gates. Funding, transfer, recovery execution and signing are
outside the current adapter. The catalog describes additional evidence needed,
not permission to expand those operations.

## Decision sequence

1. Merge validated local tests and retain GitHub artifacts for the exact SHA.
2. Implement missing vendor functionality within an approved scope; satisfy
   relevant pending cases in a bounded non-production run.
3. Record pass/fail/blocked individually with evidence and unresolved defects.
   Require the relevant critical cases to pass before that feature's activation.

## Qase reporting discrepancy

CI run [33947575186](https://github.com/haileleuld87/Samra-Pay/actions/runs/33947575186)
job 101256523210 returned HTTP 403 on creation because API use requires a
Business plan. The job nevertheless concluded success because those errors
were tolerated. No stored Qase run was proven by that green check.

Ordinary Qase reporting now requires explicit opt-in and produces a delivery
receipt when enabled. A failed delivery fails its optional job, while
`Required CI` remains tied to code tests. The existing release-candidate Qase
certification gate has not been waived. See `qase-ci.md`.
