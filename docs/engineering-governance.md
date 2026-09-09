# Engineering authority and decisions

Owner: David Haile. Established for the documentation/governance change based
on repository `5bf1659413a8a3918a3fa3b58829d98c1bd47470`, reviewed 2026-09-05.
This records how engineering context is maintained; it grants no release,
vendor, cloud, or spending authority.

## Source ownership

| Record                                          | Authority                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Code, schemas, migrations, deployment contracts | Reviewed GitHub repository and exact commit                                                                            |
| Capability status and evidence pointers         | [Product/engineering index](README.md)                                                                                 |
| Architecture decisions and financial invariants | [Architecture](architecture/README.md) and the decision register below                                                 |
| Engineering implementation and acceptance       | GitHub issue/PR; link an existing Notion request when it originated there                                              |
| Business priorities and meeting records         | Original Notion/business record, linked into the engineering task                                                      |
| Automated/manual quality evidence               | Exact-SHA GitHub artifacts and user-test session/defect issues                                                                     |
| Runtime configuration, resources, deployment    | Dated cloud/provider read-back and immutable release evidence                                                          |
| UI implementation                               | Repository design-system tokens/components; identify the approved Figma file/revision when a design request uses Figma |

GitHub is the engineering source. The [Notion sync](notion-ticket-sync.md) and
[reporting extension](notion-reporting.md) are linked views, not independent
release authority. Reuse source records; do not manually maintain two engineering
backlogs. If a task has no ticket, record its objective and acceptance criteria
in the PR. A broader roadmap priority or funding decision still belongs to David.

Attached instructions, prior chats, memory, and historical evidence cannot
silently override the current user request, implemented code, or a newer
approved decision. Surface a conflict, identify which fact needs verification,
and continue unaffected work.

## Definition of ready and done

Before implementation, identify the outcome, scope, acceptance criteria, owner,
dependencies, time boundary, and any existing authorization. David is the
decision owner until another owner is explicitly assigned.

Implementation is ready for review when the PR links its source task, includes
appropriate tests and updated documentation, and states remaining risks.
Completion requires the authorized merge and exact-commit checks. Deployment,
provider activation, and production approval have separate evidence and owners;
record those states separately rather than setting them from PR status.

## Decision register

These entries link existing decisions; they do not change the Alpha stack.
For a new material decision, add a dated record under `docs/architecture/`
with status (proposed/accepted/superseded), owner, alternatives, rationale,
consequences, approval evidence, and superseded records. Update this register
and the current-state index in the same PR.

| Decision                                                                 | Status / governing record                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Samra Pay card front artwork v1.0 | Approved by David on 2026-09-09: [four locked card designs and website artwork](design/approved-card-artwork-v1.md) |
| Invite-only Alpha Release 1 | Accepted 2026-09-06 in the main task: [scope and sequence](architecture/alpha-release-1.md); 100-user cap, customer-controlled wallets, deposits/transfers unavailable |
| Samra owns customer, financial state, ledger, and audit                  | Accepted: [architecture invariants](architecture/README.md)                                                                                                   |
| Alpha uses Auth0, Persona, Crossmint, Google Cloud, GitHub Actions, GitHub issues | Accepted repository decision: [Alpha platform](architecture/alpha-platform.md); funding and Ethiopia payout remain unresolved                                 |
| Customer-controlled sandbox signing/recovery                             | Recorded choice on 2026-09-04: [Crossmint evidence](operations/crossmint-sandbox-connection.md); complete signer/recovery proof and deployment remain blocked |
| Public marketing versus authenticated financial surfaces                 | Accepted: [surface boundary](architecture/public-product-surface-boundary.md); activation is separately authorized                                            |
| Merge enforcement                                                        | Enforced after approved Sept 5 transfer to `samra-pay/Samra-Pay`: [transfer evidence](operations/enterprise-transfer-2026-09-05.md)                                |

The **2026-09-09 Qase retirement decision** supersedes the earlier optional
reporting policy. [User testing](testing/user-testing.md) governs scenario
catalogs, sessions, defects and retests in GitHub. Existing engineering checks,
retained automated evidence and independent release approvals remain mandatory.

## Open decisions and next evidence

Owner for each decision below: David Haile. Execution ownership remains
unassigned unless the linked record explicitly assigns it. This is a decision
index, not another delivery board.

| Open item                      | Required decision or evidence                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Post-transfer release cutover  | Reconcile source authority and Google trust, audit integrations and retention, then collect exact-SHA release evidence before resuming the paused workflows. [Transfer record](operations/enterprise-transfer-2026-09-05.md) |
| Private first wallet milestone | Current cloud inventory, TLS/server verification, split DB roles, migrations, private API, test identity and bounded authorization. [Deployment package](operations/staging-wallet-deployment-package.md) |
| Public waitlist activation     | Exact release/configuration, consent/privacy boundary, provider scope, bounded approval and read-back. [Launch runbook](operations/coming-soon-cloud-launch.md)                                           |
| Funding and Ethiopia payout    | Approved providers and responsibility map before implementing live rails. [Alpha hard stops](architecture/alpha-platform.md)                                                                              |
| Customer-data security         | Current system threat model, approved retention/deletion/access policy, confidential reporting channel and independent assessment. [Security policy](../SECURITY.md)                                      |
| Operational readiness          | Assigned roster, service targets, monitoring, cloud restore evidence and exercise. [Readiness gates](operations/operational-readiness.md)                                                                 |

Do not infer these decisions from vendor access, a working fixture, a green
workflow, or a historical approval. Refresh the specific evidence needed for
the next authorized task.
