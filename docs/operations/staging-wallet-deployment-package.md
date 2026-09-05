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
and recovered unchanged after a retry and process restart. Funding, outgoing
transfers, device enrollment, and recovery exercises are later milestones.

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

| Area               | Evidence at preparation                                                                                                                     | Required next evidence/change                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Backend            | PR 157 adds the creation-only customer sandbox adapter and migration 0017; current journal has 18 migrations                                | Exact release SHA passes required CI, security, PostgreSQL and container checks                                                  |
| Cloud Run          | Earlier console inspection in this session showed no staging services                                                                       | Fresh keyless inventory of services, jobs, IAM and private invocation path                                                       |
| Cloud SQL          | Existing private PostgreSQL 16 instance; earlier console showed backups/PITR/deletion protection and allowed unencrypted direct connections | Enforced TLS, client transport review, backup/restore evidence, actual schema journal and split database roles                   |
| Migration delivery | Zero-traffic workflow explicitly stops for `samra-api`; no governed migration producer is registered                                        | Implement the producer and exact run/artifact verification before removing the API stop                                          |
| Bootstrap          | `activate-staging-database-access.sh` uses `:latest` in access and migration jobs                                                           | Bind every job to the approved numeric secret version; produce evidence and cleanup proof                                        |
| Runtime            | Existing contract is `synthetic-only`, worker `true`, provider `fake`                                                                       | Review a separate one-customer sandbox lane; worker `false`, restricted vendor key and explicit data scope                       |
| Credentials/Auth0  | Values and enabled secret versions were not inspected                                                                                       | Verify metadata and pinned versions without returning secret payloads; verify issuer, audience and customer actor                |
| Identity           | Sandbox provisioning requires an approved durable Samra identity case                                                                       | Prove the selected test identity can satisfy this gate without manual database edits or enabling development/operations controls |
| First deployment   | Existing traffic promotion disallows first activation; no previous API revision is evidenced                                                | Governed private first-revision verification and abort procedure; no invented rollback target                                    |

The latest Chrome refresh was denied because the admin-enforced policy could
not be verified. Earlier console observations are not a fresh cloud audit.
No cloud configuration was changed while preparing this package.

## Dependency-ordered implementation

1. **Database release prerequisite.** Extend the existing release control plane,
   not a second deployment system. Add a manual protected-main migration producer
   with isolated keyless identity, read-only preflight before mutation, and an
   explicit expiring execution authorization. Verify image-publication run,
   attempt, repository numeric IDs, workflow path, artifact ID/digest and exact
   candidate SHA before Google authentication. Run only the published
   `samra-migrations@sha256:…` image, one task, parallelism one, zero automatic
   retries, timeout 600 seconds. Serialize database operations across bootstrap
   and migration workflows. Include the pre/post migration journal, SQL file
   hashes, numeric migration secret version, job/execution identity, image
   digest, successful result and cleanup evidence in a hashed artifact. Register
   that fixed producer with `verify-github-upstream-artifact.mjs`; the API consumer
   must reject review-only, failed, stale, wrong-SHA or ungoverned evidence.
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

Steps 1–3 require code review before any cloud apply. This package does not
implement the missing migration producer or authorize bypassing its blocker.

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
| `SAMRA_RUN_WORKER`                      | `false`                  | `false`                                                                            |
| `SAMRA_INTERNAL_OPERATIONS_ENABLED`     | `false`                  | `false`                                                                            |
| `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` | `fake`                   | `fake`, only if approved test-case evidence is established through a reviewed path |
| `SAMRA_CUSTOMER_WALLET_PROVIDER_MODE`   | `fake`                   | `crossmint-sandbox-customer`                                                       |
| `CROSSMINT_SERVER_API_KEY`              | absent                   | pinned restricted staging secret reference                                         |
| `CROSSMINT_SANDBOX_CUSTOMER_ID`         | absent                   | one authenticated `customer_<32 lowercase hex>`                                    |
| `CROSSMINT_SANDBOX_RECOVERY_EMAIL`      | absent                   | selected tester's verified recovery email, supplied privately                      |

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
empty database, apply all 18 in order; on an initialized database, only the
missing reviewed suffix. Never run 0017 alone against an unknown schema.
Require readiness to verify its environment constraint and mapping trigger.
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
3. Present the [sandbox disclosure and exact request body](crossmint-sandbox-connection.md#bounded-activation-prerequisites).
   The tester accepts; submit `POST /api/v1/onboarding/wallet` with a stable
   idempotency key through the private authenticated route. Do not reuse the
   frontend's existing synthetic disclosure.
4. Verify one immutable mapping, expected owner, address and customer email
   recovery configuration. Repeat the same request and restart the process;
   GET/retry must recover the same wallet. A changed request, another customer,
   provider conflict or restriction must fail closed. Record normalized IDs,
   result codes and audit references only; exclude tokens, key values, email,
   raw Auth0 subject and provider payloads from release artifacts/logs.
5. Require `await_customer_signer_setup`, no funding/remittance entitlement,
   no signing invocation and no transfer. Successful creation does not prove
   customer operational signing, recovery, supported token network or custody
   configuration beyond the verified fields.

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
down-migrate 0017 or replace a staging mapping with a synthetic one. Reverting
the runtime needs a schema-compatible reviewed image; turning a mode off does
not undo provider creation. Existing revision rollback is available only after
an actual previous revision and restoration evidence are recorded.

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
