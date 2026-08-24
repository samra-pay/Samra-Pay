# GitHub Enterprise Control-Plane Migration

## Decision

Samra Pay source control, CI/CD governance, deployment approvals, and Google
Cloud workload identity will move from the founder's personal GitHub namespace
to the Enterprise-backed `samra-pay` organization.

The repository transfer is prepared but is not authorized. The current personal
repository remains the active source of truth until every transfer gate passes.

## Verified starting state

- Active repository: `haileleuld87/Samra-Pay`
- Stable repository ID: `1335175962`
- Active owner ID: `237485986`
- Target organization: `samra-pay`
- Target organization ID: `320532147`
- Target repository name: `samra-pay/Samra-Pay`
- Enterprise billing: trial
- Organization owners: one
- Independent staging approvers: none
- Operational files bound to the personal authority: 43

The organization now uses least-privilege defaults. Members receive no base
repository or project access, cannot create repositories or Pages sites, and
cannot perform sensitive repository-administration actions reserved for owners.
The `developers`, `platform-admins`, and `staging-approvers` teams exist.

## Hard stop gates

Do not transfer the repository until all three gates pass:

1. GitHub Enterprise billing is activated on a durable paid plan.
2. A second organization owner has accepted the invitation.
3. A person other than the change author is in `staging-approvers` and can serve
   as the required protected-environment reviewer with self-review prevented.

Do not add a placeholder, shared account, bot, or service identity to satisfy a
human review gate.

## Controlled cutover sequence

1. Re-run the read-only migration review from the exact current `main` commit.
2. Record repository settings, Actions permissions, environments, secrets and
   variables metadata, installed GitHub Apps, webhooks, deploy keys, branch
   protection, rulesets, and the current Google federation configuration.
3. Create a recoverable repository backup and verify its object integrity.
4. Freeze all staging release environments. Do not publish images, deploy
   revisions, run migrations, promote traffic, or roll back during the cutover.
5. Transfer the repository to `samra-pay` using GitHub's repository-transfer
   control.
6. Verify the repository still has numeric ID `1335175962`, is private, uses
   `main`, and retains its complete commit, issue, pull-request, release, and
   settings history.
7. Change all 43 operational authority references from the personal owner to
   the organization owner in one reviewed pull request. Do not update historical
   evidence links solely for cosmetic reasons.
8. Reapply the five Google Workload Identity provider conditions to the new
   repository name and organization owner ID. Keep the stable repository-ID,
   branch, event, workflow-file, workflow-name, and protected-environment
   restrictions.
9. Rebind all protected deployment environments to `staging-approvers`, require
   one reviewer, and prevent self-review.
10. Reconnect and audit the Qase GitHub App, branch protection, rulesets, Actions
    policy, repository variables, environment variables, and webhooks.
11. Run every independent read-only GitHub and Google Cloud audit.
12. Run the read-only staging image-publication workflow. Only after it passes
    may a separate authorization permit a build or deployment.

## Fail-closed behavior

The current Google trust remains bound to the personal repository name and
owner ID. Repository transfer therefore blocks cloud token exchange until the
new organization-bound conditions are explicitly reviewed and applied. This is
intentional. No dual-owner or wildcard trust window is allowed.

## Read-only verification

Run:

```text
node deploy/gcp/review-staging-github-enterprise-migration.mjs --review
```

The review scans the operational control plane, confirms that all personal
authority references are inventoried, rejects premature organization authority,
and makes no GitHub or Google Cloud change.
