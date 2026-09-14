# Private staging wallet deployment package

Prepared 2026-09-05. **Review only; no cloud execution is authorized by this
document or by a successful packet-generation command.**

Implementation follow-up: the [governed staging migration workflow](staging-migrations.md)
now implements the producer and API prerequisite verification described below.
Bootstrap uses numeric secret versions and shares the database lock. The
preparation inventory below records the original PR 158 baseline; it is not a
claim that these code gaps remain open. Federation, database access, TLS and
actual cloud execution remain unverified and separately authorized.

## Outcome and source

The next product milestone is one wallet created through Samra's authenticated
backend, attached to one consenting test customer's durable PostgreSQL record,
and recovered unchanged from persisted state after a process restart. A provider
transport timeout is a separate ambiguous-outcome case and must be reconciled
before another create request. Funding, outgoing transfers, device enrollment,
and recovery exercises are later milestones.

The implementation baseline is merged PR [157](https://github.com/haileleuld87/Samra-Pay/pull/157),
main commit `39a8babf4927685ce05b5f4623b6d258f6280380`. A subsequent release must
use its own reviewed main SHA and fresh checks. Do not deploy the older PR 156
branch instead. Generate a source inventory from a clean committed checkout:

```sh
node deploy/gcp/prepare-staging-wallet-review.mjs \
  --candidate-sha "$(git rev-parse HEAD)" > /tmp/samra-staging-wallet-review.json
```

This reads Git only. It records source hashes, every journaled migration, and
the repository's release restrictions. It neither reads credentials nor calls
Google or Crossmint. Exit zero means the inventory was generated, not that a
deployment is eligible. Keep the output outside the repository so the checkout
stays clean. The final merged SHA needs a new inventory and release evidence.

## Evidence and unresolved dependencies

| Area               | Evidence at preparation                                                                                                                                               | Required next evidence/change                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Backend            | PR 157 added the creation-only customer sandbox adapter and migration 0017; the current implementation adds a separate customer-control setup state in migration 0021 | Exact release SHA passes required CI, security, PostgreSQL and container checks                                                  |
| Cloud Run          | Earlier console inspection in this session showed no staging services                                                                                                 | Fresh keyless inventory of services, jobs, IAM and private invocation path                                                       |
| Cloud SQL          | Existing private PostgreSQL 16 instance; earlier console showed backups/PITR/deletion protection and allowed unencrypted direct connections                           | Enforced TLS, client transport review, backup/restore evidence, actual schema journal and split database roles                   |
| Migration delivery | The original PR 158 baseline had no governed producer; the current repository has a protected staging migration workflow and API prerequisite verification            | Verify the candidate-SHA workflow registration, upstream artifact digest, execution authorization, result and cleanup evidence   |
| Bootstrap          | The original PR 158 baseline used `:latest`; the current bootstrap pins numeric secret versions and shares the database lock                                          | Verify those controls at the candidate SHA and collect actual cloud execution and cleanup evidence                               |
| Runtime            | Existing contract is `synthetic-only`, worker `true`, provider `fake`                                                                                                 | Review a separate one-customer sandbox lane; worker `false`, restricted vendor key and explicit data scope                       |
| Credentials/Auth0  | Values and enabled secret versions were not inspected                                                                                                                 | Verify metadata and pinned versions without returning secret payloads; verify issuer, audience and customer actor                |
| Identity           | Sandbox provisioning requires an approved durable Samra identity case                                                                                                 | Prove the selected test identity can satisfy this gate without manual database edits or enabling development/operations controls |
| First deployment   | Existing traffic promotion disallows first activation; no previous API revision is evidenced                                                                          | Governed private first-revision verification and abort procedure; no invented rollback target                                    |

The latest Chrome refresh was denied because the admin-enforced policy could
not be verified. Earlier console observations are not a fresh cloud audit.
No cloud configuration was changed while preparing this package.

## Dependency-ordered implementation

1. **Database release prerequisite.** Use the existing governed staging
   migration workflow; do not create a second deployment system. Verify its
   protected-main trigger, isolated keyless identity, read-only preflight,
   explicit expiring execution authorization, image-publication run and attempt,
   repository numeric IDs, workflow path, artifact ID/digest, and exact candidate
   SHA before Google authentication. Verify that it runs only the published
   `samra-migrations@sha256:…` image with one task, parallelism one, zero automatic
   retries, and a 600-second timeout; that database operations serialize across
   bootstrap and migration workflows; and that its hashed artifact contains the
   pre/post journal, SQL hashes, numeric secret version, execution identity,
   image digest, result, and cleanup evidence. The API consumer must continue to
   reject review-only, failed, stale, wrong-SHA, or ungoverned evidence.
2. **Private API lane.** After database access and migration evidence pass, extend
   the existing zero-traffic and probe controls with the bounded profile below.
   Keep initial runtime checks in fake mode without a Crossmint secret. Test the
   first-deployment behavior explicitly: if the platform cannot preserve the
   prescribed zero-traffic boundary, stop and review a private first-activation
   contract; do not reinterpret a 100-percent allocation as zero traffic.
3. **One-customer activation.** Only after private API/database verification,
   prepare the exact test customer, consent, identity-case evidence, restricted
   server key version and private caller for a separate bounded activation.
   Extend the existing synthetic probe deliberately; do not feed real tester
   identity or credentials into a synthetic-only workflow or its artifacts.

Steps 1–3 require code review before any cloud apply. The migration producer is
implemented in the repository, but this document neither proves a successful
cloud execution nor authorizes bypassing any producer or API release gate.

## Proposed runtime profile

Target only `samra-pay-staging` (project number `934122615631`), organization
`614833350075`, region `us-east4`, API service `samra-api`. Use
`samra-api-staging@samra-pay-staging.iam.gserviceaccount.com` for the API and the
separate `samra-migrations-staging` identity for migration. Use the existing
private `samra-staging-vpc`, `samra-staging-us-east4` subnet and
`samra-staging-postgres` / `samra_staging`; no database resize or replacement.

These settings are a proposal, not an applied overlay:

| Setting                                 | Private API verification | One-customer wallet activation                                                     |
| --------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `NODE_ENV`                              | `production`             | `production`                                                                       |
| `SAMRA_BACKEND_MODE`                    | `demo`                   | `demo`                                                                             |
| `SAMRA_PROVIDER_MODE`                   | `fake`                   | `fake`                                                                             |
| `SAMRA_PERSISTENCE_MODE`                | `postgres`               | `postgres`                                                                         |
| `SAMRA_DEPLOYMENT_ENVIRONMENT`          | `staging`                | `staging`                                                                          |
| `SAMRA_CUSTOMER_AUTH_MODE`              | `auth0`                  | `auth0`                                                                            |
| `SAMRA_RELEASE_PROFILE`                 | `alpha-release-1`        | `alpha-release-1`                                                                  |
| `SAMRA_ALLOWED_ORIGINS`                 | exact reviewed origins   | exact reviewed origins; no wildcard                                                |
| `SAMRA_RUN_WORKER`                      | `false`                  | `false`                                                                            |
| `SAMRA_INTERNAL_OPERATIONS_ENABLED`     | `false`                  | `false`                                                                            |
| `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` | `fake`                   | `fake`, only if approved test-case evidence is established through a reviewed path |
| `SAMRA_CUSTOMER_WALLET_PROVIDER_MODE`   | `fake`                   | `crossmint-sandbox-customer`                                                       |
| `CROSSMINT_SERVER_API_KEY`              | absent                   | pinned restricted staging secret reference                                         |
| `CROSSMINT_SANDBOX_CUSTOMER_ID`         | absent                   | one authenticated `customer_<32 lowercase hex>`                                    |
| `CROSSMINT_SANDBOX_RECOVERY_EMAIL`      | absent                   | selected tester's verified recovery email, supplied privately                      |

Do not omit `SAMRA_RELEASE_PROFILE`: omission defaults to the broader `demo`
route profile rather than the narrow Alpha Release 1 surface. The Alpha profile
also requires a nonempty, exact origin allowlist. Verify the final values; do
not invent an origin or use `*`.

Verify `AUTH0_ISSUER_BASE_URL` and `AUTH0_AUDIENCE` against the existing tenant.
`DATABASE_URL` must reference `samra-staging-database-url:<numeric version>`;
migration uses `samra-staging-migration-database-url:<numeric version>`.
Crossmint uses `samra-staging-crossmint-server-api-key:<numeric version>` only
after scoped permission and project checks. Do not use the full-access
development key or invent a version number. Wallet creation needs its documented
permission; any separate provider lookup needs separately verified read scope.

Use private ingress, required Google IAM authentication, no public invoker,
default service URL disabled outside the governed temporary probe, no persistent
revision tag, minimum instances zero, proposed maximum one, 1 vCPU, 512 MiB,
concurrency 10, database pool maximum five. The proposed lower instance limit
must be reflected in controller validation, not silently overridden at deploy.
Direct VPC egress should preserve private database routing and the reviewed
outbound path to Auth0/Crossmint. No load balancer, NAT gateway, DNS or public
website is included in this proposal.

Private HTTP verification needs both `X-Serverless-Authorization` for the exact
Cloud Run audience and `Authorization` for the customer's Auth0 token. Reuse the
existing private probe pattern and its temporary routing restoration. A
private service with its default URL disabled is not directly callable from
the operator's laptop just because the operator has an Auth0 token.

## Database transport and migration

Audit the actual migration journal before selecting pending migrations. On an
empty database, apply every journaled migration in order; on an initialized
database, only the missing reviewed suffix. Never run 0017 or 0021 alone
against an unknown schema. Require readiness to verify the environment,
mapping, and customer-control state constraints.
The API identity must have only required runtime DML, no DDL or migration role.

Cloud SQL's `ENCRYPTED_ONLY` setting rejects unencrypted connections.
Separately validate the chosen client authentication of the database server.
The current bootstrap URL uses `sslmode=require&uselibpqcompat=true` and its
test explicitly expects `rejectUnauthorized: false`: that is transport
encryption, not certificate verification. Resolve the connector or CA/hostname
verification design before customer activation; do not report verified server
identity from that URL alone. See [Google's TLS configuration documentation](https://docs.cloud.google.com/sql/docs/postgres/configure-ssl-instance).

## Bounded cost proposal

Propose a single supervised session of at most 60 minutes with a **USD 5
incremental stop threshold**, subject to a complete estimate and David's final
approval. This is not an approved budget or a provider-enforced hard cap. No
new SQL instance, resize, continuously running minimum instance, load balancer,
or NAT gateway is included. Keep existing SQL baseline charges distinct from
incremental work; do not claim the whole project costs USD 5.

The proposed API ceiling is one requested instance, 1 vCPU and 0.5 GiB; one
fully active hour is 3,600 vCPU-seconds and 1,800 GiB-seconds. Each 600-second
migration job at that size adds 600 vCPU-seconds and 300 GiB-seconds. Count all
bootstrap, audit, probe and cleanup jobs, not just the migration. Add build,
registry/scanning/storage, logging, secret operations, network and vendor usage.
Refresh the regional estimate with [Cloud Run pricing](https://cloud.google.com/run/pricing)
and the applicable service prices after the exact job count is known. Free-tier
availability and billing alerts are not spend guarantees. The estimate remains
incomplete until image publication and bootstrap requirements are known.

Set an absolute UTC expiry and name David as decision owner and the executing
operator as cleanup owner in the final authorization. No unattended retries.
Stop starting work if elapsed time or forecast incremental cost exceeds the
approved threshold. Capture resource-level usage and cleanup afterward; delayed
billing data cannot enforce a real-time dollar cap.

## Acceptance and stop conditions

1. Verify private health/readiness and runtime identity. Reject missing/wrong
   Google credentials and invalid customer JWTs. Verify SQL TLS, least-privilege
   access and migrations before enabling the vendor mode.
2. The selected tester signs in through Auth0. Resolve its durable Samra ID and
   approved identity case; do not substitute the console's
   `samra-sandbox-wallet-001` owner or fabricate production KYC evidence.
3. Call authenticated `GET /api/v1/onboarding/wallet/disclosure`. The current
   clients deliberately accept only a complete response that exactly matches
   their compiled disclosure allowlist, render the validated canonical
   presentation, and submit the corresponding allowlisted version tuple plus
   `decision: accepted`, using a stable idempotency key through the private
   authenticated route. This pin is a fail-closed contract check; it does not
   let the client select provider mode, alter the disclosure, or substitute an
   operator-authored request body.
4. Verify one immutable mapping, expected owner, address and customer email
   recovery configuration through the bounded server/provider evidence path.
   The customer API must return wallet `customer_control_setup`, onboarding
   `wallet_control_setup`, `readyAt: null`, `publicAddress: null`,
   `custodyModel: null`, and `await_customer_control_setup`. Restart the process
   and verify that GET and a conclusive persisted replay return the same
   setup-required wallet. If a
   provider call timed out without a persisted mapping or separately verified
   provider result, treat the outcome as ambiguous: stop and reconcile it before
   any further create request. A changed create request against that nonterminal
   staging command, another customer, provider conflict or restriction must fail
   closed. A version-refresh acknowledgement for an already completed resource
   may append current consent, but it must not redispatch creation. Record normalized IDs, result codes
   and audit references only; exclude tokens, key values, email, raw Auth0
   subject and provider payloads from release artifacts/logs.
5. Require no funding/remittance entitlement, no signing invocation and no
   transfer. Record the result as a generic EVM smart-wallet resource, not a
   verified USDC wallet: the current request does not select or validate a token
   contract or exact chain. Successful provider resource creation does not prove
   customer operational signing or recovery and must not transition to `ready`.
   A future reviewed implementation must persist server-verified signer and
   recovery evidence before a separate migration may permit that transition.

Stop on wrong identity/project/SHA/digest, unknown secret version, failed TLS,
missing migration evidence, unexpected privileges, duplicate/conflicting wallet,
public access, incomplete cleanup, expired approval or budget forecast breach.

## Abort and rollback

Before the first service exists there is no prior revision to restore. On a
failed first release, stop execution and preserve the failed revision/evidence
with no customer invocation path. Restore any temporary probe URL/tag state and
remove temporary jobs and only the exact temporary grants authorized for this
session. If an initial allocation cannot meet the reviewed boundary, stop
before activating customer access. Do not delete shared infrastructure.

After wallet provisioning, disable the sandbox provider mode and its invocation
path, preserving wallet, consent, immutable mapping and audit records. Do not
down-migrate 0017 or 0021 or replace a staging mapping with a synthetic one.
Reverting the runtime needs a schema-compatible reviewed image; turning a mode
off does not undo provider creation. Existing revision rollback is available
only after an actual previous revision and restoration evidence are recorded.

## Reconciliation with PR 156

PR [156](https://github.com/haileleuld87/Samra-Pay/pull/156) was still draft and
unmerged at preparation. Its older adapter changes do not wire PR 157's new
`CrossmintCustomerSandboxAdapter`. Its shared transfer approval coordinator is
local UI state only and is not connected to a passkey SDK or backend signature
verification. Do not merge that branch wholesale as a deployment prerequisite.
Port useful approval UI work separately onto the merged backend when building
customer signing, with changed-transaction, expiry, wrong-signer and replay
tests at the actual transport boundary. Every outgoing transfer must remain
customer-initiated and explicitly customer-approved.

Before direct client wallet sessions, reconcile Crossmint's JWT-derived owner
with Samra's opaque customer ID. Device/passkey enrollment and customer-owned
recovery must be completed by the tester. No server signer or Samra recovery
override is part of this package.
