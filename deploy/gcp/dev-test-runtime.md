# Dev/Test follow-on release runbook

Owner: David Haile. Authorized 2026-09-09 for the two existing shared
environments within the combined $50/month planning allowance. Budget alerts
are not a hard spending cap.

This runbook covers promotion of a new, already reviewed release into the
initialized Dev and Test environments. It does not prove that a release was
built, deployed, accepted, or sealed. Each claim requires its corresponding
publication, controller receipt, live readback, and human acceptance evidence.

## Scope and fixed boundaries

- Targets are only `samra-pay-dev` and `samra-pay-test` in `us-east4`.
- All data, balances, funding, wallets, payouts, and transfers are synthetic.
- Identity, wallet, funding, and payout providers remain `fake`.
- Internal operations remain disabled.
- This flow does not configure or activate Crossmint or any other real
  provider. It does not create provider customers, wallets, webhooks, or
  credentials.
- This flow does not touch Staging or Production, publish public production
  traffic, or authorize customer use.
- Dev must be accepted and sealed before the same source and image digests can
  be prepared in Test.

The existing first-time `prepare-database`, `bootstrap`, and
`retire-bootstrap` actions are not part of a follow-on release. Both Dev and
Test are initialized. Do not rerun first-time setup against them.

## Fixed runtime boundary

Cloud SQL remains private-IP only, with public IP disabled. Native database
jobs use the matching Direct VPC network and subnet, private-ranges-only
egress, one task, no retries, and a 10-minute timeout. Connections mount the
instance CA from an exact numbered Secret Manager version and use
`sslmode=verify-ca`. Never weaken TLS or store connection payloads in evidence.

Permanent database principals remain separate:

- `samra_migrations_<environment>` applies migrations and finalizes grants.
- `samra_runtime_<environment>` has the reviewed runtime DML boundary without
  DELETE or DDL.
- `samra_audit_<environment>` is read-only and runs the reader audit and drain.

The retired bootstrap database principal stays deleted, its service account
stays disabled, and its secret version stays disabled with no direct accessor.
Preparation verifies its historical database retirement through the pinned
predecessor evidence and reads the service-account, secret-version, and IAM
state live. Cloud SQL cannot list database users while the instance is stopped.
After the authorized SQL start, each normal candidate migration or privilege
audit therefore verifies the bootstrap database principal is absent before
deploying or executing its job. The controller never reads secret values.

The customer web service is the public login shell. Customer API data still
requires Auth0 and Samra admission. The API retains Cloud Run IAM enforcement,
and only the matching customer web service account receives direct invocation.
Both services use manual scaling at zero outside a test session. During a
session, the API keeps CPU allocated at one instance so the synthetic worker
can finish asynchronous work.

## Release inputs and trust chain

Build the exact reviewed and merged release-candidate commit once in Dev. Do
not submit a second Test build: two builds of the same source are not guaranteed
to produce the same manifest digests, while Test preparation requires the
exact Dev digest suffix for every image. After Dev is accepted and sealed,
copy its three digest-pinned images into the immutable Test repository without
rebuilding them.

Keep separate publication and receipt files for Dev and Test. A publication
has only one 40-character `sourceSha` and three fully qualified, digest-pinned
image references under `images`: `api`, `customer-web`, and `migrations`.
Neither a successful Cloud Build nor a full-SHA tag is a controller input.
Resolve and retain the registry digests first.

### Exact Dev image publication

Start in an authenticated owner Cloud Shell with the repository checked out.
Choose a SHA already merged into GitHub `main` and a successful, exact-attempt
`Immutable release candidate` workflow. Download that run's version 2 artifact
as described in
[release-candidate-evidence.md](../../docs/testing/release-candidate-evidence.md).
Set the following to the real values and to a durable, owner-only evidence
directory, not `/tmp`:

```sh
export SAMRA_RELEASE_SHA='<full lowercase 40-character main commit SHA>'
export SAMRA_RC_RUN_ID='<successful workflow run ID>'
export SAMRA_RC_RUN_ATTEMPT='<successful workflow run attempt>'
export SAMRA_RC_EVIDENCE_ROOT='/path/to/extracted-release-candidate-artifact'
export SAMRA_PUBLICATION_EVIDENCE='/path/to/durable/dev-test-publication-evidence'
export SAMRA_OPERATOR_ACCOUNT='me@davidhaile.com'
set -euo pipefail
umask 077
mkdir -p "$SAMRA_PUBLICATION_EVIDENCE"
```

Fetch `main`, prove ancestry, obtain the exact-attempt run metadata, and run the
checked-in evidence verifier. A GitHub Actions success badge alone is not this
gate.

