# Terraform adoption and security foundation

Owner: David Haile. Prepared September 10, 2026 from main
`7d9593ba1535cf4a61c2010a31db612be28a4a0f`.

Status: implementation for review. No Terraform state bootstrap, import, cloud
apply, IAM grant, production release or security certification is claimed.
The scope is the first foundation milestone: reconcile active deployment guards
with the completed organization move, validate protected state storage, and
prepare import-only project adoption. Existing application delivery stays in
the repository's guarded controllers. Do not deploy the generic foundation
wizard over the existing resources.

## Ownership and inventory

All four project parents and billing links were read in the signed-in console
on September 10 in the foundation task. This is metadata evidence, not an
inventory of every resource or security setting.

| Environment | Project | Number | Parent |
| --- | --- | --- | --- |
| Dev | samra-pay-dev | 829811168658 | 993968777863 |
| Test | samra-pay-test | 378050809796 | 993968777863 |
| Staging | samra-pay-staging | 934122615631 | 993968777863 |
| Production | samra-pay-production | 382465561715 | 993968777863 |

Billing remains `01196E-DFC16E-433E6C`. Do not replace it with the newer
company billing account as a side effect of adoption. Dated evidence under
`docs/operations/evidence/` retains its original source-organization values.
The historical `organizationIdFromExistingFoundation` field also stays intact.
Active staging/production guards now require company organization `993968777863`.

| Resource or field | Owner during this milestone |
| --- | --- |
| State buckets | Terraform bootstrap after exact plan approval |
| Existing project name/labels/parent/billing | Import-only Terraform after fresh snapshot and zero-mutation plan |
| Cloud Run images, revisions, traffic and scaling | Existing release and Dev/Test session controllers |
| SQL instances, networks, IAM, service identities | Existing controls; inventory and adopt separately before changing owner |
| Secret metadata/versions and application configuration | Existing scoped provisioning and release controls; no secret payloads in Terraform |
| Budgets and notifications | Existing billing controls; inspect before adding overlapping budgets |

Do not put a resource in two states. Do not let a Terraform apply revert a
release, start a paused database, reset manual scaling or change secret versions.
Before each future adoption, remove the previous writer for the exact fields
being transferred and prove a no-change plan.

## Local verification and CI

Terraform is pinned to 1.14.7 and the Google provider to 7.41.0. Commit all
provider lockfiles. Existing CI runs validation and mocked security tests with
no Google credentials. This extends `ci.yml`; it adds no credentialed PR job.

```sh
bash deploy/gcp/terraform/validate.sh
node --test deploy/gcp/*.test.mjs
git diff --check
```

`validate.sh` disables backend initialization for validation. This does not
establish remote state or prove a live plan. The mock tests verify project
identity/billing rejection and private, versioned state bucket configuration.

## State bootstrap

First list existing buckets and state ownership using the authorized operator.
The absence of Terraform files in this repository does not prove that no state
exists elsewhere. If any target bucket exists, inspect it and its owner; import
only after reconciling its configuration. Never recreate or overwrite it.

`bootstrap/` proposes five regional buckets: one per environment and one
separate bootstrap bucket in Production. All enforce public-access prevention,
uniform bucket access, object versioning, seven-day soft delete, `force_destroy = false` and Terraform `prevent_destroy`. No new projects, service-account
keys, IAM grants or organization policy changes are in the bootstrap plan.
State object storage/versioning can incur cost; a reviewed budget is required.

Use an existing administrator session for initial bootstrap. Keep local state
and saved plans private (`umask 077`); never upload them to PRs or general CI
artifacts. Review a saved bootstrap plan before applying. After creation, copy
`bootstrap/backend.tf.example` to `bootstrap/backend.tf`, run `terraform init -migrate-state` in that directory and verify remote state before retiring the
local recovery copy. The local backend override is ignored by Git.

No bucket retention lock is configured: it would also prevent deletion of
Terraform's lock objects. Versioning is not a substitute for a tested recovery
procedure. Recover a state version only while all writers are stopped; verify
lineage/serial and current resources before resuming. Never force-unlock another
active run. Bucket owners and project administrators retain powerful access;
do not describe bucket separation as isolation from project administrators.

## Project adoption: Dev first

Run with the reviewed current source and an existing authenticated account.
The audit reads project and billing metadata only; it does not read credentials,
secret values, database data or Terraform state. It refuses wrong project IDs,
numbers, organization, disabled billing and stale snapshots.

