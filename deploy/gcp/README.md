# Google Cloud staging and portability foundation

Google Cloud is the locked Alpha hosting and database platform. This directory
contains reviewed contracts, tests, container definitions, and guarded scripts
for separately authorized staging phases. GitHub remains the source of truth;
Replit remains a temporary preview and bounded rollback surface until cutover.

The public coming-soon launch is a separate production boundary. Its
review-only contract is [`coming-soon-launch.json`](coming-soon-launch.json),
and its source-sync, release, rollback, and Squarespace DNS sequence is in the
[`coming-soon cloud launch runbook`](../../docs/operations/coming-soon-cloud-launch.md).
It does not reuse synthetic staging data or activate Auth0, Persona, Crossmint,
financial APIs, public traffic, production spend, or DNS changes.

`review-coming-soon-production.sh --plan` locks the confirmed production
boundary without reading cloud state: project `samra-pay-production`, region
`us-east4`, `customer-pii` data classification, a USD 25 monthly budget alert,
the same billing account as staging, and canonical `www.samrapay.com`. Its later
`--review` mode is read-only: after the project is separately created, it
verifies the assigned project number, labels, billing-account match, and one
exact project-scoped budget. It cannot create infrastructure, deploy, collect
waitlist data, route traffic, or change Squarespace DNS.

`coming-soon-production-project.json` and
`provision-coming-soon-production-project.sh` implement the bounded missing
project, billing link, and USD 25 budget-alert phase. `--plan` is local-only;
`--review` is read-only; and `--apply` additionally requires the exact
`AUTHORIZED_COMING_SOON_PRODUCTION_PROJECT` environment authorization. Apply is
resumable and stops on existing drift. It can create only the exact project,
attach only the open billing account already used by staging, and create one
project-only monthly alert. It cannot move a different billing link, enable an
API, create infrastructure, deploy, route traffic, collect data, activate a
vendor, or change DNS. Missing-project detection uses an exact organization
inventory because Google Cloud may mask an absent global project ID as a
permission error on direct lookup.

`coming-soon-production-foundation.json` is the next plan-only boundary. It
locks the exact 15-API allowlist, one immutable production image repository,
five keyless identities, least-privilege IAM plan, and two empty database-secret
metadata records. `plan-coming-soon-production-foundation.sh --plan` validates
that contract locally for USD 0 and deliberately has no review or apply mode.
The production project ID, region, classification, budget-alert amount, billing
source, domain, and canonical host are confirmed but not applied. The project
number remains unassigned until project creation, and the billing and budget
must then pass the read-only preflight. Executing the prepared project
controller remains a separate cloud-action authorization.

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

The customer-web proxy uses two independent authentication headers. It
preserves the customer's Auth0 bearer token in `Authorization` and places a
short-lived Google service identity token in `X-Serverless-Authorization`.
Cloud Run IAM authenticates the dedicated customer-web service account while
the Samra API still authenticates the customer. Any client-supplied service
identity header is stripped. The Google token comes from the Cloud Run metadata
server, is audience-bound to the exact API origin, stays in memory, and requires
no service-account key or stored credential.

`SAMRA_API_ORIGIN` and `SAMRA_API_SERVICE_AUDIENCE` must be the same exact
HTTPS origin. Plain HTTP and disabled service authentication are accepted only
for loopback container testing and local development. See
[`docs/architecture/cloud-run-service-authentication.md`](../../docs/architecture/cloud-run-service-authentication.md).

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

`publish-staging-images.sh` is the controlled entry point for a future
authorized build. Its offline `--plan` mode reads no cloud state. `--review`
binds a clean full Git SHA to the exact staging project, organization, region,
labels, immutable repository, dedicated keyless build identity, and exact IAM.
Before inspecting tags or uploading source, it requires the Container Analysis
API and proves the Google-managed Cloud Build service agent retains exactly its
unconditioned `roles/cloudbuild.serviceAgent` binding. This prevents a build
from creating all five images and then failing Google's requested provenance
verification.
It also requires the build identity to have exactly
`roles/storage.objectViewer` on only the existing
`gs://samra-pay-staging_cloudbuild` source bucket, rejects public bucket IAM,
and requires every target full-SHA tag to be absent so immutable-tag collisions
cannot create a partial or ambiguous release. The source-bucket check runs
before the image-tag checks and build submission, preventing another source
upload when the build identity cannot read it.