```sh
git fetch --no-tags origin main
test "$(git rev-parse "$SAMRA_RELEASE_SHA")" = "$SAMRA_RELEASE_SHA"
git merge-base --is-ancestor "$SAMRA_RELEASE_SHA" refs/remotes/origin/main
gh api \
  "repos/samra-pay/Samra-Pay/actions/runs/$SAMRA_RC_RUN_ID/attempts/$SAMRA_RC_RUN_ATTEMPT" \
  > "$SAMRA_PUBLICATION_EVIDENCE/release-candidate-run.json"
node deploy/gcp/verify-release-candidate-evidence.mjs \
  --evidence-root "$SAMRA_RC_EVIDENCE_ROOT" \
  --candidate-sha "$SAMRA_RELEASE_SHA" \
  --release-run-id "$SAMRA_RC_RUN_ID" \
  --release-run-attempt "$SAMRA_RC_RUN_ATTEMPT" \
  --run-metadata "$SAMRA_PUBLICATION_EVIDENCE/release-candidate-run.json" \
  --output "$SAMRA_PUBLICATION_EVIDENCE/verified-release-candidate.json"
```

Create a clean detached worktree for that commit. This prevents uncommitted or
later local files from entering the build. The verified artifact's Git tree
must be the same tree that will be submitted.

```sh
SAMRA_PUBLICATION_WORK="$(mktemp -d)"
SAMRA_RELEASE_SOURCE="$SAMRA_PUBLICATION_WORK/source"
git worktree add --detach "$SAMRA_RELEASE_SOURCE" "$SAMRA_RELEASE_SHA"
test -z "$(git -C "$SAMRA_RELEASE_SOURCE" status --porcelain)"
test "$(git -C "$SAMRA_RELEASE_SOURCE" rev-parse HEAD)" = "$SAMRA_RELEASE_SHA"
test "$(git -C "$SAMRA_RELEASE_SOURCE" rev-parse "$SAMRA_RELEASE_SHA^{tree}")" = \
  "$(jq -r '.gitTreeSha' "$SAMRA_PUBLICATION_EVIDENCE/verified-release-candidate.json")"
```

Before the only build submission, verify the caller, immutable repository,
keyless dedicated build identity, and absence of all three candidate tags.
Also compare the build identity's current source-bucket, repository, and
project bindings with the exact `objectViewer`, `artifactregistry.writer`, and
`logging.logWriter` grants in the committed build-IAM evidence. Do not run
`configure-dev-test-build-iam.sh` during a release; it is an apply script, and
any IAM difference requires separate review.

```sh
test "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" = \
  "$SAMRA_OPERATOR_ACCOUNT"
gcloud projects describe samra-pay-dev --format=json | jq -e '
  .projectId == "samra-pay-dev" and
  (.projectNumber | tostring) == "829811168658" and
  .lifecycleState == "ACTIVE" and .parent.type == "organization" and
  (.parent.id | tostring) == "993968777863"'
gcloud artifacts repositories describe samra-dev \
  --project=samra-pay-dev --location=us-east4 --format=json |
  jq -e '.format == "DOCKER" and .dockerConfig.immutableTags == true'
test -z "$(gcloud iam service-accounts keys list \
  --iam-account=samra-build-dev@samra-pay-dev.iam.gserviceaccount.com \
  --managed-by=user --format='value(name)')"
SAMRA_BUILD_MEMBER='serviceAccount:samra-build-dev@samra-pay-dev.iam.gserviceaccount.com'
gcloud storage buckets get-iam-policy gs://samra-pay-dev_cloudbuild \
  --format=json | jq -e --arg member "$SAMRA_BUILD_MEMBER" \
  --arg role roles/storage.objectViewer '
  [.bindings[]? |
   select((.members // []) | index($member)) |
   {role, condition: (.condition // null)}] ==
  [{role: $role, condition: null}]'
gcloud artifacts repositories get-iam-policy samra-dev \
  --project=samra-pay-dev --location=us-east4 --format=json |
  jq -e --arg member "$SAMRA_BUILD_MEMBER" \
  --arg role roles/artifactregistry.writer '
  [.bindings[]? |
   select((.members // []) | index($member)) |
   {role, condition: (.condition // null)}] ==
  [{role: $role, condition: null}]'
gcloud projects get-iam-policy samra-pay-dev --format=json |
  jq -e --arg member "$SAMRA_BUILD_MEMBER" \
  --arg role roles/logging.logWriter '
  [.bindings[]? |
   select((.members // []) | index($member)) |
   {role, condition: (.condition // null)}] ==
  [{role: $role, condition: null}]'
for SAMRA_IMAGE_NAME in samra-api samra-customer-web samra-migrations; do
  test -z "$(gcloud artifacts docker tags list \
    "us-east4-docker.pkg.dev/samra-pay-dev/samra-dev/$SAMRA_IMAGE_NAME" \
    --project=samra-pay-dev --filter="tag:$SAMRA_RELEASE_SHA" \
    --format='value(tag)')"
done
```

