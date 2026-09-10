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

After successful bootstrap, delete its temporary database principal, disable its secret
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
runs, so the existing synthetic worker can finish asynchronous work. Both services
are deployed at manual scale zero. An explicit `start` opens the session only
after the API passes readiness on the recorded revision.

Start: database ready, API manual scale one and readiness verified, then web.
Stop: web manual scale zero, allow in-flight requests to finish, run `drain`
using the read-only role, API manual scale zero, database activation NEVER.
A failed drain leaves API/database running for recovery and records a blocker;
never clear queues or alter transfers to force a shutdown. Record session hours.

The controller checks recorded image digests and revisions before changing
scaling. It rejects split traffic and revision tags because manual zero does not
disable tagged URLs. See [Cloud Run manual scaling](https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling).
Do not add alternate traffic paths during a session. Budget alerts are not a
spending cap; a failed drain needs prompt operator recovery while compute remains on.

## Operator sequence

Complete the code review and retain an exact commit and three digest references
per environment. The earlier `ed2f4459` publication is not a runtime activation
candidate because it predates this database helper. The publication file has
`sourceSha` and `images` keys, with `api`, `customer-web`, and `migrations` entries.
Use separate publication and receipt files for Dev and Test; receipts are bound
to that project, source revision, and complete image map.

Run from the reviewed repository in the authorized owner Cloud Shell. The
following example targets Dev; finish and inspect Dev before repeating for Test.
The names below are operator-created files, not committed credentials.

```sh
python3 deploy/gcp/activate-dev-test.py dev prepare-database --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev database-job --job-action bootstrap --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev retire-bootstrap --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev database-job --job-action migrate --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev database-job --job-action audit-runtime --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev database-job --job-action audit-reader --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev deploy --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev start --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
python3 deploy/gcp/activate-dev-test.py dev stop --images /tmp/dev-images.json --receipt /tmp/dev-receipt.json
```

Do not blindly retry partial database preparation. Inspect resources and the
receipt first; the script refuses to overwrite existing secrets or database roles.
Preserve sanitized receipts outside `/tmp` after the session. Never save connection
payloads in evidence. A passed `start` proves API readiness, not customer acceptance.

### Persistent effects for activation review

The build-only grants are already separate from these runtime effects. Each
project receives the same scoped changes, with its own identities and resources:

| Resource | Effect |
| --- | --- |
| Existing private Cloud SQL database | Start for setup; create migration, runtime and read-only audit roles; apply existing migrations. |
| Service accounts | Add audit and temporary bootstrap identities. Retire bootstrap access after setup. |
| Five regional secrets | Store three distinct connection URLs, the instance CA and a temporary setup payload. Each permanent principal reads only its own URL and the CA. |
| Native database jobs | Execute bootstrap, migration, privilege audits and drain on the matching private VPC. |
| API service | Deploy IAM-private; grant invocation to its own customer web identity. |
| Customer web service | Make the login shell reachable when the session starts. Customer data still requires Auth0 and Samra admission. |

Inspect live project IDs, database state, secrets, service accounts and services
immediately before applying. Confirm these new access and public-shell effects
with the owner when required by the operator's approval policy. Do not broaden
the already approved build permissions or touch Staging or Production.

## Functional acceptance

Before functional acceptance, use the existing tester CLI to admit exactly two
synthetic identities with bounded expiry. Each tester completes consent. Keep
Auth0 subjects and credentials in private manifests. Account provisioning and
balanced fixture credits must be tested separately before synthetic transfers.
Do not report two-user acceptance from anonymous health checks or mocked tokens.
