# Shared Dev/Test: initial tester setup

This operator CLI prepares the two-person synthetic roster and advances an
existing fake identity inquiry. It is the setup step for the shared customer
journey: login, customer consent, simulated identity decision, customer wallet
consent, wallet creation, logout and return. It does not create customer records, accept consent, or create wallets. The
separate funding operation below provisions a product account and one balanced
synthetic opening credit after an approved simulated identity.

Status: implementation for review. No shared database has been changed by this
build. Follow the [Dev/Test runbook](../../deploy/gcp/dev-test-environments.md)
for the separate deployment, access, credentials, session and acceptance gates.
Returning-user routing remains in PR #194. This tool does not unblock deployment
by itself.

## Operator prerequisites

- Run from the reviewed repository revision on an authorized operator host with
  private database reachability and a dedicated migration/operator connection.
  Do not grant invitation or admission-control writes to the API runtime role.
- Verify the actual GCP project, instance and secret version against the inventory
  before retrieving credentials. Environment variables are assertions, not cloud
  identity attestation. The CLI additionally verifies `current_database()`.
- Supply the selected API's `SAMRA_DEPLOYMENT_ENVIRONMENT` (`dev` or `test`),
  matching `GOOGLE_CLOUD_PROJECT`, `SAMRA_RELEASE_PROFILE=synthetic-shared`,
  `SAMRA_PERSISTENCE_MODE=postgres`, `SAMRA_CUSTOMER_AUTH_MODE=auth0`, and
  `AUTH0_ISSUER_BASE_URL`. All three provider settings must be `fake`:
  `SAMRA_PROVIDER_MODE`, `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` and
  `SAMRA_CUSTOMER_WALLET_PROVIDER_MODE`.
- Inject the target connection into `SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL`
  through the approved secret mechanism. There is no `DATABASE_URL` fallback.
  Use the required TLS/Cloud SQL connection settings for that environment.
- Keep real Auth0 subjects and private manifests outside the checkout and test
  evidence. The examples below are placeholders, not usable identities. Use a
  non-personal operator alias linked to the named operator in the private session
  record. Do not put passwords, email addresses or tokens into manifests.

## Prepare exactly two invitations

Create a private JSON manifest with the actual target issuer, two reviewed Auth0
subjects, and an expiry in the next seven days:

```json
{
  "operation": "invite",
  "environment": "test",
  "operatorAlias": "operator_session_owner",
  "issuer": "https://test-tenant.example.com/",
  "subjects": ["auth0|synthetic-tester-a", "auth0|synthetic-tester-b"],
  "admissionLimit": 5,
  "expiresAt": "REPLACE_WITH_FUTURE_UTC_TIMESTAMP"
}
```

The existing admission schema permits 0, 1, 5, 25 or 100 lifetime admissions.
This command explicitly selects 5, the smallest existing limit that admits two
testers, while requiring exactly two invitations. It only accepts a previously
closed limit of 0 or an existing limit of 5. It refuses a different roster,
changed expiry, revoked invitation or broader admission limit. Roster replacement,
renewal and cohort expansion need separately reviewed work; retries cannot
reactivate access.

Preview using the actual database. The command performs validation and the
transactional changes, then rolls them back, including audit writes:

```sh
pnpm --filter @workspace/db shared-test:operate /private/path/roster.json
```

Only after the exact target, roster, expiry and effect are approved, persist the
same manifest:

```sh
pnpm --filter @workspace/db shared-test:operate /private/path/roster.json --apply
```

The apply is atomic and retries preserve the same invitations. It adds a durable
operator audit record without Auth0 subjects. Each tester must then sign in and
complete the non-production consent screen. The application's normal first-login
flow creates and binds their customer record and admission; the CLI does not.

## Apply a simulated identity decision

After the tester starts identity verification, obtain their Samra identity case
ID from the authorized onboarding response. Prepare another private manifest:

```json
{
  "operation": "identity-decision",
  "environment": "test",
  "operatorAlias": "operator_session_owner",
  "issuer": "https://test-tenant.example.com/",
  "subject": "auth0|synthetic-tester-a",
  "identityCaseId": "identity_case_00000000000000000000000000000000",
  "decision": "approved",
  "commandId": "synthetic_session_001_decision_a"
}
```

Preview and apply with the same commands, substituting the decision manifest.
Supported outcomes are `review`, `approved`, `declined` and `error`. Reuse the
same command ID when retrying the same decision. Reusing it for a different
decision or case is rejected. A new contradictory terminal decision follows the
existing identity conflict/restriction rules; it is not a reset mechanism.

The tool requires an admitted, active tester and a case belonging to that exact
identity. The existing persistence service rejects non-fake inquiry references.
No Persona or Crossmint client is called. Revoked invitations and suspended or
revoked identities cannot receive decisions, including a retry.

The tester refreshes onboarding after the decision. For approval, they still
review and accept wallet consent themselves and initiate wallet creation through
the customer application. No simulated decision is evidence of real KYC approval.

## Record acceptance

Use the [GitHub user-test session](user-testing.md) with the exact deployed SHA,
revision and synthetic tester aliases. Prove both users' login, consent,
identity decision, wallet creation, logout/return and cross-account denial.
Record preview/apply receipts and sanitized audit references privately; receipts
omit subjects and connection details. Failed commands intentionally suppress raw
parser/database errors to avoid leaking private inputs.

Do not mark these customer journeys passed from CLI or CI results alone. Product
account provisioning, balanced synthetic funding, balance/activity display and
session start/drain/stop acceptance remain separate work.

## Provision one synthetic opening balance

After admission, consent and an approved **simulated** identity case, use the
same private-manifest CLI with `operation: "fund-synthetic-account"`, the selected
`environment`, `issuer`, `subject`, `operatorAlias`, and `amountMinor: "50000"`.
The example is 500 synthetic USD; the server accepts integer strings from 1 to
100000 minor units. This is fixture money, with no provider call or real deposit.
Preview rolls back the complete operation; `--apply` persists it atomically.

The tool creates an active USD product account owned by that exact admitted
customer, verifies its matching ledger account dimensions, and uses the existing
journal writer to debit synthetic control assets and credit the customer liability.
There is only one initial credit per customer/environment. Retrying the same
amount returns the existing journal; changing the amount conflicts. Suspended or
revoked identities, pending/rejected identity cases, or non-fake inquiries fail.
It does not accept customer or wallet consent, create a provider wallet, or claim
real KYC approval. Additional top-ups/resetting balances require a reviewed fixture
change. Do not write directly to materialized balances.