Submit the clean worktree with the checked-in Dev/Test build definition, exact
source substitution, dedicated Dev build service account, explicit region,
explicit ignore file, and Dev source bucket. This publishes images only; it
does not migrate, deploy, open an endpoint, or start SQL.

```sh
SAMRA_DEV_BUILD_ID="$(gcloud builds submit \
  --project=samra-pay-dev \
  --region=us-east4 \
  --service-account=projects/samra-pay-dev/serviceAccounts/samra-build-dev@samra-pay-dev.iam.gserviceaccount.com \
  --config="$SAMRA_RELEASE_SOURCE/deploy/gcp/cloudbuild.dev-test.yaml" \
  --ignore-file="$SAMRA_RELEASE_SOURCE/.gcloudignore" \
  --gcs-source-staging-dir=gs://samra-pay-dev_cloudbuild/source \
  --substitutions="_SOURCE_SHA=$SAMRA_RELEASE_SHA" \
  --format='value(id)' \
  "$SAMRA_RELEASE_SOURCE")"
test -n "$SAMRA_DEV_BUILD_ID"
gcloud builds describe "$SAMRA_DEV_BUILD_ID" \
  --project=samra-pay-dev --region=us-east4 --format=json \
  > "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build.json"
jq -e --arg sha "$SAMRA_RELEASE_SHA" \
  --arg serviceAccount \
    'projects/samra-pay-dev/serviceAccounts/samra-build-dev@samra-pay-dev.iam.gserviceaccount.com' \
  '.status == "SUCCESS" and .substitutions._SOURCE_SHA == $sha and
   .serviceAccount == $serviceAccount and
   (.source.storageSource.bucket | type == "string") and
   (.source.storageSource.object | type == "string") and
   (.source.storageSource.generation | tostring | test("^[0-9]+$"))' \
  "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build.json"
```

Retain the exact, generation-pinned Cloud Build source object and its hash.
Failure to read it back is a provenance failure, even if the build succeeded.

```sh
SAMRA_SOURCE_BUCKET="$(jq -r '.source.storageSource.bucket' \
  "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build.json")"
SAMRA_SOURCE_OBJECT="$(jq -r '.source.storageSource.object' \
  "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build.json")"
SAMRA_SOURCE_GENERATION="$(jq -r '.source.storageSource.generation' \
  "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build.json")"
gcloud storage cp \
  "gs://$SAMRA_SOURCE_BUCKET/$SAMRA_SOURCE_OBJECT#$SAMRA_SOURCE_GENERATION" \
  "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build-source.tgz"
sha256sum "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build-source.tgz" \
  > "$SAMRA_PUBLICATION_EVIDENCE/dev-cloud-build-source.sha256"
```

Resolve the three immutable Dev digests from Artifact Registry and create the
minimal controller input. The prefix checks prevent a digest from another
project, repository, or image name from entering the file.

```sh
resolve_dev_digest() {
  SAMRA_IMAGE_NAME="$1"
  SAMRA_TAG="us-east4-docker.pkg.dev/samra-pay-dev/samra-dev/$SAMRA_IMAGE_NAME:$SAMRA_RELEASE_SHA"
  SAMRA_DIGEST="$(gcloud artifacts docker images describe "$SAMRA_TAG" \
    --project=samra-pay-dev --format=json | jq -er \
    '(.image_summary // .imageSummary // .) |
     (.fully_qualified_digest // .fullyQualifiedDigest)')"
  printf '%s\n' "$SAMRA_DIGEST" | grep -Eq \
    "^us-east4-docker[.]pkg[.]dev/samra-pay-dev/samra-dev/$SAMRA_IMAGE_NAME@sha256:[a-f0-9]{64}$"
  printf '%s\n' "$SAMRA_DIGEST"
}
SAMRA_DEV_API="$(resolve_dev_digest samra-api)"
SAMRA_DEV_WEB="$(resolve_dev_digest samra-customer-web)"
SAMRA_DEV_MIGRATIONS="$(resolve_dev_digest samra-migrations)"
jq -n --arg sourceSha "$SAMRA_RELEASE_SHA" \
  --arg api "$SAMRA_DEV_API" \
  --arg customerWeb "$SAMRA_DEV_WEB" \
  --arg migrations "$SAMRA_DEV_MIGRATIONS" \
  '{sourceSha: $sourceSha, images: {
     api: $api, "customer-web": $customerWeb, migrations: $migrations}}' \
  > "$SAMRA_PUBLICATION_EVIDENCE/dev-images.json"
jq -e '
  (keys | sort) == ["images", "sourceSha"] and
  (.sourceSha | test("^[a-f0-9]{40}$")) and
  (.images | keys | sort) == ["api", "customer-web", "migrations"] and
  ([.images[] | test("@sha256:[a-f0-9]{64}$")] | all)
' "$SAMRA_PUBLICATION_EVIDENCE/dev-images.json"
sha256sum "$SAMRA_PUBLICATION_EVIDENCE/dev-images.json" \
  > "$SAMRA_PUBLICATION_EVIDENCE/dev-images.sha256"
```