Only `--apply` can submit `cloudbuild.yaml`, and it additionally requires the
exact `AUTHORIZED_STAGING_IMAGE_PUBLICATION` value. A successful apply records
the Cloud Build ID and all five immutable digests in a validated publication
manifest, writes a SHA-256 sidecar, and—when invoked through GitHub—retains both
as a commit-, run-, and attempt-specific artifact for 365 days. The manifest
explicitly keeps deployment, traffic, and vendor activation unauthorized. The
submission passes the
dedicated build identity as the fully qualified
`projects/<project>/serviceAccounts/<email>` resource required by Cloud Build,
and status lookup is pinned to the same regional build location. The upload is
explicitly filtered by the repository's `.gcloudignore`, which reuses the
reviewed Docker source boundary and excludes credentials, local state,
dependencies, generated TypeScript build metadata, test artifacts, and
unreviewed assets. This prevents an earlier Cloud Build typecheck from adding
`.tsbuildinfo` files to a later Docker context in the shared build workspace.
It re-includes only the
non-secret `.gcloudignore` manifest and container-portability workflow required
by the pre-publication contract suite; the Docker boundary continues to exclude
both from runtime image contexts. Cloud Build creates a build record, stores
logs and provenance, uploads a filtered source archive, and on first use may
create its project-owned source-staging bucket. Those build-plane artifacts
are the only side effects beyond the five images. The controller still cannot
deploy a service, run a migration, route traffic, read a secret, modify IAM,
touch Replit, or use production data.

The complete CI/CD stage authority, traceability requirements, zero-traffic
deployment controller, promotion gate, and exact-revision rollback model are
defined in
[`docs/operations/staging-release-control-plane.md`](../../docs/operations/staging-release-control-plane.md)
and machine-validated by `staging-release-control-plane.json`. Image publication,
zero-traffic deployment, exact-image verification, private exact-revision
probing, combined verification evidence recording, exact-revision promotion,
and rollback are implemented. None of their cloud mutations is automatically
authorized. Deployment, both verification planes, promotion, and rollback use
distinct protected environments, workload-identity providers, and keyless
service accounts. Activating and executing the private probe and first-ever
traffic activation remain separate hard stops.

The controlled move from the founder's personal GitHub namespace to the
Enterprise-backed Samra Pay organization is documented in
[`docs/operations/github-enterprise-control-plane-migration.md`](../../docs/operations/github-enterprise-control-plane-migration.md)
and machine-validated by `staging-github-enterprise-migration.json`. Its
read-only review inventories every operational personal-authority dependency
and rejects target-organization authority before repository transfer is
explicitly authorized.

### Keyless zero-traffic Cloud Run deployment

`staging-zero-traffic-deployment.json` defines a second keyless GitHub trust
boundary. It uses a dedicated workload-identity pool containing exactly one
provider, plus a distinct service account, protected environment, and custom
role. The provider accepts only the exact manual workflow on `refs/heads/main`
from the stable numeric private-repository identity. The isolated pool avoids
depending on GitHub's evolving default OIDC subject format and prevents another
staging provider from inheriting the deployer's repository-level principal-set
binding. The deployer can read immutable images and create or update reviewed
Cloud Run revisions. It cannot publish an image, read a secret payload, run a
migration, mutate IAM, or operate traffic.

