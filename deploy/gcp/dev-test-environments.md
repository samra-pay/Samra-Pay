# Separate Dev, Test, Staging and Production

Status: Dev and Test projects created and read back on 2026-09-09; billing
linked and combined $50 monthly budget verified. Private PostgreSQL instances
and databases are created; both instances are STOPPED with activation NEVER.
Auth0 Dev/Test clients, distinct audiences and exact callback/logout origins are saved and read back.
Schema migrations, credentials and application deployments are pending. No usable app URL is claimed.
See the [Auth0 read-back](../../docs/operations/evidence/2026-09-09-dev-test-auth0.json).
Owner: David Haile. Resource inventory: [dev-test-environments.json](dev-test-environments.json).
Dated [foundation read-back](../../docs/operations/evidence/2026-09-09-dev-test-foundation.json).
Local backend implementation: [Dev Compose](../dev/README.md).

## Delivery order

1. Shared Dev: independent GCP project/database, authenticated customer web and
   fake providers for daily development. The local Compose stack is optional.
2. Shared Test/UAT: separate project/database and Auth0 client/audience, invited
   synthetic testers and stable, exact-revision user sessions.
3. Staging: preserve production-like exact-candidate release rehearsal.
4. Production: preserve existing approval and readiness gates.

David corrected the local-only Dev assumption on 2026-09-09. Both shared
runtimes are the active delivery priority. Dev project `samra-pay-dev`
(`829811168658`) and Test project `samra-pay-test` (`378050809796`) were created
in existing organization `614833350075`, then read back as ACTIVE with separate
environment labels and synthetic data classification. Both now have billing
linked under the explicitly approved $50 combined monthly scope. The open billing account was verified as `01196E-DFC16E-433E6C`.

Each environment gets its own copy of the following footprint, with the names
in the JSON inventory. Dev uses subnet `10.60.0.0/24` and private-services range
`10.61.0.0/24`; Test uses `10.70.0.0/24` and `10.71.0.0/24`. There is no peering
to Staging or Production. No feature branch or persistent database is shared.

## Shared Dev and Test footprint

| Resource            | Proposed configuration                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project             | `samra-pay-test`, existing organization after readback, `us-east4`                                                              |
| Database            | PostgreSQL 16, zonal `db-g1-small`, private IP, 10 GB SSD, 50 GB growth limit, seven retained backups/PITR, deletion protection |
| Network             | Dedicated VPC/subnet/private services access; direct VPC egress from API/jobs                                                   |
| API                 | One 1-vCPU / 512-MiB instance during sessions, instance-based CPU, maximum one; IAM plus customer Auth0 authorization           |
| Web                 | Existing customer application, separate authenticated build, zero minimum/one maximum instance, IAM-authenticated API proxy     |
| Migrations          | Existing migration image, explicit one-shot job, no retries, separate identity/DB role                                          |
| Secrets             | Separate runtime and migration connection secrets, exact numbered versions; no production/provider keys                         |
| Evidence/operations | Existing GitHub artifacts, Cloud Logging/Monitoring, read-only operator access; no public operations portal                     |

The fake worker currently runs on a timer inside the API process. Scaling to
zero with CPU allocated only during requests can strand a transfer after the
request returns. Test therefore needs instance-based CPU and an instance during
sessions, or a separately implemented job-driven worker. Reuse the existing
worker first; record when a session starts/stops. Do not imply successful
background processing from HTTP readiness alone.

## Cost and authorization package

David approved **$50 combined per month** on 2026-09-09. Billing linkage and
budget `2404c65e-6bd9-4710-953a-59cf5d7a3870` were read back. The budget filters
only Dev and Test and uses current-spend alerts at 50/80/100 percent plus a
100-percent forecast alert. Default billing IAM recipients remain enabled.
No hard spending cutoff is claimed. Staging, Production and vendor subscriptions
are separate. Owner: David Haile; first cost review due 2026-09-16.

