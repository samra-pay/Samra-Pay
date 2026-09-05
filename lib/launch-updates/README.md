# Resend launch updates

This package contains two strictly separate paths:

- the controlled public marketing waitlist in `public-server.mjs`,
  `public-waitlist-service.mjs`, `waitlist-resend.mjs`, and `waitlist-profile.mjs`; and
- the older private one-message connection test.

The public service accepts email plus optional first name and international-format
mobile number, requires explicit
email consent, and creates a contact in one configured Resend Segment and Topic.
An existing subscribed contact is added to that Segment and Topic; a globally
unsubscribed contact is left unchanged. Optional profile fields are written only
when creating a new contact; repeated public submissions never update a profile.
Phone format validation does not verify ownership, reachability, or SMS consent.
The Resend custom property `phone_number` must exist as a string before release.
See [SAM-13 staging review](../../docs/reviews/2026-09-05-sam-13-staging-review.md). It does not send an email, use a Samra
database, create an account or application, or access any financial runtime.

## Current state

David confirmed that `samra-production-resend-api-key`, version `1`, is Enabled
in `samra-pay-production`. This is user-reported metadata, not an independent
cloud/credential check. The key payload has never been read into this workspace.

On September 3, 2026, David approved the proposed private test by replying
"submit": one email to `support@samrapay.com`, a dedicated temporary test
identity, key-only access, build/deployment/cleanup, and a $1 incremental spending
limit, subject to build review and permission checks. The sender is
`Samra Pay <updates@mail.samrapay.com>`; replies go to `support@samrapay.com`.

The private test history does not authorize the public service. The public
waitlist has its own exact-SHA review and apply gate in
`deploy/gcp/activate-public-waitlist-release.sh`.

## Offline checks

From the repository root:

```sh
node --test lib/launch-updates/src/*.test.mjs
```

Every provider response is mocked and all email addresses/keys used by tests are
synthetic. Running `node lib/launch-updates/src/connection-test.mjs` without
configuration prints `disabled` and makes no provider request.

The dedicated review workflow runs these tests and builds an ephemeral local
Docker image, then verifies its non-root user and disabled default with networking disabled. It
has no Google credentials, OIDC permission, registry login, publication step,
secret reference or sending configuration. A successful disabled-container
check is not authentication, delivery or production-image provenance evidence.

## Runtime boundary

The CLI needs all of the following before it can call the provider:

- Explicit `--send-approved-test` argument and `SAMRA_LAUNCH_UPDATES_MODE=test`.
- Project `samra-pay-production`, job `samra-production-resend-test`, numeric
  secret version `1`, one task, index `0`, and task attempt `0`.
- A verified non-root effective process UID; root or an unavailable UID blocks key access
  and all provider requests.
- One explicitly approved recipient, an opaque approval ID, and an original
  UTC expiry no more than one hour after configuration.
- The API key supplied to the server by the approved secret mount, never by a
  browser variable, command-line argument, image build argument or GitHub secret.

The runner checks suppression and global unsubscribe state before sending fixed
connection-test content. It does not create/update contacts, reverse opt-outs,
subscribe the recipient or retry automatically. The provider idempotency key is
stable for the approval ID. A repeat execution must not change the original
approval ID/expiry or bypass a failure by opening a fresh sending window.

Logs contain only bounded status/error codes and a validated provider message
ID. `provider_accepted` means API acceptance, not inbox delivery. Inspecting inbox
receipt and reply routing remains a separate manual verification.

## Cloud template and approval gates

`deploy/cloud-run-job.template.json` uses the native Cloud Run v2 REST Job schema,
not a Kubernetes manifest or v1 `gcloud run jobs replace` input. It is deliberately incomplete: its image is an
invalid placeholder, mode is disabled, arguments are empty, and recipient,
approval ID and expiry are blank. Version `1` is pinned in both the actual
secret reference and runtime guard. Proposed identity:
`samra-resend-test@samra-pay-production.iam.gserviceaccount.com`.

The first PR scan applied Kubernetes rule KSV-0118 to the previous Cloud Run v1
shape. Google documents Kubernetes `securityContext` as unsupported in Cloud
Run. The template now uses the native v2 schema; no scanner rule or gate is
disabled. Non-root execution is enforced in the Dockerfile, verified inside the
CI container, and checked by the runner before it accesses the key. The job
template has no automatic-execution token and remains disabled.

Trivy may not semantically validate native Cloud Run v2 JSON. A green repository
scan is not a Cloud Run configuration audit: exact-shape template tests and the
required pre-execution inspection of the deployed job still govern. The CI UID
check uses the image's own user metadata without a `--user` override.

Cloud Run resolves secret-backed environment variables before container startup.
Therefore, **even a disabled cloud execution can retrieve the key and incur
charges**. Do not deploy or execute the template to test its disabled behavior;
use the local offline container check instead.

Before a real test:

1. Review the exact source commit and obtain passing checks. Review/scan the
   pinned base and final image; record an immutable production image digest.
2. Through an already-authorized operator path, verify project/account, region,
   APIs, billing, the secret/version metadata and inherited IAM without reading
   the payload. Confirm that any proposed test resources are absent; do not
   overwrite resources whose ownership is unknown.
3. Reuse existing production build/registry access only if verified. The normal
   five-app Cloud Build contract is staging-only and must remain unchanged.
   Upload only an explicitly verified allowlist of the three runtime modules
   and required build files. Both ignore files exclude other content, but the
   final uploaded archive must still be inspected; never upload the parent
   worktree or an environment file. Missing source-storage permission or a
   required new federation is a separate access blocker, not permission to
   grant project-wide roles or create stored credentials.
4. Bind approval to the exact digest and job configuration. Use one task,
   parallelism one, retries zero, 60-second timeout, no schedule/HTTP endpoint,
   no VPC/database attachments, and only secret-scoped access for the dedicated
   test identity. Any needed deployer impersonation grant must target only that
   new identity. Creating a job must not automatically execute it.
5. Independently inspect the deployed configuration, then execute once without
   overrides. Preserve sanitized evidence. An ambiguous result is not permission
   to send a second message under a new approval ID.
6. Cancel any still-running execution; remove only this test's access grants
   and owned temporary resources after recording evidence. Preserve the shared
   secret, existing identities/registry and all unrelated data. Verify cleanup.

The $1 limit is an operator spending boundary, not an automatic Google billing
cap. Stop before paid work if the verified estimate exceeds it, a security check
fails, or any material permission expansion is required. Do not activate a paid
API or change the Resend plan. No public signup or launch email campaign is
approved by this one-message test.

## References

- [Resend send API and idempotency](https://resend.com/docs/api-reference/emails/send-email)
- [Cloud Run job secrets and startup behavior](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets)
- [Cloud Run job runtime fields](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run v2 Job schema](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs)
- [Cloud Run v1 unsupported security context](https://docs.cloud.google.com/run/docs/reference/rest/v1/Container)