`deploy-staging-zero-traffic.sh --review` verifies the fixed source, hashed
publication evidence, exact image digest, runtime identity, required APIs,
private ingress, disabled default URL, non-public IAM, pinned secret metadata,
and same-release prerequisites. Only `--apply` under the keyless identity with
`AUTHORIZED_STAGING_ZERO_TRAFFIC_DEPLOYMENT` can deploy one revision. The
controller passes `--no-traffic`, uses no revision tag, compares the complete
traffic allocation before and after, and writes a hashed deployment manifest.

API deployment requires same-release migration evidence plus approved Auth0
public identifiers and a pinned database-secret version. Customer-web
deployment requires same-release API zero-traffic evidence and approved service
audience/Auth0 public identifiers. Persona and Crossmint remain dormant; no
vendor secret is accepted by this workflow. The design-system preview is the
only target without a runtime-service prerequisite.

The one-time trust activation remains a separate human-admin action:

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="me@davidhaile.com" \
SAMRA_GCP_EXPECTED_SHA="$(git rev-parse HEAD)" \
  bash deploy/gcp/activate-staging-zero-traffic-federation.sh --review
```

After an authorized activation, run
`audit-staging-zero-traffic-federation.sh`. It independently verifies the
dedicated pool and single provider, provider condition, exact custom role and
resource bindings, provider-managed Cloud Run service-agent role, non-public
Artifact Registry, and absence of user-managed keys without changing cloud
state. GitHub must also have a protected `staging-zero-traffic-deployment`
environment restricted to `main`; environment variables hold only reviewed
non-secret identifiers and pinned secret version numbers.

### Staging verification evidence

`staging-verification.json` and `record-staging-verification.mjs` define and
record the pre-promotion evidence boundary. The recorder consumes independently
hashed zero-traffic deployment, exact-image, and private exact-revision probe
manifests; requires the same exact candidate, image, service, and revision; and
binds both evidence planes to one completed passing `SAMP` run in
`google-cloud-staging`. Six database and financial checks run from the exact
immutable image. Service authentication and deployed-revision network-path
checks run through the exact deployed HTTP revision. The record truthfully sets
`allChecksUsedDeployedRevision: false` while proving complete coverage. It
records no secrets or customer data and cannot change traffic, public access,
runtime configuration, vendors, or production.

`staging-image-verification.json` adds the first executable layer without
overstating what it proves. The API build now includes
`dist/staging-verification.mjs`, a bundled, rerunnable version of the nine
PostgreSQL synthetic journeys. The ordinary API container command is unchanged.
The partial recorder can bind a passing exact-image run to the immutable digest
and zero-traffic revision attestation, but its status is always
`passed-not-promotion-eligible`. It explicitly records service authentication
and the deployed-revision network path as `not-executed`.

`staging-image-verification.yml` now implements the protected, manual,
main-only execution path. Its isolated federation controller can create and
delete only the temporary private verifier job, attest the exact zero-traffic
revision, and read JUnit only through a Cloud Logging view filtered to that job.
The distinct runtime identity alone can resolve one explicitly numbered
database-secret version. One task, no retries, a unique synthetic run ID, exact
image digest, before/after service-boundary comparison, mandatory job deletion,
and hashed 365-day evidence prevent duplicate or ambiguous results.

The exact-image workflow and one-time federation activation are implemented but
remain unauthorized. Exact-image evidence alone does not prove service
authentication or the deployed-revision network path and therefore cannot
authorize promotion. The separate `staging-verification-probe.yml` workflow now
implements that missing plane. It temporarily enables the private service URL
and an exact-revision tag without changing traffic, ingress, public IAM, or the
runtime template; runs one keyless, no-secret VPC-connected job; then restores
the complete service boundary byte for byte. It combines both JUnit evidence
sets into one Qase run and records one hashed, promotion-consumable manifest.
The probe federation and workflow remain dormant and execution remains
unauthorized. Review and independently audit each federation boundary before
its first protected workflow run.

### Exact-revision traffic promotion and rollback

`staging-traffic-control.json` defines the next release boundary. The manual
`staging-traffic-control.yml` workflow accepts only a candidate already in
current `main` history. Promotion requires exact hashed zero-traffic deployment
and functional-verification artifacts for the same candidate, service, and
revision. The verification contract requires readiness, restart, service
authentication, ledger, reconciliation, audit, and failure-visibility checks,
plus a `SAMP` Qase run in `google-cloud-staging`.

`control-staging-traffic.sh --review` proves the service remains private and
untagged, the candidate revision is Ready and matches the immutable image
digest, and one different healthy revision currently receives exactly 100% of
traffic. This deliberately rejects first activation, partial rollout, tags,
floating aliases, and an unrecorded rollback target. An authorized promotion
uses only `--to-revisions=<exact revision>=100`, independently verifies the
result, and writes a hashed promotion manifest. A controller failure after the
traffic operation triggers a best-effort automatic rollback to the prior
revision and leaves the run failed.

Rollback consumes that exact promotion manifest, verifies current traffic still
matches the promoted state, restores the recorded prior revision without a
rebuild, and writes a second hashed record. The record remains pending until
post-rollback synthetic verification passes. Beyond the reviewed traffic
allocation, no operation changes the runtime template, service IAM, vendors,
secrets, databases, production, or Replit.

The one-time traffic federation activation is separately reviewable through
`activate-staging-traffic-federation.sh`. Its independent audit requires one
isolated pool with exactly two environment-specific providers and two distinct
keyless identities. The custom role contains only Cloud Run traffic update and
read/audit permissions. The audit fails if either identity has build-image,
Cloud Build source-bucket, secret, migration, runtime-impersonation, IAM, or
user-managed-key authority.

Review example from an authenticated, fixed-source Cloud Shell checkout:

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="me@davidhaile.com" \
SAMRA_GCP_EXPECTED_SHA="$(git rev-parse HEAD)" \
  bash deploy/gcp/publish-staging-images.sh --review
```

