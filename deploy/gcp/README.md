# Google Cloud staging and portability foundation

Google Cloud is the locked Alpha hosting and database platform. This directory
contains reviewed contracts, tests, container definitions, and guarded scripts
for separately authorized staging phases. GitHub remains the source of truth;
Replit remains a temporary preview and bounded rollback surface until cutover.

## Current verified staging state

The authorized synthetic staging foundation now contains:

- project and data-classification labels, approved APIs, and seven distinct
  keyless Samra service accounts;
- one immutable Artifact Registry repository;
- Firebase project linkage without Firebase Auth, Firestore, Hosting, or a
  registered mobile app;
- one private VPC, subnet, Private Services Access allocation, and PostgreSQL 16
  Cloud SQL instance;
- the empty `samra_staging` database with backups, seven-day point-in-time
  recovery, storage bounds, and deletion protection;
- database-secret metadata with zero credential versions.

Cloud Run services and jobs, database users and credentials, schema migrations,
application images, public endpoints, live vendors, real customer data, and
production resources do not exist in this phase. The
[product documentation index](../../docs/README.md) separates this live cloud
substrate from future application deployment.

## Foundation contract

`staging-foundation.json` records the first bounded Google Cloud target:

- project `samra-pay-staging` under organization `614833350075`;
- region `us-east4` (Northern Virginia);
- synthetic staging data only;
- a $50 monthly budget alert;
- one immutable `samra-staging` Docker repository;
- separate build, deploy, API, browser, design, and migration identities; and
- Firebase added to the existing project without enabling Firebase Auth,
  Firestore, Hosting, or registering a mobile app before its identifiers lock.

Adding Firebase cannot be fully undone. It automatically creates a restricted
browser API key and two provider-managed service-account patterns, adds the
`firebase:enabled` label, and enables the provider-managed baseline APIs listed
in `firebase.providerManagedEffects`. Those effects are distinct from the 14
APIs and seven service accounts explicitly managed by Samra's bootstrap. The
provider-managed baseline does not itself configure a Firebase app, Firebase
Authentication, Firestore database, or Hosting site.

The plan is executable only through `bootstrap-staging-foundation.sh --apply`
with the exact reviewed project, organization, region, operator domain, and an
explicit authorization sentinel. Its default is `--plan`, which performs local
validation and changes no cloud state. The apply phase assumes the project was
created under the approved organization and billing was linked separately. It
does not create either one. In Cloud Shell, the operator guard reads the
currently configured `gcloud` account and requires an exact match before any
mutation. The bootstrap also resolves stable-versus-alpha project-label support
before its first cloud mutation, then verifies every Samra-managed project label
after the update. This keeps supported Cloud Shell releases resumable without
silently omitting the synthetic-staging boundary.

Service-account creation is also resumable. Existing accounts are reused, and
creation is attempted at most three times when Google returns the specific
per-project creation-rate quota, with a 65-second backoff between attempts. All
other service-account errors still fail immediately, before any IAM grants are
attempted.

The bounded bootstrap enables only the approved Samra-managed APIs, project
labels, the immutable image repository, seven keyless Samra service accounts,
minimum IAM bindings, and empty database-secret metadata. Firebase's separate
console linkage adds only the enumerated provider-managed baseline. Neither
path creates a secret version, Cloud SQL instance, Cloud Run workload, load
balancer, Firebase app registration, public endpoint, real-provider
integration, or Replit change.

Example review-only command:

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="operator@davidhaile.com" \
  bash deploy/gcp/bootstrap-staging-foundation.sh --plan
