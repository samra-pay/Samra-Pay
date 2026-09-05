# Enterprise transfer execution record

Owner: David Haile. Observed 2026-09-05. Scope: approved GitHub ownership,
merge protection, release freeze and exact-SHA CI/security verification.

The private repository moved from `haileleuld87/Samra-Pay` to
[`samra-pay/Samra-Pay`](https://github.com/samra-pay/Samra-Pay).
The stable repository ID is `1335175962`, organization owner ID `320532147`,
and reviewed main SHA `33bbad186e1f44e175aa6e7b910bc67918830d14`.
No source commit was merged during this transfer.

## Verified controls

- The independent Git mirror passed object-integrity verification; all 278
  pre-transfer refs were preserved unchanged. An additional Dependabot branch
  and PR #176 appeared during execution and were identified separately.
- The temporary organization hold `22344895` targeted only `Samra-Pay/main`,
  blocked updates, deletion, force-push and renaming, and had no bypass.
  It was read back before transfer and confirmed effective after transfer.
- Permanent [ruleset `22344977`](https://github.com/samra-pay/Samra-Pay/rules/22344977)
  requires a PR, `Required CI` and `Required security` from GitHub Actions app
  `15368`, an up-to-date branch and merge queue. Force-push and branch deletion
  are blocked. Bypass actors are empty; the operator cannot bypass.
- The temporary hold was disabled after permanent enforcement passed an
  independent read-back. A subsequent audit found only the permanent rules
  effective and all controls satisfied. The disabled hold is retained for history.
- David's admin access, seven main-only environments, their branch policies,
  repository secret/variable names and Actions permissions were preserved.
  Secret values were not accessed. No new collaborator, team grant or app
  installation was added; the organization installation inventory was empty.

The [machine-readable settings audit](evidence/2026-09-05-merge-authority.json)
includes observation hashes, target provenance and the auditor source hash.
It is point-in-time metadata evidence, not a signed GitHub attestation or proof
of a completed merge-queue execution.
The [saved permanent ruleset response](evidence/2026-09-05-main-ruleset.json)
retains the exact check bindings and queue parameters.

## Post-transfer main verification

Both workflow-dispatch runs passed on the unchanged reviewed main SHA:

- [CI run 33981431002](https://github.com/samra-pay/Samra-Pay/actions/runs/33981431002):
  Linux quality, workspace tests/typechecks, production artifact builds,
  PostgreSQL persistence, HTTP acceptance, commercial isolation and `Required CI`.
- [Security run 33981434685](https://github.com/samra-pay/Samra-Pay/actions/runs/33981434685):
  repository policy, Semgrep, Trivy repository and five runtime image scans,
  and `Required security`.

CI used supported inputs `qase_report=false` and `run_commercial=true`.
Qase reporting was intentionally skipped; no Qase delivery is claimed.
The [compact run evidence](evidence/2026-09-05-transfer-checks.json) preserves
the SHA, IDs, timestamps, job outcomes and run links. These results cover the
recorded main commit, not subsequent PR commits, Google access or deployment.

## Release freeze

These workflow IDs were read back as `disabled_manually` after transfer:

| Workflow | ID |
| --- | --- |
| Notion ticket sync | 350558398 |
| Public site preview publish | 348676505 |
| Immutable release candidate | 337326131 |
| Staging image publication | 340030605 |
| Staging image verification | 340878266 |
| Staging migrations | 350914431 |
| Staging traffic control | 340338446 |
| Staging verification probe | 340912720 |
| Staging zero-traffic deployment | 340328709 |

CI, Security and existing offline checks remain enabled. The production
foundation preflight is read-only and remains enabled, but its old-owner
Google trust cannot be represented as working after transfer.

## Source-authority update

At transfer time the migration JSON described an unauthorized transfer, trial
billing, blocked recovery and personal active authority. Those observations were stale:
paid activation, passkey/recovery prerequisites and the transfer were completed
before this record. Version 2 retains the earlier observation as history and
records the new GitHub-complete/cloud-pending phase. It keeps live trust apply
and release resumption unauthorized.

The source update reconciles the migration contract, its validator and tests,
operational authority files, recovery provenance and Notion tooling. It keeps stable
repository ID `1335175962`, new owner ID `320532147`, exact workflow/ref/event
and environment checks. Regression tests reject the former owner, wrong IDs,
wildcard/dual-owner trust and premature release resumption. Historical evidence
URLs retain their original authority and date through exact-line exceptions.
The whole-source scan replaces the earlier 69-file deployment-only inventory,
which missed the recovery test and Notion tooling. The scan uses Git-tracked
and non-ignored files, excludes ignored local data and generated output, and
skips binary assets. Tracked files cannot evade it through an ignore rule.

Acceptance requires current-main settings audit without an override, targeted
migration/federation/evidence tests, the Google Cloud contract suite, and exact
candidate CI/security. The [normal audit command](repository-settings-audit.md)
now reads the organization authority directly. Coordinate with open PR #175 on Qase reporting
instead of duplicating or overriding that work.

Then separately review and authorize Google trust changes against current
pool/provider and service-account inventory. No dual-owner or wildcard trust
window is permitted. Audit chosen app integrations individually and reconcile
the Enterprise 90-day artifact retention cap with workflows requesting 365 days.

Public preview publication remains disabled. Google IAM, secret versions,
database, provider activation, cloud deployment, public traffic and production
approval were outside this transfer. The operational-readiness contract remains
production-blocked. Continue the operational and staged-release gates only with
their required evidence and bounded authority.

## Governed source merge

[PR #177](https://github.com/samra-pay/Samra-Pay/pull/177) subsequently merged
through the required queue at `2026-09-05T18:25:59Z`. Its reviewed head was
`bff157da5db0bd9b16f55c08bb7b7b60205c282f`; the queue produced and merged
`14b46dc3e62453810a1e8261a34a7b1cccc6336c`, which was read back on main.
Both merge-group runs passed for that exact commit:
[CI 33983767241](https://github.com/samra-pay/Samra-Pay/actions/runs/33983767241)
and [Security 33983767215](https://github.com/samra-pay/Samra-Pay/actions/runs/33983767215).
This is completed queue-execution evidence in addition to the earlier settings
audit. It does not prove a Google trust update, provider test or deployment.

The CLI's initial merge attempt returned `Auto merge is not allowed for this
repository` without queuing. The operator used GitHub's supported
[`enqueuePullRequest` mutation](https://docs.github.com/en/graphql/reference/mutations#enqueuepullrequest)
with the exact PR ID, `expectedHeadOid` and `jump: false`. Auto-merge settings,
required checks, queue enforcement and bypass actors were not changed.

The next source tool prepares [Google trust review and read-back](github-authority-cutover-review.md).
It cannot apply the proposal or resume workflows. The [operational closure plan](operational-closure-plan.md)
retains the unresolved operational and provider gates.
