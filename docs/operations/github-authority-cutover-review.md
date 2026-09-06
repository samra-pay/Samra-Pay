# Google trust cutover review

Status: the two existing providers were repaired and independently read back on
September 5, 2026. The keyless production preflight passed on
`eddc1558392eecf0946e2c6e2c74866c947c833b`. On September 6 at 00:48 UTC, staging
promotion and rollback identities were applied and independently audited. Four
planned staging controllers remain absent, and release resumption is outstanding.
See [the dated repair evidence](evidence/2026-09-05-cloud-trust-repair.json) and
[the transfer record](enterprise-transfer-2026-09-05.md).

The approved changes removed the two Firebase project-level Token Creator grants,
updated only the existing providers' repository-owner conditions, and restored the
staging publisher's two missing source-required read permissions. The final role
has the governed 19 permissions. Project bindings did not change during that role
repair. Operator-collected before/after metadata is retained privately outside Git;
it is not the repository's same-process capture or a signed cloud attestation.
The organization deny-policy inventory remains unverified after an access denial.

The Enterprise retention ceiling and inherited repository setting now allow 365
days. [The successful keyless preflight](https://github.com/samra-pay/Samra-Pay/actions/runs/33990597344)
uploaded an artifact expiring September 5, 2027; its downloaded digest and source
SHA were verified. These results establish the existing preflight path, not the
missing staging controllers, provider runtime acceptance, or production readiness.

The same day's metadata inventory found a runnable private Cloud SQL instance in
each project with backups and PITR enabled. It did not prove backup freshness or a
restore drill. Both instances report `ALLOW_UNENCRYPTED_AND_ENCRYPTED`; actual
client transport was not tested and must satisfy the governed TLS boundary before
runtime activation. Staging's bootstrap database secret has enabled version `1`,
but its runtime database secret has no versions. Production's runtime and migration
database secrets also have no versions. Neither project has monitoring alert
policies. No secret payloads or database contents were read.

## September 6 controller preflight

The explicitly approved current-commit package was checksum-verified in Cloud
Shell and reconstructed as a clean, one-commit checkout at `eddc155`. Successful
staging list calls showed ten service accounts, one identity pool, two custom
roles, no Cloud Run services/jobs and no runtime database secret versions.

The zero-traffic apply stopped when Google rejected the 37-character pool display
name. Independent before/after project, registry and runtime IAM policies were
identical; subsequent pool, account and role inventories remained at 1/10/2. The
API-enable request completed for APIs already observed enabled. No controller,
provider, job, deployment or traffic change was established by this attempt.

This change shortens that pool and its provider names and the image-verifier
provider name to satisfy Google's [32-character IAM display-name limit](https://docs.cloud.google.com/iam/docs/reference/rest/v1/projects.locations.workloadIdentityPools.providers).
The regression check covers every shell federation creation command and the
migration pool name. These source fixes require a new exact-SHA live review and
apply; synthetic checks do not establish the resulting cloud state.

Migration review stopped at the migration-secret IAM read. A subsequent
successful secret-resource list confirmed that
`samra-staging-migration-database-url` is absent. No migration foundation was
applied.
The revision-probe review returned a missing service-invoker grant even though
the successful service inventory was empty. Its apply remains deferred until the
private `samra-api` service exists; an empty IAM response does not prove service
existence. The source now requires a successful service describe before any
revision-probe setup mutation, with a regression test for the missing-service
case.

The existing traffic setup completed on `eddc155` at 00:48:48 UTC. A separate
audit passed, and the full project-policy comparison verified only the two
expected custom-role grants for the distinct promotion and rollback identities.
Traffic and workflow states remained unchanged. This establishes their IAM
foundation, not a completed promotion or rollback exercise. Comparing these live
bindings with the cutover auditor exposed its incorrect repository-wide principal
assumption for the shared traffic pool. The source now derives each operation
principal from the validated traffic contract, with rejection tests for swapped,
repository-wide and wildcard grants. See the
[dated controller evidence](evidence/2026-09-06-staging-controller-foundations.json).

## Scope and current inventory

`deploy/gcp/review-github-authority-cutover.mjs` derives eight controller boundaries
from the existing validated source contracts: staging publication, zero-traffic
deployment, image verification, revision probe, migrations, promotion, rollback,
and production foundation preflight. Promotion and rollback share a pool but have
separate providers and service accounts. The catalog is eight providers in seven
pools; it does not assert that those resources exist in Google Cloud. Proposed
preview federation needs its own inventory and approval.

```sh
node deploy/gcp/review-github-authority-cutover.mjs catalog
```

The tool has no apply, bootstrap, IAM-grant, secret-access or workflow-enable mode.
An absent provider is a blocker requiring a separate bootstrap decision. A failed
metadata read is not proof that a resource is absent. Do not widen access to make
an inventory pass.

## Capture and review one existing boundary

Use a clean checkout at the exact current main commit, the already-authorized
human operator's active Google account and an authenticated GitHub session. The
tool requires installed `gcloud` and `gh` CLIs. It refuses impersonation and any
unrecognized operator identity. The machine being locked or an unavailable CLI
is an access blocker; do not work around it with another identity.

For example, replace the placeholders with the reviewed values before running:

```sh
node deploy/gcp/review-github-authority-cutover.mjs capture \
  staging-publication <current-main-SHA> <authorized-operator-email> \
  <existing-private-directory-outside-repository>/publication-before.json
node deploy/gcp/review-github-authority-cutover.mjs review \
  <existing-private-directory-outside-repository>/publication-before.json
```

Capture reads project and service-account IAM policies, pool/provider metadata,
user-managed key metadata, repository identity, current main and the nine frozen
workflow states. It never reads secret payloads or private keys. Raw snapshots may
contain internal principals: retain them outside Git, do not attach them to a
public issue or ordinary CI artifact, and apply the approved retention/access
policy. New files use mode `0600` and cannot overwrite an existing file.

The fifteen-minute freshness window begins when capture starts. Every reviewed
snapshot must show the current private repository, stable repository and current
owner IDs, exact main SHA, clean checkout, active project/pool/controllers, no
user-managed controller keys and all nine workflows `disabled_manually`.

For every observed provider in the selected pool, the tool requires the exact
former or exact target condition from source, the governed issuer and mapping,
no custom audience or uploaded issuer key, and no unexpected or duplicate provider.
The selected controller's entire direct IAM policy must contain only one
unconditional `roles/iam.workloadIdentityUser` binding to its governed principal.
Dedicated pools use the stable repository-ID principal. The shared traffic pool
requires the distinct promotion or rollback environment principal from its
validated contract; the other operation's principal and a repository-wide grant
are rejected. Additional direct grants fail review, including custom roles.

Project-level Service Account Token Creator, Service Account OpenID Connect
Identity Token Creator, Workload Identity User and Service Account User grants
also fail review because controllers inherit them. Conditional grants are not
exempted: this tool does not evaluate CEL or establish effective access. Inspect
dependencies and resolve these grants through a separately authorized IAM review
before proposing a condition update. Malformed IAM bindings also fail review.

This is a bounded check for known access paths, not a complete role-permission or
effective-access analyzer. Custom project roles, basic/admin roles, service-agent
roles and organization/folder inheritance still require independent inspection.
Missing, broadened, wildcard or dual-owner trust fails review.

## Bounded approval and independent read-back

A review result contains the before/target conditions, snapshot hash, expiry and
an argument array proposing only one provider's attribute-condition update. It
always reports `cloudApplyAuthorized: false` and
`releaseResumptionAuthorized: false`. Do not execute that proposal without a
separate approval covering the exact project, provider, service account, main SHA,
operator, before/after condition, snapshot hash and expiry. The reviewed API is
[Google's `providers update-oidc` command](https://docs.cloud.google.com/sdk/gcloud/reference/iam/workload-identity-pools/providers/update-oidc).

After an authorized condition update, capture the same boundary to a new file,
then compare both fresh snapshots:

```sh
node deploy/gcp/review-github-authority-cutover.mjs verify \
  <private-directory>/publication-before.json \
  <private-directory>/publication-after.json
```

The comparison permits only the selected provider's condition to change. It
rejects changed IAM policies, sibling provider conditions, mapping, audience,
issuer, controller or project metadata. Conservative differences such as policy
ordering or server metadata also stop the comparison for review; do not discard
them to manufacture a pass. Expired evidence requires a fresh capture and review.

The snapshot hashes prove input identity, not authenticity. The result explicitly
is **not a signed cloud attestation**, a complete least-privilege IAM audit, or
release approval. Independently inspect inherited IAM, organization policy,
service-account role scope and all applicable pools before accepting the cutover.
A target condition already present produces no update proposal.

## Resume dependencies

Keep the nine release/sync workflows paused until every applicable Google
boundary is independently verified, app access and evidence retention are
resolved, and bounded release resumption is approved. Do not change the migration
contract's blocked status based on a catalog or a synthetic snapshot.

The subsequent staging sequence stays:

release candidate → image publication → migration producer artifact → zero-traffic
deployment → image verification → revision probe → combined verification record
→ separately authorized promotion or rollback.

See [staging release controls](staging-release-control-plane.md) and
[operational closure requirements](operational-closure-plan.md). Each stage must
consume evidence for the exact authorized SHA, digest and secret versions; a
previous successful run does not transfer authority to another candidate.
