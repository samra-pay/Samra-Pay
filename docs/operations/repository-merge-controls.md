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
repository on its present GitHub plan. This was verified on 2026-09-02. The
workflow files and contract do not substitute for the GitHub setting.

`CODEOWNERS` assigns the control surfaces to the repository owner, but it does
not create independent review. If a qualified second maintainer is available,
the eventual ruleset should require that non-author review and dismiss stale
approvals. Do not invent reviewer separation for a solo-maintained repository.

## Activation evidence

After the repository plan supports rulesets, record a read-back of the applied
`main` ruleset showing the two exact check names, strict/up-to-date enforcement,
merge queue, force-push protection, deletion protection, and bypass policy.
Until that read-back exists, describe green-main enforcement as implemented in
code but not enforced by GitHub.