Use that retained `dev-images.json` as the `--images` input below. Preserve the
release-candidate verification, build ID/record, generation-pinned source
archive/hash, three digest readbacks, publication JSON/hash, and Cloud Build
logs. A failed or partial build is not promotable. Because the repository uses
immutable tags, do not retry the same SHA, delete a tag, or overwrite evidence;
preserve the failed build and use a separately reviewed recovery decision.

Every follow-on candidate also starts from the prior source-bound receipt for
that environment. `prepare-release` requires a new receipt path and proves the
prior receipt through one of these trust anchors:

1. **One-time baseline transition.** For the first release managed by this
   state machine, pass `--use-committed-baseline-evidence`. The controller
   checks the configured evidence path, SHA-256, and provenance commit in
   `dev-test-environments.json`; requires the working-tree bytes to match the
   bytes at that commit; and binds the supplied prior receipt to the documented
   source, images, secret versions, revisions, successful jobs, final stop, and
   paused readback. This flag is for the one-time bridge from the existing
   deployment evidence, not the normal path for later releases.
2. **Subsequent releases.** Pass `--prior-receipt-sha256` with the SHA-256 that
   was retained independently when the prior receipt was sealed. Do not
   calculate the expected hash from the same local file during validation; that
   does not establish an independent trust anchor.

The supplied prior receipt and new receipt must be different files. Preserve
all receipts outside `/tmp` after the operation. Files shown below under
`/tmp` are only working copies and must never contain credentials.

The controller takes one non-blocking, environment-scoped lock for the entire
command. A second Dev command cannot run concurrently with another Dev command,
even if it names a different receipt; Test has its own lock. This is a local
operator-host lock, not a distributed cloud lock. Use one owner Cloud Shell per
environment and never run a second host against it. Receipt updates use an
atomic, owner-readable-only file replacement. Do not bypass the lock or edit a
receipt while an action is in progress.

### First managed Dev candidate

Use the one-time committed baseline bridge only if no independently retained
hash exists for the current Dev receipt:

```sh
python3 deploy/gcp/activate-dev-test.py dev prepare-release \
  --images /tmp/dev-images.json \
  --prior-receipt /path/to/current-dev-runtime-receipt.json \
  --use-committed-baseline-evidence \
  --receipt /tmp/dev-candidate-receipt.json
```

For every later Dev candidate, use the independently retained prior seal hash:

```sh
python3 deploy/gcp/activate-dev-test.py dev prepare-release \
  --images /tmp/dev-images.json \
  --prior-receipt /path/to/prior-sealed-dev-receipt.json \
  --prior-receipt-sha256 "$SAMRA_DEV_PRIOR_RECEIPT_SHA256" \
  --receipt /tmp/dev-candidate-receipt.json
```

`prepare-release` is a read-and-verify preflight. It requires an ACTIVE project
with the configured project number and direct organization parent, no active
Cloud Run job or Cloud SQL operation, a stopped database with activation
`NEVER`, enabled numbered permanent secrets, pinned historical bootstrap
database retirement and live disabled bootstrap identity/secret access, and
both exact predecessor revisions reconciled, ready, untagged,
receiving 100% of traffic, and manually scaled to zero. It creates no cloud
resources and neither starts SQL nor queries its user list.

## Effective IAM gate

Preparation first verifies the exact direct secret accessor bindings and the
direct API invoker binding. It then builds a conservative allow-policy union
for each protected permission from the resource, project, and organization
policies. The project must be a direct child of the configured organization, so
an unexpected folder or organization change stops the release.

The protected permissions are:

- `secretmanager.versions.access` on the runtime, migration, audit, CA, and
  retired bootstrap secrets;
- `run.routes.invoke` on the private API service.

The controller resolves each predefined, project-custom, or
organization-custom role, records a hash of its canonical permission set, and
permits only the required service accounts plus the explicitly configured
administrative user principals. For a binding that grants a protected
permission, it rejects conditions, unexpected users or service accounts,
groups, domains, public principals, and dynamic principal sets. A required
runtime principal must also be present.

