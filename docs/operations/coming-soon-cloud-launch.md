# Coming-soon Google Cloud launch

## Decision

Launch the public DS2 coming-soon site before Auth0, Persona, Crossmint, or the
transaction product. Ongoing Sites edits do not block engineering. Sites is the
design workspace; a refreshed, reviewed snapshot becomes a Git commit, and the
immutable Git commit becomes the Google Cloud release.

The bounded production project, billing link, USD 25 alert, keyless preflight
trust, APIs, immutable image repository, five workload identities, exact IAM,
two empty secret metadata records, private VPC, subnet, Private Services
Access, zonal PostgreSQL 16 instance, and empty application database now exist
and passed independent audit. This runbook does not authorize database
credentials, migrations, deployment, public traffic, waitlist data collection,
vendors, or Squarespace DNS changes. Those decisions remain explicit gates in
`deploy/gcp/coming-soon-launch.json`.

## Static public release for August 31, 2026

David approved an exact-SHA static informational release without email
collection so the public site can launch before the interactive application.
`deploy/gcp/coming-soon-static-hosting.json` is the controlling contract for
this release. It is additive and does not authorize the deferred API, database,
identity, KYC, wallet, or money-movement path below.

```mermaid
flowchart LR
  V[Public visitor] --> DNS[Squarespace web DNS records]
  DNS --> FH[Firebase Hosting\nglobal CDN + managed TLS]
  G[Reviewed Git full SHA] --> B[Static public bundle]
  B --> FH
  FH -. no connection .-> API[No API]
  FH -. no connection .-> DB[(Production database unused)]
```

The public bundle contains one presentation-only email interest form whose
inputs are disabled outside loopback. It contains no waitlist endpoint,
email collection, advertising pixel, secret, database access, customer authentication, KYC, wallet, or financial
vendor integration. The September 2 analytics amendment permits consent-gated
GA4 only on canonical `www`, with an explicit Google endpoint allowlist and
`form-action 'none'`. It is implementation approval, not deployment approval.
Google-hosted delivery systems may retain ordinary request logs separately.
See [Public website analytics](public-website-analytics.md) for collection,
privacy settings, acceptance tests, and the exact-SHA release gate.

Run the no-cost local plan from the repository root:

```sh
bash deploy/gcp/activate-coming-soon-static-hosting.sh --plan
```

The reviewed apply is limited to Firebase project linkage when absent, the
single `samra-pay-production` Hosting site, and `firebase deploy --only
hosting`. It requires the exact Git SHA, clean tree, production operator and
project, and the `AUTHORIZED_COMING_SOON_STATIC_HOSTING` sentinel. It does not
change Squarespace DNS. The default HTTPS URL is verified before any custom
domain change.

Expected incremental Hosting cost is USD 0 while usage stays within 10 GiB of
stored data and 10 GiB of monthly transfer. Usage above those allowances is
billable. This is not a spending cap. The existing guarded infrastructure
estimate remains USD 81.92 per month, leaving USD 18.08 below the USD 100
total-estimate reassessment boundary.

For the custom domain, preserve MX, TXT, SPF, DKIM, DMARC, and every unrelated
record. Change only the exact web records returned by Firebase for
`www.samrapay.com` and the apex redirect. Verify managed TLS and all public
routes after DNS validation.

## Permanent public edge and deferred product topology

```mermaid
flowchart LR
  V[Public visitor] --> WWW[www.samrapay.com\nstatic Firebase public edge]
  C[Future customer] -. separate activation .-> APP[app.samrapay.com\nauthenticated customer web]
  APP -. controlled server boundary .-> API[api.samrapay.com\nAPI edge]
  API -. private service identity .-> DB[(Separate private\nproduction PostgreSQL)]
  WWW -. no application connection .-> API
```

`www` remains the independently deployable public, legal, and marketing surface
after the financial product launches. `app` and `api` are planned names, not
deployed services or authorized DNS changes. The API name does not authorize
unrestricted Cloud Run ingress; the customer-web service identity and private
API boundary remain governing. The browser never receives a database or server
credential. Auth, KYC, wallet, and financial routes stay dormant until their
separate gates pass.

The complete host, security, reuse, and activation rules are in
[Public and product surface boundary](../architecture/public-product-surface-boundary.md).

## Source and copy workflow

1. David continues UI and copy edits in Sites.
2. Engineering can change data, security, deployment, tests, and API behavior
   independently in Git.
3. At the cutover gate, capture the newest Sites version and compare it with the
   pinned snapshot in the launch contract.
4. Sync only reviewed public UI and copy changes. For the static release, keep
   the future waitlist module unreferenced and enforce its absence from the
   public bundle. Do not overwrite the API, database, build boundary, or
   deployment controls.
