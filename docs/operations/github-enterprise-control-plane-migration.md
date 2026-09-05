# GitHub Enterprise Control-Plane Migration

## Decision

**2026-09-05 update:** David approved the GitHub-only transfer and protection
package. The private repository is now `samra-pay/Samra-Pay`, stable ID
`1335175962`, owner ID `320532147`, with permanent main ruleset `22344977`
verified active. The [dated execution record](enterprise-transfer-2026-09-05.md)
governs current GitHub status. Releases remain paused. Source-authority
contracts and Google trust have not been cut over.

The starting state and sequence below are retained as historical planning
context. Their trial/recovery/authorization observations are superseded by the
dated execution record; they are not reasons to repeat the completed transfer.
The current contract inventories **69** operational authority files and six
planned Google boundaries, superseding the older counts below. Its validator
still enforces the prepared personal-owner state and must change with the
source-authority cutover.

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
- Enterprise billing information: not configured
- Organization owners: one
- Independent staging approvers: none
- Operating model: solo founder
- Account-recovery readiness: blocked
- Two-factor authentication: enabled with an authenticator app
- Passkey or hardware security key: not configured
- Recovery codes: generated and viewed; external storage not independently
  verified
- Verified recovery email: configured
- Operational files bound to the personal authority: 43

The organization now uses least-privilege defaults. Members receive no base
repository or project access, cannot create repositories or Pages sites, and
cannot perform sensitive repository-administration actions reserved for owners.
The `developers`, `platform-admins`, and `staging-approvers` teams exist. They
reserve durable role boundaries for future hires and contractors; they do not
pretend that an independent human reviewer exists today.

## Solo-founder control model

[GitHub recommends at least two organization owners](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-peoples-access-to-your-organization-with-roles/maintaining-ownership-continuity-for-your-organization)
because a single owner can become an availability risk. Samra Pay currently has
one legitimate owner. A placeholder, shared, bot, or nominal owner would
increase access risk without creating real governance, so a second owner is a
resilience recommendation for when a qualified person exists, not a migration
gate.

Until then, release safety comes from controls that a solo founder can actually
operate and prove:

- at least two GitHub authentication methods, including a passkey or hardware
  security key;
- recovery codes stored securely outside the daily-use device and a verified
  recovery email;
- protected `main`, required automated checks, and no direct release from an
  unreviewed branch;
- manual release workflows bound to the exact repository, workflow, branch,
  event, environment, and full Git SHA;
- immutable image digests, keyless Google federation, and no `latest` tags;
- read-only review and tamper-evident evidence before every state-changing
  release step; and
- explicit founder authorization for publication, deployment, migration,
  traffic promotion, and rollback.

Required environment reviewers and self-review prevention remain disabled while
there is only one qualified operator. Enabling them now would either create a
fake control or deadlock releases because
[GitHub prevents the initiating user from approving when self-review prevention is enabled](https://docs.github.com/en/enterprise-cloud@latest/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers).
Add those controls when a second qualified human joins.

## Hard stop gates

Do not transfer the repository until all three gates pass:

1. GitHub Enterprise billing is activated on a durable paid plan.
2. Solo-founder account recovery is verified against the requirements above.
3. The pre-transfer backup, inventory, and release-freeze procedure is ready to
   run from the exact current `main` commit.

Do not add a placeholder, shared account, bot, or service identity to simulate
ownership continuity or independent review.

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
9. Restrict every protected deployment environment to `main` and preserve its
   exact workflow and authorization gates. Do not configure a required reviewer
   until a second qualified human can provide genuine separation of duties.
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
