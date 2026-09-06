# Repository merge controls

Status: GitHub-side enforcement was verified active on **2026-09-05** after
the approved transfer to private `samra-pay/Samra-Pay`. Repository ruleset
`22344977` requires PRs, both checks, an up-to-date branch and the merge queue,
blocks force-push/deletion, and has no bypass. See the
[dated transfer record](enterprise-transfer-2026-09-05.md) and
[machine-readable audit](evidence/2026-09-05-merge-authority.json).

## Required check contract

[`repository-controls.json`](../testing/repository-controls.json) names two
stable merge checks:

- `Required CI` fails closed over Linux quality, PostgreSQL persistence, and
  PostgreSQL HTTP acceptance.
- `Required security` fails closed over repository policy, repository-owned
  Semgrep source policies, Trivy dependency, secret, configuration, SBOM, and
  license evidence, plus scans of all five built runtime images.

Both workflows run for pull requests, merge-queue groups, and every push to
`main`. Only superseded pull-request runs may be cancelled. A merged `main`
commit therefore keeps its own result instead of being cancelled by a later
merge.

The dependency validator rejects mutable GitHub Action references, service and
job-container images, Dockerfile frontends, and deployment base images. The five
runtime Dockerfiles use reviewed SHA-256 image digests. Dependabot proposes npm,
Action, and Docker digest updates; it does not bypass the required checks.

## Enforced GitHub ruleset

The `main` ruleset must:

1. require a pull request;
2. require `Required CI` and `Required security` with an up-to-date branch;
3. require the merge queue;
4. block force pushes and branch deletion; and
5. prevent bypass of the required checks.

Before the transfer, the repository returned HTTP 403 for branch protection and
ruleset configuration because those controls were unavailable for this private
repository on its former GitHub plan (initial verification: 2026-09-02).
Earlier read-only verification on 2026-09-05 reported `main.protected=false`
at `5bf1659413a8a3918a3fa3b58829d98c1bd47470`; the rulesets API returned
HTTP 403 with "Upgrade to GitHub Pro or make this repository public to enable
this feature." Both required checks passed for that SHA. The workflow files,
green results, and contract do not substitute for the GitHub setting.

`CODEOWNERS` assigns the control surfaces to the repository owner, but it does
not create independent review. If a qualified second maintainer is available,
the eventual ruleset should require that non-author review and dismiss stale
approvals. Do not invent reviewer separation for a solo-maintained repository.

## Activation evidence

Use the [read-only settings audit](repository-settings-audit.md) to produce
dated, exact-SHA metadata evidence. Missing or unreadable controls block the
report; successful workflow validation cannot substitute for this read-back.

The post-transfer read-back verified both exact check names bound to GitHub
Actions app `15368`, strict/up-to-date enforcement, merge queue, force-push
protection, deletion protection and an empty bypass list. The temporary
organization update hold `22344895` was disabled only after that audit passed.
The permanent ruleset remained effective in the subsequent audit.

Decision owner: David Haile. The approved transfer and protection package is
complete; the [migration plan](github-enterprise-control-plane-migration.md)
still governs the remaining source and cloud cutover. The completed GitHub
approval does not authorize cloud federation changes or release resumption.

Contributors must use reviewed PRs and the enforced merge queue. Re-read current
settings and exact-candidate checks when they matter to a release decision.
This settings observation does not prove a completed queue merge, cloud
federation, deployment or production readiness. Nine release/sync workflows
remain paused pending source-authority and integration reconciliation.
