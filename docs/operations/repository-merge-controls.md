# Repository merge controls

Status: the code-side controls are implemented. GitHub-side enforcement is
blocked on the current private-repository plan and is not represented as active.

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

## GitHub ruleset to enforce

The `main` ruleset must:

1. require a pull request;
2. require `Required CI` and `Required security` with an up-to-date branch;
3. require the merge queue;
4. block force pushes and branch deletion; and
5. prevent bypass of the required checks.

The repository currently returns HTTP 403 for both branch-protection and
ruleset configuration because those controls are unavailable for this private
repository on its present GitHub plan (initial verification: 2026-09-02).
Read-only verification on 2026-09-05 again reported `main.protected=false`
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

After the repository plan supports rulesets, record a read-back of the applied
`main` ruleset showing the two exact check names, strict/up-to-date enforcement,
merge queue, force-push protection, deletion protection, and bypass policy.
Until that read-back exists, describe green-main enforcement as implemented in
code but not enforced by GitHub.

Decision owner: David Haile. Use the existing
[Enterprise migration plan](github-enterprise-control-plane-migration.md) if
an organization transfer is selected. Do not change visibility, purchase a
plan, transfer ownership, or reissue cloud federation merely to clear this
blocker. Those actions require a separate decision and their existing controls.

The next activation must verify support for the complete contract, including
merge queue, before changing the plan or repository. Record the resulting
ruleset ID, review time, exact check contexts, queue and bypass settings, and a
read-back. Until then, contributors must still use reviewed PRs and verify the
exact candidate's required checks; this is a working practice, not enforced
protection.
