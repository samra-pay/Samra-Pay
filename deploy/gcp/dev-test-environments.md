# Separate Dev, Test, Staging and Production

Status: proposed on 2026-09-09; no cloud resources applied by this change.
Owner: David Haile. Resource inventory: [dev-test-environments.json](dev-test-environments.json).
Local backend implementation: [Dev Compose](../dev/README.md).

## Delivery order

1. Local Dev: repeatable isolated PostgreSQL, migrations, fixtures and API.
   This is a single-fixture developer backend with authentication disabled;
   it is not a shared user-testing service or login acceptance environment.
2. Shared Test/UAT: independent GCP project/database/IAM, Auth0 Test app, two
   admitted test accounts, API-connected customer web and fake financial providers.
3. Staging: preserve production-like exact-candidate release rehearsal.
4. Production: preserve existing approval and readiness gates.

Reserve the proposed `samra-pay-dev` project for future shared development; do
not duplicate an always-on Cloud SQL stack there now. No feature branch or
persistent database is shared with Test, Staging or Production. Project IDs and
billing/organization must be read back before creation; their names here are
proposals, not proof of availability or permission.

## Smallest shared Test footprint

| Resource | Proposed configuration |
| --- | --- |
| Project | `samra-pay-test`, existing organization after readback, `us-east4` |
| Database | PostgreSQL 16, zonal `db-g1-small`, private IP, 10 GB SSD, 50 GB growth limit, seven retained backups/PITR, deletion protection |
| Network | Dedicated VPC/subnet/private services access; direct VPC egress from API/jobs |
| API | One 1-vCPU / 512-MiB instance during sessions, instance-based CPU, maximum one; IAM plus customer Auth0 authorization |
| Web | Existing customer application, separate authenticated build, zero minimum/one maximum instance, IAM-authenticated API proxy |
| Migrations | Existing migration image, explicit one-shot job, no retries, separate identity/DB role |
| Secrets | Separate runtime and migration connection secrets, exact numbered versions; no production/provider keys |
| Evidence/operations | Existing GitHub artifacts, Cloud Logging/Monitoring, read-only operator access; no public operations portal |

The fake worker currently runs on a timer inside the API process. Scaling to
zero with CPU allocated only during requests can strand a transfer after the
request returns. Test therefore needs instance-based CPU and an instance during
sessions, or a separately implemented job-driven worker. Reuse the existing
worker first; record when a session starts/stops. Do not imply successful
background processing from HTTP readiness alone.

## Cost and authorization package

Propose a **$100 monthly planning allowance** for the shared Test environment,
with review after seven days. This is not an approved budget or guaranteed bill.
Local Dev adds no cloud resource cost. Cloud pricing depends on region and usage;
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

The runtime environment values in the JSON are a starting-point inventory,
not a deployable shared-Test profile. `deploymentBlocked` remains true.

- This change adds `--build-arg SAMRA_WEB_SURFACE=legacy` to the existing customer
  web Dockerfile, selecting `build:legacy`. The default remains the public build.
  CI builds both and checks the customer runtime-config/license artifacts.
  A successful image build still does not prove Auth0 login or deployed routing.
- Local fixture seed creates a second synthetic customer, but not two complete
  admitted Auth0 account mappings with independently funded product accounts.
  Build a bounded operator provisioning path using the actual identity schema.
  Synthetic funding must use balanced journals and durable idempotency.
- Current `demo` mode does not wire the alpha invitation store; `alpha-release-1`
  does, but deliberately blocks financial routes. Implement a bounded Test
  admission profile reusing the existing store before exposing synthetic transfers
  to testers. Neither changing the project name nor selecting fake providers
  closes that server-authorization gap. Reuse private account access work in
  PR #194 rather than rebuilding its return-before-KYC flow.
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