This is deliberately conservative, but it is not a complete IAM authorization
simulator. It does not expand groups or interpret conditions; it rejects them.
Deny policies and principal access boundaries can only reduce the access found
by this allow-policy union, so readiness and functional tests remain necessary
to prove access works. Any hierarchy or policy model outside these assumptions
requires independent review.

The complete IAM boundary and role-definition hashes are stored in the
candidate receipt. The controller requires an exact match again before the
normal migration and audit jobs, deployment, session start, acceptance record,
and seal, and also after deployment. The stop-owned drain and a rollback
recovery drain prioritize safe ingress closure and recovery; seal performs the
final IAM readback. An IAM change blocks normal forward progress even when the
direct resource binding still looks correct.

## Enforced candidate sequence

The receipt event history binds every action to the candidate migration image,
ordered timestamps, result, and, for database jobs, a unique Cloud Run
execution. Normal candidate actions cannot be replayed or run out of order.
Each passed `migrate`, `audit-runtime`, and `audit-reader` event also contains
the exact project, instance, retired principal, positive absence result, and
timestamp of its live bootstrap database check. The check must fall within
that job attempt. Missing, malformed, cross-environment, or non-passing evidence
blocks subsequent deployment, session start, acceptance, and sealing.
If an earlier controller already recorded passed candidate jobs without this
evidence, close or recover that candidate with its original pinned controller
before adopting this contract. Never retrofit a receipt or invent a missing
live check. Legacy predecessor receipts still use their pinned baseline bridge.

The live check runs after SQL becomes `RUNNABLE` and before job deployment or
execution. Its sanitized result is saved with the attempt before work starts;
the full user list is never retained. A failed listing or an existing bootstrap
principal records a failed action requiring recovery and leaves SQL running.
Stop-owned and recovery drains remain available without this check so an
unavailable user-list API cannot prevent safe shutdown.

| Order | Controller action | Resulting phase | Required result |
| ---: | --- | --- | --- |
| 1 | `prepare-release` | `prepared-paused` | Prior release, paused state, trust anchor, and IAM verified |
| 2 | `database-job --job-action migrate` | `migrated` | Exact candidate migration image succeeds |
| 3 | `database-job --job-action audit-runtime` | `runtime-audited` | Runtime principal privilege audit succeeds |
| 4 | `database-job --job-action audit-reader` | `reader-audited` | Read-only principal audit succeeds |
| 5 | `deploy` | `deployed-paused` | Exact candidate revisions are stable and manually scaled to zero |
| 6 | `start` | `session-open` | Database, exact API readiness, and public login shell checks pass |
| 7 | `record-acceptance` | `session-open` | Exact two-user synthetic evidence is hash-bound to the release |
| 8 | `drain` via `stop` | `session-open` | Bound read-only drain succeeds after web ingress closes |
| 9 | `stop` | `stopped-tested` | API closes and SQL stops only after the drain passes |
| 10 | `seal` | `sealed` | Terminal state and the full ordered evidence chain pass readback |

If `stop` succeeds before acceptance was recorded, the controller derives
`stopped-unaccepted`, not `stopped-tested`. That is an abort state: it cannot be
sealed and must be rolled back before another candidate is prepared.

Run the candidate actions from the reviewed repository in the authorized owner
Cloud Shell:

```sh
python3 deploy/gcp/activate-dev-test.py dev database-job \
  --job-action migrate --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
python3 deploy/gcp/activate-dev-test.py dev database-job \
  --job-action audit-runtime --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
python3 deploy/gcp/activate-dev-test.py dev database-job \
  --job-action audit-reader --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
python3 deploy/gcp/activate-dev-test.py dev deploy \
  --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
python3 deploy/gcp/activate-dev-test.py dev start \
  --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
python3 deploy/gcp/activate-dev-test.py dev record-acceptance \
  --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json \
  --acceptance-evidence /path/to/dev-acceptance.json \
  --acceptance-evidence-sha256 "$SAMRA_DEV_ACCEPTANCE_EVIDENCE_SHA256"
python3 deploy/gcp/activate-dev-test.py dev stop \
  --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
python3 deploy/gcp/activate-dev-test.py dev seal \
  --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
```

Do not run `database-job --job-action drain` separately. `stop` closes the web
service, waits for in-flight requests, invokes the bound drain action, and only
then scales the API to zero and changes database activation to `NEVER`.

`start` first keeps the web shell closed, starts SQL, starts the API, and
requires `/api/readyz` to identify the exact recorded Cloud Run revision. It
opens the web shell only after that succeeds and then requires anonymous
`/login` to return HTML. These probes establish readiness, not customer
acceptance.

## Functional acceptance evidence

Admit exactly two bounded synthetic testers. Both must complete the applicable
Auth0 login and Samra consent flow. Test account provisioning, fake wallet
provisioning, controlled synthetic fixture funding, a synthetic transfer, and
persistent readback separately. A health check, Auth0 redirect, mock token, or
single-user path is not two-user acceptance.