The apply mode must not be run until the build cost and exact source SHA are
approved. The build service account is limited to reading the exact source
bucket, writing the staging repository, and emitting logs/provenance; it is not
the runtime, migration, or deployment identity.

The source-bucket permission is a separate, one-time activation gate.
`activate-staging-build-source-access.sh --review` verifies the exact existing
bucket, keyless build identity, current project roles, non-public bucket policy,
and whether the one reviewed bucket binding is absent or already exact. Only
`--apply` with `AUTHORIZED_STAGING_BUILD_SOURCE_ACCESS` may add that binding.
It cannot grant project-level storage access or submit a build. Run the
independent `audit-staging-build-source-access.sh` after activation and before
authorizing another image publication.

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="me@davidhaile.com" \
SAMRA_GCP_EXPECTED_SHA="$(git rev-parse HEAD)" \
  bash deploy/gcp/activate-staging-build-source-access.sh --review
```

### Keyless GitHub-to-Google publication

`staging-github-federation.json` locks the GitHub publication boundary to the
private `haileleuld87/Samra-Pay` repository by both name and stable numeric
repository and owner IDs. Google accepts only an OIDC token for a manual
`.github/workflows/staging-image-publication.yml` invocation on
`refs/heads/main` using the protected `staging-image-publication` environment.
Pull requests, pushes, schedules, forks, other repositories, other branches,
other workflow files, a renamed workflow, and jobs outside that environment
fail the provider condition before they can impersonate a Google identity.

`activate-staging-github-federation.sh` is the guarded one-time trust bootstrap.
Its offline `--plan` mode reads no Google or GitHub state. `--review` verifies
the exact staging project, organization, labels, clean source SHA, APIs, pool,
provider, custom role, keyless publisher, and IAM state. Only `--apply` with
`AUTHORIZED_STAGING_GITHUB_FEDERATION` may enable IAM Credentials and Security
Token Service, create the reviewed pool/provider and
`samra-github-staging` identity, or add these three resource boundaries:

- the exact custom read-and-build-submit role on the staging project;
- `roles/storage.objectCreator` on only the Cloud Build source bucket; and
- `roles/iam.serviceAccountUser` on only the existing staging build identity.

The repository-specific Workload Identity principal receives only
`roles/iam.workloadIdentityUser` on the publisher identity. Neither the
publisher nor the build identity may have a user-managed key. Run
`audit-staging-github-federation.sh` after activation; it independently rechecks
the provider condition, exact permissions and bindings, non-public source
bucket, and absence of publisher keys without changing cloud state.

`.github/workflows/staging-image-publication.yml` uses commit-pinned releases
of `google-github-actions/auth` v3, `setup-gcloud` v3, and `actions/checkout`
v7. The generated short-lived credential file is excluded from Git and
all container contexts. One protected job performs the read-only review and,
only when explicitly requested, continues to publication without repeating
checkout, authentication, SDK setup, or environment approval. Publication
requires all of the following:

1. a manual run from the current `main` ref in the exact private repository;
2. a successful read-only review for the same Git SHA and federated session;
3. selection of `publish` plus the exact image-publication authorization; and
4. approval through the `staging-image-publication` GitHub environment.

Before enabling publication, that environment must restrict deployment to
`main`. In a multi-operator organization it must also use a qualified required
reviewer with self-review prevention. In the documented solo-founder operating
model, do not create a nominal reviewer or enable a rule that deadlocks every
release. The manual exact-SHA authorization, required automated checks, exact
workflow identity, immutable digest, and evidence gates are the operative
separation controls until a second qualified human exists. Until the applicable
repository settings are independently verified, use only the workflow's
`review` mode. The workflow reuses
`publish-staging-images.sh`; it does not introduce a second image build path and
contains no service deployment, traffic, migration, secret-value, provider,
production, or Replit command.

One-time review example from the exact merged source in Cloud Shell:

```sh
SAMRA_GCP_PROJECT_NUMBER="934122615631" \
SAMRA_GCP_OPERATOR_ACCOUNT="me@davidhaile.com" \
SAMRA_GCP_EXPECTED_SHA="$(git rev-parse HEAD)" \
  bash deploy/gcp/activate-staging-github-federation.sh --review