```sh
umask 077
# Choose a new private directory outside source control for each observation.
node deploy/gcp/audit-terraform-project.mjs dev me@davidhaile.com /tmp/samra-dev-adoption-UNIQUE
terraform -chdir=deploy/gcp/terraform/environments/dev init -input=false -lockfile=readonly
terraform -chdir=deploy/gcp/terraform/environments/dev plan \
  -input=false -lock-timeout=60s \
  -var-file=/tmp/samra-dev-adoption-UNIQUE/snapshot.tfvars.json \
  -out=/tmp/samra-dev-adoption-UNIQUE/project.tfplan
terraform -chdir=deploy/gcp/terraform/environments/dev show -json \
  /tmp/samra-dev-adoption-UNIQUE/project.tfplan \
  > /tmp/samra-dev-adoption-UNIQUE/project.tfplan.json
node deploy/gcp/validate-terraform-adoption.mjs dev \
  /tmp/samra-dev-adoption-UNIQUE/project.tfplan.json
```

Backend initialization requires the approved state bucket to exist. The
validator allows only the one existing project container with no resource
mutations; it rejects incomplete checks, drift, creation, update, deletion,
replacement and wrong import targets. Review the plan and import identity.
An approved import-only apply writes state; it is not an infrastructure change.
Apply only the exact reviewed saved plan, then rerun plan and require no changes.
Do not use `-target`, `-lock=false`, `-refresh=false` or `ignore_changes = all`
to hide a failed adoption. Repeat for Test, Staging and Production in order.

The plan validator is a gate, not an IAM security boundary. A person with cloud
administrator rights can bypass local tooling. Production requires protected
GitHub environments and separate scoped deployment identities before automated
apply is enabled.

## Security and operations acceptance

The following are explicit remaining verification/implementation gates, not
claims of saved configuration:

| Control | Required evidence / action |
| --- | --- |
| Human access | MFA for administrators, company group membership and a tested emergency-access procedure. The console currently prompts `me@davidhaile.com` to enable MFA by October 20; verify enrollment with the user. |
| Billing access | Company billing viewer/admin assignments on the existing account. `david@samrapay.com` could not read spend reports in the console inspection. |
| Automation identity | Reuse established GitHub OIDC patterns. Create distinct plan/apply identities per environment only after exact grant review; bind immutable repository/owner IDs, main ref, event, workflow and protected environment. No credentialed fork or untrusted PR jobs. |
| State access | State object access only on that identity's bucket; no access for runtime/build accounts. Review inherited project grants too. Bootstrap bucket is administrator-only. |
| Plan versus apply | Plan principal gets resource read permissions plus lock/state permissions only; apply gets reviewed resource-specific writes. No general Owner/Editor or organization-wide deployment rights. |
| Org policies | Read effective key-creation/upload, automatic default-service-account grants, public sharing and migration policies before changing them. Preserve existing controls and test compatibility; do not install a blanket public-ingress denial that breaks the approved marketing/login surfaces. |
| Workloads and network | Verify private SQL, TLS verification, split runtime/migration/audit roles, Auth0 authorization and private API invocation. Verify unauthenticated and cross-environment requests are denied. |
| Supply chain | Preserve pinned actions, immutable images, security scans and exact-artifact promotion. Never rebuild a different artifact for production. |
| Secrets | Metadata and per-secret IAM only; numbered runtime versions. No secret payload resources or plaintext secrets in state, logs, plans or artifacts. |
| Spend | Fresh per-project budget/scope/recipient readback and alert delivery test. Existing records describe combined $50 Dev/Test, $50 Staging and $25 Production alerts, not hard caps or fresh confirmed spend. |
| Session shutdown | Preserve tested stop/drain/start sequence. Do not add a timer that interrupts pending transfers, ledger holds or worker/outbox work. Never unlink billing as shutdown. |
| Recovery | Fresh SQL backup/PITR and deletion-protection readback; restore to an isolated target and verify data. Test application rollback and state-version recovery separately. |
| Monitoring/privacy | Uptime/error/security alerts with delivered notification evidence; audit-log access and retention sized to data policy and cost. Exclude credentials, raw provider payloads and PII from application logs. |

No unattended production apply, new paid security tier, live customer-data
activation or firewall/organization-policy weakening is part of this milestone.
The next milestone is reviewed state bootstrap and a verified Dev no-change
plan, followed by narrowly scoped keyless plan/apply automation in the existing
delivery system. Foundation completion requires the live acceptance evidence,
not merely a merged PR or successful mock tests.

## References

- [Terraform operations](https://docs.cloud.google.com/docs/terraform/best-practices/operations)
- [Terraform security and state](https://docs.cloud.google.com/docs/terraform/best-practices/security)
- [GCS state locking and recovery](https://developer.hashicorp.com/terraform/language/backend/gcs)
- [Keyless deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Existing security policy](../../../SECURITY.md)
- [Dev/Test runtime and budget controls](../dev-test-environments.md)
