# Dev/Test runtime handoff — September 10

Migration coordination belongs to the Environment set up task. This document
records dependencies to preserve; it does not authorize an organization move,
billing change, IAM expansion or production deployment.

Both existing projects now belong to company organization `993968777863`,
region `us-east4`. Their source organization was `614833350075`; project
IDs/numbers and the billing account were preserved. The migration owner
completed post-move API/web readiness and safe drain/stop checks and returned
runtime control to the engineering task. A later read-only preflight confirmed
the company parent, original application revisions and paused state.
[Dev evidence](evidence/2026-09-10-dev-runtime-activation.json) and
[Test evidence](evidence/2026-09-10-test-runtime-activation.json) contain exact
application digests, numbered secrets, job executions and revisions. Both are
paused: SQL STOPPED/NEVER and Cloud Run web/API manual count zero. Data remains.
The [handoff read-back](evidence/2026-09-10-dev-test-handoff-readback.json)
distinguishes fresh metadata from the retained deployment and migration evidence.

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

The combined $50 budget is alerts-only and filters these two projects.
Hierarchy ownership and billing ownership require distinct readbacks. Billing
remains on `01196E-DFC16E-433E6C`; company billing reassociation was not part of
the move. This engineering task made no migration or IAM changes.

Five temporary destination migration grants still await exact approval in the
migration-owner task after an automatic approval review rejection. Their recorded
expiry is September 11 at 03:59:59 UTC. Do not retry their removal, extend them or
change retained project permissions as part of a Dev/Test application rollout.
This remaining cleanup does not constitute approval for broader IAM changes.

Human two-user sign-in, synthetic onboarding/ledger UAT and notification inbox
delivery remain open. Both native cloud alert incidents are verified. Local
Docker ledger proof is separate. Native configuration merged in #215; actual
build/install and participant acceptance remain open. The funded-account fix in
#217 needs its own deployment evidence. David retains production authority.
