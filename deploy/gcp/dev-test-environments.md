# Separate Dev, Test, Staging and Production

Status: Dev and Test projects created and read back on 2026-09-09; billing
unlinked, database/runtime deployments pending. No usable app URL is claimed.
Owner: David Haile. Resource inventory: [dev-test-environments.json](dev-test-environments.json).
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
environment labels and synthetic data classification. Neither has billing
linked. The open billing account was verified as `01196E-DFC16E-433E6C`.

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

Propose a **$200 combined monthly planning allowance** ($100 per project),
with review after seven days. This is not an approved budget or guaranteed bill.
The optional local Compose stack adds no cloud resource cost; shared Dev does. Cloud pricing depends on region and usage;
free-tier allowances are shared across the billing account, so do not count them
as dedicated Test savings.

For scale, Google's displayed instance-based base rates are $0.000018/vCPU-second
and $0.000002/GiB-second. One 1-vCPU / 0.5-GiB instance for 730 hours is about
$49.93 before free tier, region differences, networking or discounts. This is
illustrative API compute, not a full `us-east4` quote. Add the region-specific
Cloud SQL tier/storage/backups, web traffic, registry, builds, logging and egress
in the pricing calculator before apply. See [Cloud Run pricing](https://cloud.google.com/run/pricing)
and [Cloud SQL pricing](https://cloud.google.com/sql/pricing).

Use an alerts-only project budget at 50/80/100 percent and named review ownership.
An alerts-only budget is not a hard spending cap; do not promise automatic
shutdown from an alert. Any supported spend-cap feature requires separate
service-coverage verification. See [Google budget documentation](https://docs.cloud.google.com/billing/docs/how-to/budgets).

The concrete cloud apply package must include the verified billing account,
organization, exact proposed resource configuration above, approved cost scope,
operator, candidate/image identity and rollback/cleanup actions. No cloud apply
command is included in this local implementation PR. This avoids an executable
half-configured environment being mistaken for an approved deployment.

## Demonstrated code/configuration blockers

The JSON records the desired `synthetic-shared` runtime configuration.
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
- `DemoRuntime.accountResponses` still serves only the seeded demo actor. A new
  admitted customer therefore has no product account. Per-customer product-account
  resolution and idempotent balanced fixture credit are launch blockers; creating
  the projects or enabling the new profile does not close them. Reuse private
  account access work in PR #194 rather than rebuilding its return-before-KYC flow.
- Shared Test must keep `NODE_ENV=production` and development operations controls
  off. Do not enable debug/admin routes to bypass the missing tester setup path.
- The Test browser URL, ingress boundary, Auth0 application/audience and callbacks
  are not yet configured. Auth0 authorization, invitation enforcement and API IAM
  have separate jobs. Private Cloud Run URLs alone do not provide a usable browser
  flow. Any externally reachable frontend must be reviewed with account admission.
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