The acceptance file is sanitized evidence, not a tester manifest. Keep names,
email addresses, Auth0 subjects, passwords, tokens, credentials, connection
strings, and secret values out of it. Keep any private tester manifest in the
approved private system, separate from the controller receipt.

Use this exact schema, replacing every bracketed value with the value from the
candidate publication, deployed-service receipt, or observation:

```json
{
  "schemaVersion": 1,
  "environment": "dev",
  "project": "samra-pay-dev",
  "sourceSha": "<exact 40-hex candidate source SHA>",
  "status": "passed",
  "syntheticOnly": true,
  "productionChanges": false,
  "testerCount": 2,
  "imageDigests": {
    "api": "sha256:<exact 64-hex API digest>",
    "customer-web": "sha256:<exact 64-hex web digest>",
    "migrations": "sha256:<exact 64-hex migration digest>"
  },
  "revisions": {
    "api": "<exact ready API revision>",
    "customer-web": "<exact ready web revision>"
  },
  "checks": {
    "auth0LoginCompleted": true,
    "twoSyntheticUsersAdmitted": true,
    "consentCompleted": true,
    "walletProvisioningCompleted": true,
    "fixtureFundingCompleted": true,
    "syntheticTransferCompleted": true,
    "persistenceReadbackCompleted": true
  },
  "observedAt": "<ISO-8601 timestamp with timezone>"
}
```

Before calling `record-acceptance`, retain the exact evidence bytes and their
SHA-256 independently. The controller requires exactly the fields shown above
and rejects any extra or missing field, different environment, project, source,
digest set, revision set, tester count, check set, non-passing check,
non-synthetic scope, Production change, or malformed timestamp. A rejected
evidence file creates no passing acceptance event. The candidate cannot be
sealed without the acceptance event.

## Seal and evidence retention

`seal` requires all ordered actions to have passed, the final stop session and
drain to have passed, both exact candidate services to remain reconciled and
manually scaled to zero, SQL to be `STOPPED` with activation `NEVER`, no active
Cloud Run job or SQL operation, and the IAM boundary to remain unchanged.

The action writes the final formatted receipt and prints `receiptSha256`, the
SHA-256 of those exact file bytes. Immediately preserve:

- the exact sealed receipt bytes in the approved durable evidence location;
- the printed hash in a separate, independently controlled record;
- the source-bound publication and sanitized acceptance evidence with their
  independently retained hashes.

Do not edit or reformat a sealed receipt. Any byte change invalidates its hash.
Use the retained receipt and independent hash as the predecessor trust anchor
for the next release.

## Dev-to-Test promotion

Test preparation is blocked until Dev has reached `sealed`. The Test
publication must carry the same `sourceSha` and the same digest value for each
of `api`, `customer-web`, and `migrations`. Repository paths differ because the
images live in the Test registry; the digest suffixes must be identical.

After retaining the exact sealed Dev receipt and its independently stored
hash, copy the three Dev digest references recorded above. Use only an already
approved, checksum-verified `gcrane` executable; this repository does not
install or approve that external tool. Record its version. If it is missing,
unreviewed, or cannot authenticate for Dev read and Test write, stop rather
than installing an unpinned binary during the release.

First verify the Test repository and candidate tags. All three tags must be
absent for a new promotion. An existing tag after a partial copy is a hard
stop: preserve the partial-copy evidence and obtain a separately reviewed
recovery decision. Do not delete or overwrite an immutable tag.

```sh
command -v gcrane
gcrane version > "$SAMRA_PUBLICATION_EVIDENCE/gcrane-version.txt"
test "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" = \
  "$SAMRA_OPERATOR_ACCOUNT"
gcloud projects describe samra-pay-test --format=json | jq -e '
  .projectId == "samra-pay-test" and
  (.projectNumber | tostring) == "378050809796" and
  .lifecycleState == "ACTIVE" and .parent.type == "organization" and
  (.parent.id | tostring) == "993968777863"'
gcloud artifacts repositories describe samra-test \
  --project=samra-pay-test --location=us-east4 --format=json |
  jq -e '.format == "DOCKER" and .dockerConfig.immutableTags == true'
for SAMRA_IMAGE_NAME in samra-api samra-customer-web samra-migrations; do
  test -z "$(gcloud artifacts docker tags list \
    "us-east4-docker.pkg.dev/samra-pay-test/samra-test/$SAMRA_IMAGE_NAME" \
    --project=samra-pay-test --filter="tag:$SAMRA_RELEASE_SHA" \
    --format='value(tag)')"
done
gcrane cp "$SAMRA_DEV_API" \
  "us-east4-docker.pkg.dev/samra-pay-test/samra-test/samra-api:$SAMRA_RELEASE_SHA"
gcrane cp "$SAMRA_DEV_WEB" \
  "us-east4-docker.pkg.dev/samra-pay-test/samra-test/samra-customer-web:$SAMRA_RELEASE_SHA"
gcrane cp "$SAMRA_DEV_MIGRATIONS" \
  "us-east4-docker.pkg.dev/samra-pay-test/samra-test/samra-migrations:$SAMRA_RELEASE_SHA"
```