```

The apply command must not run until the permanent project ID, organization,
billing, region, operator, budget alert, and foundation scope have been
confirmed at the action boundary.

## Bounded target architecture

| Workload                      | Google Cloud target      | Purpose                                                                         |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `samra-api`                   | Cloud Run service        | Samra API and controlled synthetic worker                                       |
| `samra-customer-web`          | Cloud Run service        | Existing customer web UI plus same-origin `/api` proxy                          |
| `samra-operations-web`        | Cloud Run service        | Existing Operations Portal plus same-origin `/api` proxy                        |
| `samra-design-system-preview` | Cloud Run service        | Governed, commit-addressed design review browser                                |
| `samra-migrations`            | Cloud Run job            | Reviewed, one-off forward database migrations                                   |
| PostgreSQL                    | Cloud SQL for PostgreSQL | Durable staging and later production persistence                                |
| Container images              | Artifact Registry        | Immutable, commit-addressed release images                                      |
| Build pipeline                | Cloud Build              | Tests and image construction from the GitHub source                             |
| Secrets                       | Secret Manager           | Separate runtime and migration `DATABASE_URL` values; never image layers or Git |

The customer and Operations Portal containers preserve the existing browser
interfaces. Their small Node server serves the compiled SPA and proxies `/api`
to `SAMRA_API_ORIGIN`. This keeps browser cookies first-party and provides an
explicit HTTP 502 response when the API is unavailable; it never substitutes
mock financial data.

`SAMRA_API_ORIGIN` must use HTTPS. Plain HTTP is accepted only for loopback
container testing and local development.

The design-system preview container uses the same versioned source and gates as
the GitHub preview artifact. It provides an independent browser-based design
review surface without making Replit or compiled ZIP exports authoritative.

The mobile UI remains an Expo application. It is not moved into Cloud Run. Its
generated client accepts one validated `EXPO_PUBLIC_SAMRA_API_ORIGIN` for iOS,
Android, and Expo web. Replit-specific Expo preview convenience may remain during
transition, but it is not part of the backend hosting contract.

## Automatic-action boundary

Checking out, testing, or building this directory changes no cloud resource.
The guarded foundation and database scripts mutate only their reviewed phase
after an explicit apply authorization. No current path automatically:

- creates or modifies the Google Cloud project or billing relationship;
- creates Cloud Run, DNS, a public endpoint, or a Firebase application;
- deploys an image or application;
- creates a database credential, secret version, or application user;
- runs a migration against the staging database;
- changes Replit files, workflows, secrets, ports, or deployments;
- enables real providers, production data, or production security claims; or
- changes the existing visual design.

## Build contract

`cloudbuild.yaml` runs the platform contract tests and repository typecheck,
then builds five images. It only builds and publishes images. Deployment is a
separate approval gate.

GitHub's `Container portability` workflow independently builds the same five
images from the exact GitHub commit without pushing them. It runs the migration
image against disposable PostgreSQL 16, starts the API with production-shaped
fake-provider/PostgreSQL configuration, and probes API health/readiness. It
then starts the customer, Operations Portal, and design-system containers,
proves SPA routes and same-origin API proxying, and confirms that the synthetic
operations API stays disabled in the production-mode API image. Runtime logs
and probe responses plus JSON/JUnit summaries are retained for 30 days.

The portability gate runs on relevant pull requests and `main` changes, every
Monday to catch base-image drift, and on manual dispatch. It creates no cloud
resource, pushes no image, uses no credential, and does not access Replit.

Every Cloud Build input defaults to `unset` and the first build step rejects
the request before installing dependencies or building an image unless the
complete staging identity is supplied. The build must run as the dedicated
`samra-cloud-build-staging` service account and requests verified build
provenance. The Artifact Registry repository must be created separately with
immutable tags enabled.

Required Cloud Build substitutions and built-in source identity:

| Value                    | Required contract                                                        |
| ------------------------ | ------------------------------------------------------------------------ |
| `_ENVIRONMENT`           | Exactly `staging`                                                        |
| `_REGION`                | Explicit regional location; confirm before use                           |
| `_REPOSITORY`            | Exactly `samra-staging`; create with immutable tags                      |
| `_IMAGE_TAG`             | Full lowercase 40-character Git SHA                                      |
| `COMMIT_SHA`             | Full source SHA, identical to `_IMAGE_TAG`                               |
| `_BUILD_SERVICE_ACCOUNT` | `samra-cloud-build-staging@<staging-project>.iam.gserviceaccount.com`    |
| `PROJECT_ID`             | Dedicated Google Cloud project ID containing the `staging` boundary word |

Example for a future authorized build from Cloud Shell:

```sh
SAMRA_CANDIDATE_SHA="$(git rev-parse HEAD)"
SAMRA_STAGING_PROJECT="replace-with-approved-staging-project"

gcloud builds submit \
  --project="${SAMRA_STAGING_PROJECT}" \
  --config deploy/gcp/cloudbuild.yaml \
  --substitutions COMMIT_SHA="${SAMRA_CANDIDATE_SHA}",_ENVIRONMENT=staging,_REGION=us-east1,_REPOSITORY=samra-staging,_IMAGE_TAG="${SAMRA_CANDIDATE_SHA}",_BUILD_SERVICE_ACCOUNT="samra-cloud-build-staging@${SAMRA_STAGING_PROJECT}.iam.gserviceaccount.com" \
  .
