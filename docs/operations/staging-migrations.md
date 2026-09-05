# Governed staging migrations

The manual `Staging migrations` workflow produces the API deployment's missing
database prerequisite. Implementation does not establish live federation,
database access, a successful cloud migration, or permission to deploy.

## Workflow and evidence

After merge, publish images through the existing release-candidate and staging
image-publication workflows for the same full main SHA. Select the successful
publication run and exact attempt, plus one enabled numeric version of
`samra-staging-migration-database-url`. The default `review` mode performs only
metadata checks and produces no migration artifact.

`migrate` additionally requires `AUTHORIZED_STAGING_MIGRATION` and an absolute
UTC expiry, between 650 seconds and one hour away when the controller starts
execution. Runtime startup independently requires at least 600 seconds left.
Do not dispatch it until the exact SHA/digests, pinned version, prerequisite
audit, incremental cost and cleanup scope have been approved.

The workflow verifies repository IDs, successful upstream workflow/run/attempt,
artifact identity and publication contents before Google authentication. The
controller repeats upstream verification, checks private SQL with enforced TLS,
backups/PITR/deletion protection, exact project IAM, keyless identities, enabled
secret metadata, subnet, restricted log view, and absence of migration/bootstrap
jobs. It never reads a credential payload or changes IAM.

The job runs the exact published `samra-migrations` digest as
`samra-migrations-staging`, one task, parallelism one, zero retries, 600-second
timeout, 1 vCPU and 512 MiB on the existing private VPC. The controller verifies
the created job's image, entrypoint, identity, secret version, limits and network
before execution and checks the job UID and execution count afterward.

`lib/db/staging-migrate.mjs` validates the actual database, migration identity
and encrypted connection. It holds one PostgreSQL advisory lock while checking
the complete existing journal against the ordered source hashes, applying only
the missing suffix with Drizzle, and verifying the complete resulting journal.
It rejects an ahead, altered or non-prefix history before migrating. Replay of
the same completed source reports zero newly applied migrations.

The successful artifact is named
`staging-migration-FULL_SHA-run-RUN_ID-attempt-ATTEMPT` and contains exactly:

- `staging-migration.json`
- `staging-migration.sha256`

It binds the publication hash and image digest, GitHub run, numeric secret
version, exact Cloud Run execution, ordered migration hashes, before/after
history, applied count and confirmed job deletion. It contains no credential,
raw SQL error or customer data. An execution report alone is insufficient:
successful execution and cleanup must precede artifact creation and upload.

The API zero-traffic workflow accepts only this registered producer's successful
same-SHA artifact. It validates its contents against the same publication before
Google authentication and repeats verification in the deployment controller.
A review result, arbitrary JSON `status`, failed run, altered journal, wrong
publication or missing cleanup cannot satisfy the prerequisite. API traffic,
customer wallet activation and the first-revision routing boundary remain
separately gated. This migration lane remains synthetic-only.

## Federation prerequisites — not applied by this change

The executable [migration identity setup](staging-migration-foundation.md)
now provides offline plan, live metadata review, separately authorized apply,
and a post-setup audit. Its implementation does not establish live activation.

Use project `samra-pay-staging` / `934122615631`, organization `614833350075`,
region `us-east4`. The existing foundation must first provide private SQL and
separate migration/runtime database credentials. No credential version is
assumed to exist, and this workflow cannot bootstrap users or secrets.

The separately reviewed federation setup must provide:

| Resource                | Required boundary                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub environment      | `staging-migrations`, protected main-only, manual dispatch, existing solo-founder exact-SHA authorization model                                    |
| WIF pool/provider       | `samra-migrations-staging` / `samra-pay-migrations-main`, GitHub OIDC issuer                                                                       |
| Controller              | `samra-github-migrate-staging@samra-pay-staging.iam.gserviceaccount.com`, no user-managed keys                                                     |
| Runtime                 | Existing `samra-migrations-staging@samra-pay-staging.iam.gserviceaccount.com`, no user-managed keys; only `roles/cloudsql.client` at project scope |
| Controller project role | `projects/samra-pay-staging/roles/samraStagingMigrationController`; exact `MIGRATION_CONTROLLER_PERMISSIONS` exported by the controller            |
| Runtime impersonation   | Controller receives `roles/iam.serviceAccountUser` on the migration runtime account only                                                           |
| Migration credential    | Runtime alone receives `roles/secretmanager.secretAccessor` on `samra-staging-migration-database-url`; controller has metadata access only         |
| Artifact access         | Read-only access to the existing `samra-staging` repository; no image publishing permission                                                        |
| Logs                    | `roles/logging.viewAccessor` on `_Default` / `global` / `samra-staging-migrations`, filtered to this job                                           |

The controller account's `roles/iam.workloadIdentityUser` principal is restricted
to the pool's `attribute.repository_id/1335175962`. The provider condition must
match all of repository `samra-pay/Samra-Pay`, repository ID `1335175962`,
owner ID `320532147`, ref `refs/heads/main`, event `workflow_dispatch`, workflow
`Staging migrations`, exact `.github/workflows/staging-migrations.yml@refs/heads/main`
workflow reference and environment `staging-migrations`. Map the repository ID
claim to the same named attribute. The controller checks the exact condition;
do not reuse another workflow's broader provider or service account.

The log view's exact filter is:

```text
resource.type="cloud_run_job" AND resource.labels.job_name="samra-staging-migrations"
```

Enforced Cloud SQL TLS and the existing client URL are separate checks. This
synthetic lane verifies transport encryption; the older bootstrap URL's
`sslmode=require&uselibpqcompat=true` does not verify server certificates.
Customer activation still needs the reviewed connector or CA/hostname design.

## Bootstrap compatibility and concurrency

The older, separately authorized database-access bootstrap now resolves one
enabled numeric secret version for each job/read and refuses zero or multiple
enabled versions. Its migration step uses the same locked runner under the
fixed bootstrap job name. Bootstrap/finalization/access-audit connections share
the same advisory lock with governed migrations. The workflow also uses the
shared `staging-database-mutation` concurrency group and refuses an existing
bootstrap job. Do not run administrative bootstrap concurrently with release
operations; the lock prevents simultaneous SQL work, not an entire multi-job
administrative session from being interleaved.

The legacy bootstrap retains its existing exact-SHA/manual apply boundary and
does not use the new workflow's expiring authorization. Its report event is
`samra_staging_bootstrap_migration`, which is deliberately rejected as governed
release evidence. Run the protected migration workflow afterward, even if that
run applies zero additional migrations, to obtain the required provenance.

## Failure and cleanup

No automatic DDL retry or destructive rollback is permitted. If execution,
attestation, log retrieval or cleanup is ambiguous, the workflow fails and
does not publish success evidence. It leaves its job for execution-state audit
rather than deleting a possibly running migration. Before retrying, confirm
execution termination, inspect the journal, and authorize cleanup of that exact
orphan job. The next run refuses any existing migration/bootstrap job.

On success, delete only the job created by that invocation and verify absence
before writing the artifact. Preserve the database and migration history.
Cloud job metadata remaining after a failure is not a previous API revision or
a database rollback target. Existing SQL baseline charges remain separate from
this bounded job's incremental compute; no budget or cloud execution was
authorized by implementing this workflow.

## Validation and references

Run `node --test deploy/gcp/staging-migrations.test.mjs` and the existing Google
Cloud suite. The native PostgreSQL access integration test also checks lock
contention between the permanent migration and runtime identities. Local
controller/cloud tests use metadata fixtures; they do not establish live GCP
execution. The existing CI/container suite still validates the migration SQL.

- [Cloud Run job v1 schema](https://docs.cloud.google.com/run/docs/reference/yaml/v1)
- [Cloud Run job runtime variables](https://docs.cloud.google.com/run/docs/container-contract)
- [Private wallet deployment package](staging-wallet-deployment-package.md)
