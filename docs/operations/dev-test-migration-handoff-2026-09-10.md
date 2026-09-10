# Dev/Test source runtime handoff — September 10

Migration coordination belongs to the Environment set up task. This document
records dependencies to preserve; it does not authorize an organization move,
billing change, IAM expansion or production deployment.

Both source projects remain in organization `614833350075`, region `us-east4`.
[Dev evidence](evidence/2026-09-10-dev-runtime-activation.json) and
[Test evidence](evidence/2026-09-10-test-runtime-activation.json) contain exact
application digests, numbered secrets, job executions and revisions. Both are
paused: SQL STOPPED/NEVER and Cloud Run web/API manual count zero. Data remains.

Preserve each project's separate private network/PSA range, SQL instance and
backups/PITR/deletion protection, registry images, build identity/source bucket,
runtime/migration/audit identities and role grants, exact secret versions,
web-to-API invocation boundary, Auth0 audiences and exact web origins, logging
and notification channels. Bootstrap identities and setup secrets are retired;
do not reactivate them for a hierarchy move. No service-account keys exist in
these operational instructions.

The Cloud Shell operator home contains `samra-dev-test-operations/` with the
versioned `operator-fe9062d/` implementation and each environment's image and
receipt JSON. These are dependency/evidence references, not credential values.
Use the recorded operator version for restart/shutdown; do not replace a tested
receipt with an unverified source version.

The combined $50 budget is alerts-only and currently filters these two projects.
Hierarchy ownership and billing ownership require distinct readbacks. This task
made no migration changes. The migration owner must verify destination policy,
IAM visibility and explicit authority before moving one nonproduction project,
then repeat runtime access, auth redirects, private API denial, database TLS,
secret grants and safe restart/stop proof. Preserve Production-last ordering.

Human two-user sign-in, synthetic onboarding/ledger UAT and notification inbox
delivery remain open. Local Docker ledger proof is separate. Native setup
continues in #215. David retains merge and production authority.