```

This command must not be run until the project, billing account, region,
Artifact Registry repository, and least-privilege Cloud Build service account
have been approved. The repository must enforce immutable image tags. The
build service account must have only the permissions required to read source,
write the staging repository, and emit build logs/provenance; it is not the
runtime, migration, or deployment identity.

## Staging runtime contract

`staging-runtime-contract.json` is the reviewable control plane for the future
staging environment. It is intentionally marked `deploymentAuthorized: false`.
It separates build, deploy, API, browser, design-preview, and migration
identities; reserves Cloud SQL and database-secret access for the API and
migration job only; and requires private, authenticated service ingress through
an approved load balancer. All images remain full-SHA-addressed.

The Operations Portal is explicitly blocked until workforce authentication,
staff access lifecycle controls, and production-security promotion of the
operations API are complete. The API keeps
`SAMRA_INTERNAL_OPERATIONS_ENABLED=false` in the meantime. This avoids turning
synthetic header-based access into a false employee security boundary.

The contract also locks the migration job to one task, serial execution, zero
automatic retries, a ten-minute timeout, and manual execution before an API
revision receives traffic. Its automated tests reject public unauthenticated
services, default service accounts, browser access to database secrets,
floating image tags, automatic migrations, live-provider values, and plaintext
credentials.

`staging-database-access.json` is the separate review-only trust contract for
database activation. It forbids a shared runtime/migration credential. The API
login inherits a non-owner runtime role with data access only; it cannot create
roles, databases, or schemas and cannot own either Samra schema. The migration
login is not accepted for runtime traffic and owns `samra_core` and
`samra_migrations` only after the reviewed migration sequence.

The only elevated database bootstrap principal is temporary. Acceptance
requires deletion of its database user, secret version, Secret Manager metadata,
and private bootstrap job. Both permanent Samra users must be non-superusers and
must not inherit `cloudsqlsuperuser`. The existing
`samra-staging-database-url` secret is reserved for the API runtime; migrations
use the distinct `samra-staging-migration-database-url` secret.

`activate-staging-database-access.sh` implements that boundary as four separate
gates: offline `--plan`, authenticated read-only `--review`, fresh `--apply`,
and fail-closed `--resume` for a previously observed partial activation. Apply
and resume require the exact clean Git SHA, an immutable migration image digest,
and the explicit `AUTHORIZED_STAGING_DATABASE_ACCESS` sentinel. No command
prints a connection URL or password.

The activation uses Direct VPC egress from one temporary Cloud Run job name.
The bootstrap execution receives one temporary Secret Manager payload and
creates the two permanent non-superuser logins. Subsequent migration,
grant-finalization, and positive/negative probes recreate that temporary job
with the applicable least-privilege identity and secret. The bootstrap database
user, secret, version, IAM grant, and job are deleted before acceptance.

`audit-staging-database-access.sh --review` then proves regional secret metadata,
permanent version counts, exact resource-level consumers, absence of bypassing
project-level secret access, and bootstrap cleanup without creating cloud state.
Its separately authorized `--execute` mode uses two temporary, private audit-job
executions to re-prove migration ownership and runtime permissions, then deletes
the audit job. Qase receives this through the existing CI acceptance report; it
does not create a redundant manual case family.

Each API instance is limited to five PostgreSQL pool connections. With the
staging API capped at two Cloud Run instances, application traffic can consume
at most ten pooled connections. Explicit test-only pool overrides remain
available, but the production-shaped default is bounded in `@workspace/db`.

The API service requires Cloud Run's injected `PORT` plus these explicit
values:

```text
NODE_ENV=production
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=postgres
SAMRA_RUN_WORKER=true
SAMRA_INTERNAL_OPERATIONS_ENABLED=false
DATABASE_URL=<Secret Manager reference>
```

`SAMRA_INTERNAL_OPERATIONS_ENABLED` is intentionally false in production-mode
containers because the current application correctly restricts synthetic
internal operations to non-production mode. Authentication and authorization
must be promoted deliberately before an Operations Portal is exposed beyond a
controlled staging audience.

Configure Cloud Run startup/readiness checks against `/api/readyz` and
liveness against `/api/healthz`. Readiness verifies connectivity and the
required migrated schema but never runs migrations or seeds. Cloud Run's
`SIGTERM` initiates a bounded graceful drain of the HTTP server, synthetic
worker, and PostgreSQL pool before the instance exits.

Each web service requires:

```text
SAMRA_API_ORIGIN=https://<samra-api-cloud-run-host>
```

A controlled mobile staging bundle requires:

```text
EXPO_PUBLIC_SAMRA_DATA_MODE=api
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://<samra-api-cloud-run-host>
```

These values are public bundle configuration, not secrets. The mobile build
rejects credentials, paths, queries, fragments, and non-loopback HTTP origins.

Do not set `PORT`; Cloud Run injects it. Do not place `DATABASE_URL` in a build
argument, image, repository file, or ordinary environment-variable manifest.

## Database and migration guardrails

`staging-database.json` is the exact, review-only database substrate contract.
It deliberately chooses a zonal `db-g1-small` Cloud SQL Enterprise instance for
synthetic staging: enough to integrate and test the product while containing
idle cost, but explicitly not a production availability claim. PostgreSQL 16 is
pinned rather than inheriting Google's changing default database version.

The private network uses two non-overlapping `/24` ranges: `10.40.0.0/24` for
the regional application subnet and `10.41.0.0/24` for Private Services Access.
The instance has no public IPv4 address or authorized network. Storage starts at
10 GB SSD, can grow only to 50 GB, and cannot be deleted while deletion
protection is enabled. Daily backups and PostgreSQL write-ahead logs are retained
for seven days for point-in-time recovery.

The workflow has three distinct gates:

1. `provision-staging-database.sh --plan` validates the local contract and reads
   no cloud state.
2. `--review` runs an authenticated, read-only collision and drift review in
   Cloud Shell.
3. `--apply` additionally requires the exact
   `SAMRA_GCP_DATABASE_APPLY=AUTHORIZED_STAGING_DATABASE` sentinel and stops on
   any mismatch before reusing an existing resource.

Before apply, the operator must review a current Google Cloud cost estimate. The
existing $50 budget alert provides notification only; it is not a spending cap.

After apply, `audit-staging-database.sh` independently checks the organization,
billing, project labels, network, private-service connection, Cloud SQL shape,
public-IP absence, backup/PITR/deletion controls, database presence, zero
database-secret versions, and zero Cloud Run services/jobs. It does not connect
to the database or inspect tables because this phase creates no credential. A
separate fixed-SHA Cloud Shell session must run this audit before the database
phase is accepted.

This phase creates no credential, application database user, secret version,
schema migration, seed row, runtime, provider connection, or Replit change.

1. Create a dedicated staging Cloud SQL PostgreSQL instance and database.
2. Use a dedicated migration identity and a distinct runtime identity.
3. Store the connection value in Secret Manager.
4. Attach Cloud SQL access only to the API and migration identities.
5. Set a bounded application connection pool before allowing horizontal scale.
6. Deploy the migration image as a Cloud Run job with one task and no automatic
   retry until migration idempotency has been reviewed.
7. Execute migrations manually before deploying the corresponding API revision.
8. Never run migrations during image build or API startup.
9. Never use `drizzle-kit push --force` or destructive down migrations.
10. Enable backups and point-in-time recovery before persistent acceptance tests.

Production must use a separate project or, at minimum, separate identities,
database, secrets, and services. Staging data must remain synthetic.

## Manual testing surfaces

The Google Cloud staging environment preserves four test surfaces:

1. Design System Preview URL: component, pattern, applied-screen, responsive,
   accessibility, and content review.
2. Customer web URL: browser-based remittance and account-flow testing.
3. Operations Portal URL: CS investigation, audit, ledger, reconciliation, and
   controlled-failure testing.
4. Expo mobile preview/build: mobile UI and flow testing against the validated
   staging API origin as screen-level cutovers are completed.

The existing Qase project remains the manual pass/fail record. A staging release
cannot advance on visual inspection alone.

## Cutover gates

Before any Replit dependency is removed:

- all images build from a clean GitHub commit;
- Cloud SQL migrations pass on an empty staging database and a restored copy of
  the prior synthetic schema;
- API health and explicit-failure behavior pass;
- restart, concurrency, idempotency, ledger, refund, reversal, reconciliation,
  and immutable audit evidence pass against Cloud SQL;
- customer web and Operations Portal route matrices pass;
- mobile staging connectivity and core flows pass;
- the critical Qase regression run is complete with no unresolved severity-one
  or severity-two defect;
- logging, alerting, backups, rollback, and named operational ownership exist;
- Replit remains available for a bounded rollback window before decommissioning.