```

Verified provenance has a separate, one-time API activation gate.
`activate-staging-build-verification.sh --review` confirms the exact project,
source SHA, Container Analysis API state, and Cloud Build service-agent IAM.
Only `--apply` with `AUTHORIZED_STAGING_BUILD_VERIFICATION` may enable
`containeranalysis.googleapis.com`; the controller cannot modify IAM or submit
a build. Run the independent `audit-staging-build-verification.sh` after the
activation. The Cloud Build service agent role is provider-managed and must not
be copied to the custom build worker or any human principal.

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="me@davidhaile.com" \
SAMRA_GCP_EXPECTED_SHA="$(git rev-parse HEAD)" \
  bash deploy/gcp/activate-staging-build-verification.sh --review
```

Failed image-publication attempts may leave filtered source archives in the
Cloud Build-created source bucket. This controller does not delete
them; deletion is a separate destructive action and requires separate review.

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

`review-staging-runtime.sh` is the next bounded gate. Its offline `--plan` mode
validates the runtime contract without reading cloud state. Its authenticated
`--review` mode binds the review to one clean full Git SHA, confirms all five
image tags resolve to immutable digests, proves the seven dedicated service
accounts have no user-managed keys, re-runs the read-only database-access
post-audit, and requires the four target services plus migration and temporary
database jobs to be absent. The review prints image digests as deployment
evidence but never reads a secret value.