Read the Test registry back independently, require exact digest equality, and
only then write the Test controller input. Do not derive Test references by
string replacement without this registry readback.

```sh
resolve_test_digest() {
  SAMRA_IMAGE_NAME="$1"
  SAMRA_TAG="us-east4-docker.pkg.dev/samra-pay-test/samra-test/$SAMRA_IMAGE_NAME:$SAMRA_RELEASE_SHA"
  SAMRA_DIGEST="$(gcloud artifacts docker images describe "$SAMRA_TAG" \
    --project=samra-pay-test --format=json | jq -er \
    '(.image_summary // .imageSummary // .) |
     (.fully_qualified_digest // .fullyQualifiedDigest)')"
  printf '%s\n' "$SAMRA_DIGEST" | grep -Eq \
    "^us-east4-docker[.]pkg[.]dev/samra-pay-test/samra-test/$SAMRA_IMAGE_NAME@sha256:[a-f0-9]{64}$"
  printf '%s\n' "$SAMRA_DIGEST"
}
SAMRA_TEST_API="$(resolve_test_digest samra-api)"
SAMRA_TEST_WEB="$(resolve_test_digest samra-customer-web)"
SAMRA_TEST_MIGRATIONS="$(resolve_test_digest samra-migrations)"
test "${SAMRA_TEST_API##*@}" = "${SAMRA_DEV_API##*@}"
test "${SAMRA_TEST_WEB##*@}" = "${SAMRA_DEV_WEB##*@}"
test "${SAMRA_TEST_MIGRATIONS##*@}" = "${SAMRA_DEV_MIGRATIONS##*@}"
jq -n --arg sourceSha "$SAMRA_RELEASE_SHA" \
  --arg api "$SAMRA_TEST_API" \
  --arg customerWeb "$SAMRA_TEST_WEB" \
  --arg migrations "$SAMRA_TEST_MIGRATIONS" \
  '{sourceSha: $sourceSha, images: {
     api: $api, "customer-web": $customerWeb, migrations: $migrations}}' \
  > "$SAMRA_PUBLICATION_EVIDENCE/test-images.json"
jq -e --arg sourceSha "$SAMRA_RELEASE_SHA" \
  --arg api "$SAMRA_TEST_API" \
  --arg customerWeb "$SAMRA_TEST_WEB" \
  --arg migrations "$SAMRA_TEST_MIGRATIONS" \
  '.sourceSha == $sourceSha and .images == {
    api: $api, "customer-web": $customerWeb, migrations: $migrations}' \
  "$SAMRA_PUBLICATION_EVIDENCE/test-images.json"
sha256sum "$SAMRA_PUBLICATION_EVIDENCE/test-images.json" \
  > "$SAMRA_PUBLICATION_EVIDENCE/test-images.sha256"
```

Preserve the `gcrane` version record, copy output, three independent Test
readbacks, and Test publication JSON/hash. A partial copy changes no runtime.
Preserve its evidence; on recovery, verify any existing immutable Test tag
against the sealed Dev digest and copy only the missing digest. Never rebuild
the Test candidate.

For the first state-machine-managed Test candidate, use the Test committed
baseline bridge and the independently retained sealed Dev receipt hash:

```sh
python3 deploy/gcp/activate-dev-test.py test prepare-release \
  --images /tmp/test-images.json \
  --prior-receipt /path/to/current-test-runtime-receipt.json \
  --use-committed-baseline-evidence \
  --dev-sealed-receipt /path/to/sealed-dev-candidate-receipt.json \
  --dev-sealed-receipt-sha256 "$SAMRA_DEV_SEALED_RECEIPT_SHA256" \
  --receipt /tmp/test-candidate-receipt.json
```

On later releases, replace `--use-committed-baseline-evidence` with the
independently retained `--prior-receipt-sha256` for the prior Test seal. Test
preparation validates the exact Dev file hash, Dev project, sealed state,
acceptance, final stop, successful drain, source SHA, and all three image
digests. The resulting Test receipt records that Dev promotion binding. Then
run the same migrate, two audits, deploy, start, acceptance, stop, and seal
sequence with `test` paths and Test-specific acceptance evidence.

