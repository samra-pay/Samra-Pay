# Google trust cutover review

Status: offline review tooling prepared; live Google inventory, cloud apply and
release resumption remain outstanding. The source authority and account recovery
prerequisites are recorded in [the transfer record](enterprise-transfer-2026-09-05.md).

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
The selected controller must have exactly one unconditional
`roles/iam.workloadIdentityUser` binding to its stable repository-ID principal.
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