5. Re-run public tests, type checks, production build, visual QA, API tests,
   database tests, container tests, and the launch-contract validator.

## Waitlist data boundary

The form requires explicit, unchecked consent. It stores the normalized email,
email hash, consent state and notice version, locale, hashed idempotency key,
request fingerprint, and server timestamp. It does not submit attribution,
device, referral URL, Auth0, Persona, Crossmint, or financial data with the
email. Acquisition telemetry remains a separate record and purpose boundary.

Production waitlist data must not enter the synthetic staging database. The
production project, private PostgreSQL target, pinned Secret Manager version,
retention policy, deletion procedure, and access owner must be approved before
the first public submission.

## Deferred waitlist release and rollback

This sequence belongs only to the unapproved interactive waitlist contract. It
does not replace Firebase at `www`, create `app` or `api` DNS, deploy either
future surface, or authorize customer data or vendor activation.

1. Re-verify the existing `samra-pay-production` project (`382465561715`) in
   `us-east4`, its budget, billing, domain, and data boundaries. The staging
   project is not eligible.
2. Build the customer web, API, and migration images from one full Git SHA.
   Record each digest; do not deploy a floating tag.
3. Apply the waitlist migration once through the dedicated migration identity.
4. Deploy the API and web revisions with zero traffic. Keep the API private.
5. Prove readiness, English and Amharic routes, legal pages, one synthetic
   waitlist submission, and denial of every other public API route.
6. Record the currently healthy web and API revisions as rollback targets.
7. Promote the exact candidate revisions, verify the custom domain, and watch
   uptime, 5xx, latency, database, and waitlist-acceptance alerts.
8. If a gate fails, restore the recorded prior revisions without rebuilding.

## Production foundation preflight

Run the local plan before creating or changing any production resource:

```sh
bash deploy/gcp/review-coming-soon-production.sh --plan
```

The plan reads no cloud or DNS state. The verified boundary is project
`samra-pay-production` (`382465561715`), organization `614833350075`, region `us-east4`,
`customer-pii` data classification, apex `samrapay.com`, canonical
`www.samrapay.com`, the same billing account as `samra-pay-staging`, and a USD
25 monthly budget alert. The project, labels, exact billing-account match, and
budget passed independent read-only review. No workload or DNS state changed.

The keyless controller uses a dedicated production auditor, project-scoped
budget access, and only `resourcemanager.projects.get` on staging. It grants no
billing-account role. Its one-time zero-cost trust bootstrap and independent
audit are complete. The offline recovery plan remains:

```sh
bash deploy/gcp/activate-production-foundation-preflight.sh --plan
```

The manual `Production foundation preflight` workflow passed from `main` at
`22e7d644c25d169532018534fa25ce8b6801744a` through the protected
`production-foundation-review` environment in run `33334655501`. Its retained
evidence checksum is
`083bd82259bd54f5fab76ef08f9fab5701a45d59fcd6611d7ea5231b9a66d48b`. A later
repository transfer to the Enterprise organization requires the OIDC trust
condition to be reissued before authentication resumes.

The budget must be scoped only to the production project, use USD, equal USD
25, and include 50%, 90%, and 100% notification thresholds. A Google Cloud
budget is an alert, not a spending cap. A successful review authorizes nothing:
infrastructure, the production database, deployment, traffic, waitlist
collection, Auth0, Persona, Crossmint, and Squarespace DNS remain separate
gates.

## Applied production foundation

After the preflight contract, review the bounded foundation locally:

```sh
bash deploy/gcp/plan-coming-soon-production-foundation.sh --plan
```

This recovery plan reads no cloud or DNS state and costs USD 0. It fixes the
foundation scope to 15 approved APIs, one regional immutable
`samra-production` image repository, five dedicated keyless identities,
least-privilege IAM, and separate empty runtime and migration secret metadata.
The plan entrypoint has no `--apply` mode.

The separate activation controller was applied from source
`c328ba56b6e15d42e6fd80024160c4e3b7db9c42`. Its live review and apply ran from
one clean exact source SHA and the exact human administrator. The controller is
retained only as a recovery path:

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="me@davidhaile.com" \
SAMRA_GCP_EXPECTED_SHA="$(git rev-parse HEAD)" \
  bash deploy/gcp/activate-coming-soon-production-foundation.sh --review