Dev acceptance is not Test acceptance. Test still requires its own exact two
synthetic users, acceptance evidence, stopped readback, and seal.

## Failure, recovery, and rollback

Preserve the receipt before recovery. Do not delete a failed job, edit the
event history, replace its execution name, or rerun a completed action against
the same candidate. Database jobs, sessions, and recovery attempts are saved
before their cloud work and then record success, failure, or an unresolved
execution. A failed candidate action moves the release to
`blocked-recovery-required` and prevents normal forward actions.

- A failed migration or audit deliberately leaves SQL running for diagnosis.
  Preserve the failure evidence and determine whether the job ran before
  changing cloud state. The budget is still accruing while compute remains on.
- A failed start closes the web shell again, but the API or database may remain
  running for safe investigation. Do not claim a session opened.
- A failed drain keeps the web shell closed but intentionally leaves the API
  and database running so pending synthetic financial work is not abandoned.
  The atomic receipt retains the failed drain attempt and sanitized reason.
- Rejected functional evidence does not create a passing acceptance event.
  Preserve the real test result and run `stop` to close the session safely. A
  successful stop without acceptance records `stopped-unaccepted`; do not seal
  the candidate.
- A deployment failure records the failed deploy and automatically attempts
  rollback. Preserve both the deploy event and rollback result.

Both `stop` and `rollback` close and verify web ingress immediately after taking
the environment lock, before the slower normal preflight. Explicit `rollback`
is available from `prepared-paused`, `migrated`, `runtime-audited`,
`reader-audited`, `deployed-paused`, `session-open`, `stopped-unaccepted`,
`stopped-tested`, or `blocked-recovery-required`.

```sh
python3 deploy/gcp/activate-dev-test.py dev rollback \
  --images /tmp/dev-images.json \
  --receipt /tmp/dev-candidate-receipt.json
```

Rollback verifies that both immutable predecessor revisions still exist, are
ready, and use the recorded predecessor images. It accepts only manual API
scale zero or one. If the API is active, it always waits for in-flight requests
and runs a fresh recovery drain with the read-only identity, even when an
earlier drain passed. If the API is already paused, an earlier passed drain may
be reused; otherwise a session that may have run also requires a recovery
drain. Only after a passed drain does it scale the API to zero, set SQL
activation to `NEVER`, route 100% of both services to the exact predecessor
revisions with no tags, and verify both services and the database are stopped.

A successful rollback records `rolled-back-paused`, hash-binds the canonical
rollback result and optional recovery-drain execution into the event history,
and prints the SHA-256 of the exact final receipt bytes as `receiptSha256`.
Retain those bytes and that hash independently. A successful rollback is
terminal and cannot be replayed. A failed rollback records its sanitized
failure in `recoveryAttempts`, remains `blocked-recovery-required`, and requires
operator investigation before any retry. If its recovery drain fails, the web
stays closed while API and SQL remain running so unresolved work is not hidden.

Rollback does **not** reverse database migrations. Migration
`0021_customer_wallet_control_setup` intentionally keeps the exact prior
Dev/Test synthetic application contract usable during this window: the
database accepts either the complete legacy v1 base-and-wallet consent pair or
the complete v2 pair, but rejects mixed pairs. The new application still
requires v2 before reaching the database. Remove the v1 database compatibility
only in a later reviewed contract migration after the predecessor revision has
left the rollback set. Never down-migrate `0021` as an operational rollback.

### Preparing the next candidate after rollback

A successfully rolled-back receipt may be the prior receipt for a new
candidate. Use the independently retained rollback receipt hash; do not reuse
the one-time committed baseline flag:

```sh
python3 deploy/gcp/activate-dev-test.py dev prepare-release \
  --images /tmp/dev-next-images.json \
  --prior-receipt /path/to/rolled-back-dev-receipt.json \
  --prior-receipt-sha256 "$SAMRA_DEV_ROLLED_BACK_RECEIPT_SHA256" \
  --receipt /tmp/dev-next-candidate-receipt.json
```

The new source SHA must differ from both the rolled-back candidate and the
active predecessor, and its candidate image set must differ from the failed
candidate. Preparation validates the full rollback history and result hash,
the successful recovery attempt, stopped SQL, and live predecessor revision,
image, readiness, scale, and traffic. It records the active predecessor as the
new rollback target even if the failed candidate remains the latest created
service revision. A new Test candidate still requires the matching independently
hashed, sealed Dev receipt flags in addition to its rolled-back Test receipt.

After any failure, independently inspect live Cloud Run, Cloud SQL, job, secret
metadata, and the sanitized receipt before deciding whether to invoke the
built-in rollback or prepare a new candidate. No recovery decision expands this
runbook to Staging, Production, or a real provider.
