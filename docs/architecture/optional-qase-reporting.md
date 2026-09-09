# Optional Qase reporting

> Superseded on 2026-09-09: David retired Qase. Follow [GitHub user testing](../testing/user-testing.md).
> The content below is historical context, not current setup or activation instructions.


Status: accepted implementation direction, pending PR review and merge.
Owner: David Haile. Decision date: 2026-09-05.

David approved making Qase reporting optional while retaining mandatory GitHub
engineering checks and immutable release evidence. The trigger was release run
[33970333654, attempt 1](https://github.com/samra-pay/Samra-Pay/actions/runs/33970333654):
all ten engineering gates passed for `c6c67b7d34133c596c6d881610679e4a36dbf4fe`,
but Qase returned HTTP 403 at its active-run limit. That historical run remains
failed and cannot certify a later commit.

## Decision and implementation

GitHub Actions and the retained, hashed evidence bundle determine automated
release eligibility. Qase is an optional reporting destination. Both the
immutable release-candidate workflow and the private staging verification
workflow expose `report_to_qase`, a boolean that defaults to false. No Qase
subscription, token, run creation, upload, or completion is required when off.
When enabled, external reporting errors remain visible but do not override
engineering results. Run completion is attempted for every created run even
when upload fails, unless the workflow is cancelled.

The release contract and release manifest use version 2. The local
`qase-run.json` remains required and hashed, with explicit enabled/disabled
state, actual create/upload/complete outcomes, and a nullable run identity.
The combined staging verification manifest also uses version 2 and records
those outcomes plus whether both JUnit files were uploaded. A disabled or
failed report is never described as uploaded or passed. Missing or inconsistent
local reporting records fail verification.

Reporting outcomes are the GitHub action's observed exit outcomes. On September
6, the existing create action returned success while Qase rejected the request
at its active-run limit and produced no run ID. That case retains the successful
action outcome, null run identity and skipped upload/completion; it cannot claim
delivery and does not block engineering evidence. A successful action outcome
alone is not independent proof of provider acceptance. Upload or completion
without a run identity remains invalid.

The ten release gates, all 49 required evidence files, five runtime image
scans, backup/restore provenance, SHA/tree/run/attempt binding, file allowlist,
and 365-day retention remain enforced. Private staging verification still
requires both independently hashed evidence planes, all technical checks, and
exact restoration of temporary routing. Promotion carries the reporting record
forward while retaining its separate authorization and rollback controls.
Historical promotion receipts retain their original mandatory Qase identity
checks; existing receipts are not rewritten.

Version 1 release and combined verification manifests are not upgraded in
place. A fresh successful run at the reviewed merged SHA is required. The
existing successful-run and artifact provenance checks remain mandatory before
publication or later staging steps.

## Alternatives and consequences

Upgrading Qase or deleting historical runs would address quota capacity but
would retain a third-party availability dependency in the release path. Keeping
GitHub evidence authoritative avoids that dependency without removing a test.
Qase remains available for reporting and manual test organization; required
manual acceptance still needs its case, exact revision, result, owner, and
evidence recorded in the existing engineering record when Qase is unavailable.
Existing daily/weekly reporting schedules and historical Qase runs are unchanged.

This decision supersedes the mandatory Qase release conditions in the release
and staging verification runbooks. It grants no deployment, shared-database,
provider activation, public traffic, or spending authorization.
