# Dev/Test runtime activation

Owner: David Haile. Authorized 2026-09-09 to complete both shared environments,
within the existing combined $50/month planning allowance. Synthetic money only.
This runbook is implementation, not a claim of successful deployment or user tests.

Use the existing Cloud Build publisher and the exact reviewed GitHub commit.
Record all image digests; never deploy a mutable tag. The existing migration
image contains `lib/db/src/dev-test-database.mjs`; invoke it with Node from
`/workspace/lib/db`. Actions are `bootstrap`, `migrate`, `finalize`,
`audit-migration`, `audit-runtime`, `audit-reader`, and `drain`.

## Database access

Supply `SAMRA_DEPLOYMENT_ENVIRONMENT=dev|test` and matching
`GOOGLE_CLOUD_PROJECT=samra-pay-dev|samra-pay-test`. The job validates the actual
database name after connecting. Native Cloud Run jobs use the environment's
Direct VPC network/subnet, private-ranges-only egress, one task, no retries,
and a 10-minute timeout. Keep instance public IP disabled.

Use the instance-specific Cloud SQL server CA, mounted from an exact numbered
Secret Manager version at `/secrets/ca/server-ca.pem`. Connection secrets use
`sslmode=verify-ca&sslrootcert=/secrets/ca/server-ca.pem&uselibpqcompat=true`.
This validates the dedicated CA certificate chain. Cloud SQL's per-instance CA
identifies the database instance; this is not DNS hostname verification.
No `rejectUnauthorized=false`, `sslmode=require`, or shared public CA is allowed.

Create one temporary `samra_bootstrap_<environment>` database principal and a
separate temporary bootstrap job identity. Its sole payload secret contains
bootstrap, migration, runtime and audit database URLs. Generate strong unique
passwords privately on the authorized operator host. Never print them, put them
in a command transcript, or commit them. The bootstrap job creates permanent
principals through `SET ROLE cloudsqlsuperuser`, so the temporary principal does
not own their membership chain. If roles already exist, it stops for inspection
instead of rotating passwords or overwriting access.

Permanent roles are `samra_migrations_<environment>`,
`samra_runtime_<environment>` and `samra_audit_<environment>`. Only migrations
may create schema objects. Runtime has reviewed DML without DELETE or DDL;
cohort/invitation controls preserve their narrower column privileges. The audit
role has SELECT only. Future tables receive no automatic runtime grants.
`migrate` serializes with bootstrap/audit using a database advisory lock, runs
existing migrations, finalizes privileges, and audits the migration principal.
Verify both other principals with their own connections before deploying API.

After successful bootstrap, disable its database login, disable its secret
version, remove its secret access, and disable its Cloud service account. Keep
sanitized receipts and rollback information. Permanent runtime identities each
receive only their own connection secret and the public CA secret. The web
identity gets no database secret; it receives API invocation on its own service.

## Runtime and sessions

Deploy API and authenticated customer web from recorded digests. API requires
Cloud Run IAM and validates the customer Auth0 token independently. Only the
customer web service identity may invoke its environment's API. The web shell
is reachable for login; all customer API data requires Auth0 plus Samra admission.
Never make the API public or grant testers direct API invocation.

Use configuration in `dev-test-environments.json`; all three provider modes
remain fake, internal operations stay disabled, and only the exact frontend
origin is allowed. API CPU remains allocated while one manually scaled instance
runs, so the existing synthetic worker can finish asynchronous work. Web starts
with zero minimum and one maximum instance.

Start: database ready, API manual scale one and readiness verified, then web.
Stop: web manual scale zero, allow in-flight requests to finish, run `drain`
using the read-only role, API manual scale zero, database activation NEVER.
A failed drain leaves API/database running for recovery and records a blocker;
never clear queues or alter transfers to force a shutdown. Record session hours.

Before functional acceptance, use the existing tester CLI to admit exactly two
synthetic identities with bounded expiry. Each tester completes consent. Keep
Auth0 subjects and credentials in private manifests. Account provisioning and
balanced fixture credits must be tested separately before synthetic transfers.
Do not report two-user acceptance from anonymous health checks or mocked tokens.