Plan for approximately **200 combined environment-hours per month**, initially
150 Dev and 50 Test. Retain separate PostgreSQL `db-g1-small` instances and data,
but stop database compute outside sessions. At the verified us-east4 instance
rate of $0.0375/hour, 200 database-hours cost $7.50; API compute is approximately
$14; two 10-GiB SSD disks approximately $4/month. Allow $10 for web, backups,
builds, registry, logs and secrets, with approximately $14 contingency. These
are low-traffic estimates, not quotas or guarantees. Free tier is not assumed.
See [Cloud SQL pricing](https://cloud.google.com/sql/pricing),
[Cloud Run pricing](https://cloud.google.com/run/pricing), and
[Cloud SQL stop/start](https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance).

Safe session controls are a deployment prerequisite, not implemented by setting
this budget. Start database, verify readiness, then enable the API worker and
customer session. To stop, close new customer writes, drain or explicitly record
unresolved work, stop API compute, then stop the database. Never kill a worker
mid-transfer just because an alert arrived. Retain data and user-test evidence.
A request-only scale-to-zero API does not guarantee background transfer progress.
Do not leave either database or API running indefinitely while setup is blocked.

## Session operation using native Cloud Run controls

Use Cloud Run manual scaling for the API: one instance during a session, zero
outside it. A minimum-instance setting of zero alone is not an off switch.
Manual zero disables serving without deleting the revision or its configuration.
See [manual scaling](https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling).

After deployment and acceptance of the shutdown sequence, the operator performs:

1. Start only the selected database (`gcloud sql instances patch ...
   --activation-policy=ALWAYS`) and read back readiness.
2. Set that environment's API to `--scaling=1`; verify its pinned revision and
   database readiness. Start the customer web only after the API is healthy.
3. End the customer session by setting customer web to `--scaling=0`. Ensure no
   tester has direct Cloud Run API invocation rights and let in-flight requests
   finish. Customer logout alone does not close the write boundary.
4. Through the scoped read-only database role, verify no active transfer, ledger
   hold, pending/processing outbox item or received/deferred provider event remains.
   Failed or uncertain work needs a recorded recovery decision. Do not delete it
   or force its financial state to make a shutdown check pass.
5. Set API to `--scaling=0`, read it back, then stop the selected database with
   `--activation-policy=NEVER`. Record session start/end and accumulated hours.

These are the chosen native controls, not a claim that a deployed shutdown drill
has passed. Exact service revisions, database roles and drain queries still need
validation before user sessions. Do not configure an unattended shutdown that
can interrupt financial work, and do not unlink billing as a session stop action.

## Demonstrated code/configuration blockers

The JSON records the desired `synthetic-shared` runtime configuration.

The [initial tester operator procedure](../../docs/testing/shared-test-operator.md)
provides preview/apply commands for the two synthetic invitations and fake
identity decisions. It preserves customer-led consent and wallet creation;
product account provisioning and synthetic funding are still separate prerequisites.
`deploymentBlocked` remains true until provisioning and acceptance finish.

- This change adds `--build-arg SAMRA_WEB_SURFACE=legacy` to the existing customer
  web Dockerfile, selecting `build:legacy`. The default remains the public build.
  CI builds both and checks the customer runtime-config/license artifacts.
  A successful image build still does not prove Auth0 login or deployed routing.
- Local fixture seed creates a second synthetic customer, but not two complete
  admitted Auth0 account mappings with independently funded product accounts.
  Build a bounded operator provisioning path using the actual identity schema.
  Synthetic funding must use balanced journals and durable idempotency.
- `synthetic-shared` reuses the existing durable invitation store while allowing
  the existing synthetic financial routes. It requires the exact matching Dev
  or Test project name, Auth0, PostgreSQL, Node production mode, explicit origins
  and fake identity/wallet/financial providers. The runtime/project environment
  checks are misconfiguration guards, not independent proof of cloud identity.
  Deployment must read back project, database, secrets and service identity.
  Alpha Release 1 retains its financial-route prohibition. Marketing writes and
  developer/operations controls stay unavailable in the shared profile.
- The shared profile resolves active USD product accounts through their customer
  and matching ledger account; balances still come from ledger postings. Account
  suffixes are synthetic display identifiers, not bank/card details. Controlled
  account provisioning and fixture credit remain operator deployment work, not
  automatic effects of login. Reuse private account access work in PR #194.
- Shared Test must keep `NODE_ENV=production` and development operations controls
  off. Do not enable debug/admin routes to bypass the missing tester setup path.
- Dev/Test Auth0 application settings and distinct API audiences are saved, using
  exact deterministic planned Cloud Run URLs. Test permits only its explicit SPA
  user grant; client-credentials access is denied. Both environments share the
  development tenant and managed password connection, while Samra admission and
  data remain independently scoped. Test Google login is disabled; Dev is unchanged.
  Browser ingress, runtime deployment, recovery delivery and actual login acceptance
  remain pending. Auth0 authorization, invitation enforcement and API IAM have
  separate jobs. Any externally reachable frontend must be reviewed with admission.
- Existing staging controllers deliberately bind staging identities/projects.
  Do not global-replace staging strings or weaken those guards. Reuse Docker,
  migration logic and provider adapters; prepare only the minimum Test-specific
  deployment steps once the inputs are known.

## Acceptance and cleanup

First local gate: compose validation → migration/seed → ready API → persistent
account response after API restart. The existing container-portability workflow
runs this on isolated CI volumes and deletes only its own stack afterward.

First shared gate: two users log in separately; scoped synthetic credit → quote
→ fake transfer → journal/balance inspection → logout/return. Exercise duplicate
requests, insufficient funds, provider uncertainty and recovery. Record the
exact deployed revision and surface for each result using the GitHub user-test
workflow in PR #203 once merged. A defined scenario, build, or merged PR is not
user execution evidence. Test completion cannot authorize real funds or KYC.

Preserve user-test evidence before resetting fixtures. At the seven-day review,
record measured cost, failed scenarios and the next decision. Stop shared Test
only through a reviewed change; do not delete its persistent database as an
incidental CI cleanup. Staging and production are outside this change.

## Publish the three runtime images

`cloudbuild.dev-test.yaml` uses native Cloud Build and the existing Dockerfiles
for API, authenticated customer web (`SAMRA_WEB_SURFACE=legacy`) and migrations.
The publication script rejects every project except the isolated Dev/Test
projects and requires a full source commit SHA. It never deploys or migrates.
Submit an archive fetched from that exact GitHub commit, record its SHA-256,
Cloud Build ID and resulting image digests, and deploy only verified digests.
The archive SHA-256 is provenance evidence; the build label alone is not source
verification. Source upload is private to the selected GCP project.

The first Dev submission was rejected before execution: Cloud Build does not
accept the legacy `829811168658@cloudbuild.gserviceaccount.com` identity as an
explicit user-specified build account. The default Compute identity has no
observed build grants and must not be silently granted broad access.
Use dedicated `samra-build-dev` / `samra-build-test` identities with only
objectViewer on their project source bucket, writer on their environment image
registry, and logWriter on their project. `configure-dev-test-build-iam.sh`
contains the exact grants and read-back commands; approval is pending. It grants
no database, secret, deployment, impersonation or production access.
A build failure stops publication; if an immutable tag was already pushed,
inspect its digest and source before retrying. Database compute remains stopped
through image publication. The combined $50 budget includes build charges.