This controller intentionally has no apply mode. The service-to-service code
boundary is implemented, but a runtime deployment remains blocked until the
load-balancer and IAP policy, exact service-level `roles/run.invoker` grant and
zero-traffic dual-token proof, logging and alerts, rollback owner, cost
boundary, executable database-access audit, and critical Qase release evidence
are approved. The
Operations Portal remains separately blocked by workforce authentication,
staff-access lifecycle controls, and operations API security promotion.

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
Its generated private-IP PostgreSQL URLs explicitly request libpq-compatible
`sslmode=require` behavior. This keeps transport encrypted without implying a
CA or hostname-verification policy that the staging foundation does not
configure. The parsed URL contract always contains both parameters so a driver
upgrade cannot silently change the connection policy. The controlled
resume path accepts the single pre-contract bootstrap payload already created
in staging, normalizes it in memory, and writes only explicit permanent URLs.
The bootstrap execution receives one temporary Secret Manager payload and
creates the two permanent non-superuser logins. The permanent Cloud SQL-managed
`cloudsqlsuperuser` system role owns the two group-membership grants so deleting
the temporary bootstrap user cannot leave a PostgreSQL grant dependency. No
permanent Samra principal inherits that system role. Subsequent migration,
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
SAMRA_API_SERVICE_AUTH_MODE=cloud-run-iam
SAMRA_API_SERVICE_AUDIENCE=https://<samra-api-cloud-run-host>
```

The customer-web service identity must receive `roles/run.invoker` on the exact
`samra-api` Cloud Run service only. Do not grant project-wide invocation. The
proxy obtains the Google ID token from Cloud Run metadata and sends it through
`X-Serverless-Authorization`, leaving the browser's Auth0 `Authorization`
header intact. Token acquisition or claim validation failure returns HTTP 502
before the API is called.

The customer-web image is environment-portable. It loads
`/samra-runtime-config.js` before the application bundle and the Cloud Run
static server emits only these allowlisted public runtime values:

```text
SAMRA_PUBLIC_DATA_MODE=api
SAMRA_PUBLIC_AUTH0_DOMAIN=<hostname-only>
SAMRA_PUBLIC_AUTH0_CLIENT_ID=<public-SPA-client-id>
SAMRA_PUBLIC_AUTH0_AUDIENCE=<exact-HTTPS-Samra-API-identifier>
```

They are not secrets. Omitting any Auth0 value leaves API-mode customer sign-in
fail-closed. The endpoint is `no-store`, maps only the four reviewed public
identifiers, and ignores every other process variable. Auth0 identifiers are no
longer Docker build arguments, so one immutable image can move between reviewed
environments without a rebuild. Never pass an Auth0 client secret, access token,
refresh token, management credential, Persona value, or Crossmint value into
the browser image or public runtime endpoint. Callback and logout URLs must
exactly match the deployed customer-web application URI.

The API runtime uses these non-secret Auth0 values when the reviewed staging
tenant exists:

```text
SAMRA_CUSTOMER_AUTH_MODE=auth0
AUTH0_ISSUER_BASE_URL=https://<tenant-or-custom-domain>/
AUTH0_AUDIENCE=<exact-HTTPS-Samra-API-identifier>
```

Persona and Crossmint remain separately gated. Their future server credentials
must use Secret Manager environment references pinned to numeric versions;
Google recommends numeric version pinning for secrets injected as Cloud Run
environment variables. The API service identity receives per-secret access only
during a separately authorized activation. The customer web and mobile clients
never receive those values. See
`docs/operations/staging-vendor-runtime-readiness.md`.

A controlled mobile staging bundle requires:

```text
EXPO_PUBLIC_SAMRA_DATA_MODE=api
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://<samra-api-cloud-run-host>
EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native
EXPO_PUBLIC_AUTH0_DOMAIN=<hostname-only>
EXPO_PUBLIC_AUTH0_CLIENT_ID=<public-native-client-id>
EXPO_PUBLIC_AUTH0_AUDIENCE=<exact-HTTPS-Samra-API-identifier>
```

These values are public bundle configuration, not secrets. The mobile build
rejects credentials, paths, queries, fragments, non-loopback HTTP origins, and
partial Auth0 configuration. Native Auth0 mode pins application ID
`com.samrapay.mobile.staging` and scheme `samrapayauth`, and requires a reviewed
custom Expo development client or native build. The default mock/disabled build
does not add the native plugin and remains available through Expo Go. No client
secret, refresh token, Persona value, or Crossmint value belongs in this bundle.

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
