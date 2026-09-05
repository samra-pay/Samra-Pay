# Staging migration identity setup

PR #162 supplies the governed migration execution workflow. Its dedicated
Google identity and resource grants need a separate setup and audit before
that workflow can authenticate. `deploy/gcp/staging-migration-foundation.mjs`
provides the executable review/apply/audit path for those prerequisites.
This implementation is not evidence that the live foundation exists.

## Exact scope

The setup uses the existing staging project, migration runtime identity,
private SQL instance, migration secret metadata and artifact repository.
It requires the existing runtime's Cloud SQL role and migration-secret grant;
it cannot create a database user, secret or secret version, change SQL TLS,
enable an API, create a service-account key, or execute a migration/job.

For an otherwise prepared staging project, its maximum change set is:

1. Create the isolated `samra-migrations-staging` pool and
   `samra-pay-migrations-main` provider.
2. Create the exact `samraStagingMigrationController` custom role and keyless
   `samra-github-migrate-staging` controller account.
3. Create a log view restricted to the `samra-staging-migrations` job.
4. Grant the controller its custom project role, image-repository reader,
   use of only the migration runtime identity, and access to that log view.
5. Grant the exact GitHub repository principal access to the controller last.

These are persistent IAM and federation settings. An approval's expiry limits
when setup commands may run; it does not revoke the resulting access.
The migration workflow retains its separate exact-candidate, publication,
numeric-secret, execution-expiry and cleanup requirements. Its controller
cannot read database credentials directly. Its approved job can resolve the
existing migration credential under the migration runtime identity.

The setup imports the workflow's existing permissions and OIDC trust rule,
including stable repository/owner IDs, main ref, manual event, exact workflow
path and named environment. Before approving setup, review the existing
`staging-migrations` GitHub environment and the repository's current
solo-founder release controls. Naming an environment alone does not prove
that GitHub enforces an independent review or branch protection.

## Review and approval

Run from a clean checkout of the full reviewed commit. Use an already
authorized `davidhaile.com` administrator with the staging project selected.
Do not change accounts or expand IAM to bypass an access denial.

```sh
node deploy/gcp/staging-migration-foundation.mjs --plan

SAMRA_GCP_EXPECTED_SHA=FULL_REVIEWED_SHA \
SAMRA_GCP_OPERATOR_ACCOUNT=EXISTING_AUTHORIZED_ADMIN \
node deploy/gcp/staging-migration-foundation.mjs --review
```

`--plan` is offline and contains no claim about live resources. `--review`
reads metadata and prints the exact missing actions and `planSha256`.
It also reports SQL TLS mode and enabled numeric migration-secret versions
as separate database prerequisites. Empty versions or weak TLS do not become
database readiness merely because IAM is ready.

The review lists resources successfully before identifying anything as
absent. A permission error, unavailable API or failed list aborts the review;
it cannot trigger creation. Existing roles, trust mappings, provider audiences,
impersonators, keys and scoped grants must match exactly. Drift requires a
new review, not an automatic repair or removal of another actor's access.

Only after approving the actual action list, SHA and hash:

```sh
SAMRA_GCP_EXPECTED_SHA=FULL_REVIEWED_SHA \
SAMRA_GCP_OPERATOR_ACCOUNT=EXISTING_AUTHORIZED_ADMIN \
SAMRA_MIGRATION_FOUNDATION_APPLY=AUTHORIZED_STAGING_MIGRATION_FOUNDATION \
SAMRA_MIGRATION_FOUNDATION_PLAN_SHA256=REVIEWED_PLAN_SHA256 \
SAMRA_MIGRATION_FOUNDATION_EXPIRES_AT=APPROVED_UTC_EXPIRY \
node deploy/gcp/staging-migration-foundation.mjs --apply
```

Expiry must be in the future and no more than one hour away. The controller
reloads metadata immediately before applying, refuses a changed plan hash,
checks expiry before every mutation, then reloads and validates the complete
foundation. An already exact foundation has no mutations. Each command uses
an argument array and the fixed staging project; it never interpolates a
shell command or prints credential/provider error payloads.

Run a separate `--audit` with the same source and administrator variables
afterward. Retain its output alongside the approved pre-apply plan and the
applied action IDs. It must report no remaining actions. This is IAM evidence,
not successful migration or wallet evidence.

## Failure and rollback boundary

No automatic destructive rollback is performed. If an apply stops partway,
retain the approved plan and command/audit status, inspect the resulting
settings and generate a fresh review before any retry. Never reuse the old
plan approval after its action list or database metadata changes.

For emergency containment, a separately approved operator can disable the
exact provider or remove its exact federation binding after checking active
workflows. Full rollback requires an inventory of which settings this apply
created; preserve pre-existing runtime, database, secret and repository
resources. This tool does not delete resources or remove IAM bindings.

IAM checks cover the named project/resource bindings and exact provider trust.
Organization/folder inherited authority and trusted administrators remain part
of the broader existing governance audit; this tool does not claim to prove
that no administrator can change the foundation concurrently.

## Current release follow-through

On 5 September 2026, PR #162 was verified merged at
`eefac625c83d1708c7f97f063f7b1358f9471a25`. A fresh Cloud Console inventory
attempt was denied for `iam.serviceAccounts.list` and
`resourcemanager.projects.get`. No successful live foundation review, setup,
secret inspection or migration execution was established by that attempt.

PR #164 separately fixes Semgrep's non-root cache/log paths in release
assurance. Its recorded Qase active-run-limit failure is also separate.
The migration workflow still needs a successful release candidate and image
publication for the same final main SHA before it can execute.

After this setup is reviewed and the live access blocker is resolved:

1. Review/audit the actual IAM and database prerequisites.
2. Complete any separately scoped database bootstrap or TLS changes.
3. Obtain the successful release and publication artifacts for the exact SHA.
4. Approve and run one bounded synthetic migration, then retain its evidence.
5. Continue the private API and separately reviewed customer-wallet profile.

Validation uses metadata fixtures and command interception, including denial,
drift, partial apply, expiry and post-audit failures. No fixture establishes
live cloud state.

- [Governed staging migrations](staging-migrations.md)
- [Google workload identity provider commands](https://docs.cloud.google.com/sdk/gcloud/reference/iam/workload-identity-pools/providers)
- [Google log-view IAM bindings](https://docs.cloud.google.com/sdk/gcloud/reference/logging/views/add-iam-policy-binding)