```

The controller inventories every targeted API, label, repository, service
account, project and resource IAM binding, secret metadata record,
user-managed key, and secret version. Existing exact state is reusable; absent
state is resumable; drift fails closed. The apply sentinel is accepted only
after review. Its independent post-audit passed with 15 APIs, one immutable
repository, five service accounts, two secret metadata records, zero secret
versions, and the private API invoker correctly deferred. No GitHub apply
workflow exists.

The applied foundation explicitly excludes the project, billing link, budget,
VPC, Cloud SQL, secret values, Cloud Run, load balancer, certificate, public
traffic, waitlist data, vendors, and DNS. The project ID, region, data
classification, budget-alert amount, billing source, apex domain, and canonical
host are locked in the plan. The project number, same-account billing match,
and exact budget are verified. Private API invocation IAM is correctly deferred
until the API service exists.

## Applied production data foundation

The production data foundation was applied from exact source
`7977afc1a550521fefe1ae6df9acb787f75b1ed4` on 2026-08-31 and passed its
independent post-audit. It contains exactly one dedicated production VPC,
regional application subnet, Private Services Access allocation and
connection, private-only PostgreSQL 16 instance, and empty `samra_production`
database. The Cloud SQL create operation
`dd0e1c32-0518-4468-ad9d-beb70000002c` finished with status `DONE`.

The local no-cost plan remains the fail-closed recovery reference:

```sh
bash deploy/gcp/activate-coming-soon-production-data-foundation.sh --plan
```

The controller uses one dedicated production VPC with `10.50.0.0/24` for the
regional application subnet and `10.51.0.0/24` for Private Services Access. It
pins PostgreSQL 16 to a private-only `db-custom-1-3840` zonal profile with 10 GB
SSD, bounded growth to 100 GB, deletion protection, 14 retained backups, and
seven-day point-in-time recovery. It creates no database user, credential,
secret version, migration, customer row, runtime, public endpoint, or DNS
record.

This is a coming-soon availability posture, not approval for transaction
workloads. Regional HA is required before financial workloads. The reviewed
base estimate is USD 68.26 per month; the guarded estimate is USD 81.92 with a
20% contingency. The USD 25 budget remains an early alert and USD 100 is the
apply-time maximum. The estimate is valid through 2026-09-07 and must be
refreshed after that date.

The temporary zonal posture and USD 100 maximum were accepted for this apply.
The USD 25 budget remains an early alert, not a spending cap. The guarded
estimate was USD 81.92 per month, below the USD 100 action-time hard stop;
actual billing remains usage-dependent. The apply log was captured with
SHA-256
`f5f488b460d3d7833840471c3a0aff7217972a2bea616ee98b4f1885e19269f4`.

The retained recovery controller still requires an authenticated exact-SHA
review and the explicit `AUTHORIZED_COMING_SOON_PRODUCTION_DATA_FOUNDATION`
sentinel before any recovery mutation. It is resumable, reuses exact state,
rejects drift, and runs an independent read-only post-audit. The verified state
has zero secret versions, Cloud Run services, and Cloud Run jobs. No database
user, credential, migration, customer row, public endpoint, vendor integration,
or DNS record exists. Retention, deletion, access ownership, and the privacy
notice remain required before the first waitlist record.

## Production project, billing, and budget controller

The controller phase is applied and independently verified. Keep its local plan
as a fail-closed recovery reference:

```sh
bash deploy/gcp/provision-coming-soon-production-project.sh --plan
```

The local plan costs USD 0 and reads no Google Cloud or DNS state. The recovery
controller is idempotent: it reuses exact state and rejects any project,
billing, or budget drift. It cannot enable an API, create infrastructure,
deploy, route traffic, collect data, activate vendors, or change Squarespace
DNS. Database credentials and migration, deployment, traffic, and DNS remain
later gates.

## Squarespace DNS cutover

Squarespace remains the registrar and DNS owner. Do not transfer the domain.
After Google assigns the verified load-balancer endpoint and the certificate is
ready, lower only the affected web-record TTL, point `www`, verify HTTPS and the
waitlist end to end, then point the apex. Preserve MX, TXT, SPF, DKIM, DMARC,
and unrelated verification records exactly. DNS changes require a separate
authorization at the action boundary.

## Remaining launch decisions

- production PostgreSQL retention, deletion, access-owner, and privacy approval;
- separately reviewed pinned database credentials and migration;
- final privacy notice and consent language;
- final refreshed Sites snapshot and desktop/mobile visual approval;
- Cloud Armor thresholds, alert recipients, rollback owner, and launch window;
- explicit authorization for infrastructure apply, public traffic, and DNS.

Auth0 follows the coming-soon launch. Persona follows Auth0. Wallet
infrastructure follows identity and KYC. None of those vendor activations needs
to be rebuilt because the public launch keeps them behind independent adapters
and approval gates.
