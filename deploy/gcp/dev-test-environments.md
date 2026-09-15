# Separate Dev, Test, Staging and Production

Status September 10: both isolated runtimes are deployed with private migrated
PostgreSQL, least-privilege roles and numbered secret versions. Both passed
readiness, public login shell, actual Auth0 redirect, anonymous data denial,
private API denial and start → stop → restart → stop. They are currently paused
with data retained under the $50 combined monthly planning allowance.

[Dev evidence](../../docs/operations/evidence/2026-09-10-dev-runtime-activation.json)
and [Test evidence](../../docs/operations/evidence/2026-09-10-test-runtime-activation.json)
record identical application image digests, exact source, job executions and
session times. Real tester login, account isolation, synthetic transactions and
ledger acceptance remain pending. [Native error alerts](dev-test-monitoring.md)
are configured; matching logs alone do not prove inbox delivery.

September 14 reconciliation: both projects are now directly under company
organization `993968777863` and remain paused on the same application images,
revisions and numbered secrets. The retained receipts include a later
post-move start/stop and drain execution than the original activation records.
The inventory therefore pins new [Dev baseline](../../docs/operations/evidence/2026-09-14-dev-runtime-baseline-reconciliation.json)
and [Test baseline](../../docs/operations/evidence/2026-09-14-test-runtime-baseline-reconciliation.json)
records, preserving the original evidence unchanged. This metadata readback is
not a new deployment, live HTTP check or tester acceptance. Organization IAM
readback remains blocked for the configured operator pending separately
approved read access; database-user absence must be rechecked after authorized
SQL start, before candidate migrations or audits.

Owner: David Haile. Resource inventory: [dev-test-environments.json](dev-test-environments.json).
Dated [foundation read-back](../../docs/operations/evidence/2026-09-09-dev-test-foundation.json).
Local backend implementation: [Dev Compose](../dev/README.md).

## Delivery order

1. Local Mac Dev: primary daily build/test loop in Cursor using the existing
   Compose and native clients. Shared Cloud Dev provides bounded integration
   sessions when cloud/Auth0 behavior needs verification.
2. Shared Test/UAT: separate project/database and Auth0 client/audience, invited
   synthetic testers and stable, exact-revision user sessions.
3. Staging: preserve production-like exact-candidate release rehearsal.
4. Production: preserve existing approval and readiness gates.

Both shared runtimes were requested on September 9 and activated September 10.
The September 10 delivery priority makes local Mac development primary while
retaining stable shared Test and optional bounded Cloud Dev. Dev project `samra-pay-dev`
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
contains the exact grants and read-back commands. David approved the six grants;
they were applied as `me@davidhaile.com` and independently read back on 2026-09-09.
See the [build IAM evidence](../../docs/operations/evidence/2026-09-09-dev-test-build-iam.json). It grants
no database, secret, deployment, impersonation or production access.
A build failure stops publication; if an immutable tag was already pushed,
inspect its digest and source before retrying. Database compute remains stopped
through image publication. The combined $50 budget includes build charges.
