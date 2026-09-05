# GitHub Enterprise control-plane migration

## Current state

On 2026-09-05 David approved the GitHub transfer and main protection package.
The private repository is now `samra-pay/Samra-Pay`, stable repository ID
`1335175962`, owner ID `320532147`. Permanent main ruleset `22344977` was
verified active. The [dated execution record](enterprise-transfer-2026-09-05.md)
contains the transfer, recovery, protection and release-freeze evidence.

Version 2 of the [migration contract](../../deploy/gcp/staging-github-enterprise-migration.json)
separates completed GitHub transfer from pending Google trust cutover. Source
contracts, recovery provenance and Notion tooling use the organization identity.
This is a source change: Google trust has not been applied and release workflows
have not been resumed.

Paid Enterprise and account recovery were verified before transfer. External
recovery-code storage is David's attestation; no recovery codes were accessed.
The 2026-08-24 personal-owner, trial and blocked-recovery snapshot is preserved
in the contract's `history`. Do not repeat the completed transfer.

## Source inventory and regression checks

The earlier 69-file deployment inventory missed recovery and Notion ownership
checks. The validator now scans the whole source repository, excluding generated
directories and binary files. It checks plain and escaped repository names,
former owner IDs and explicit owner assignments.

Four fixed migration-control files retain historical identity constants and
negative tests. Other historical references require exact individual lines and
reasons in the contract; an exception never exempts the rest of its file. The
sorted current-authority inventory must match the scan. Tests cover new source
roots, wrong owner IDs, historical exceptions and premature release activation.
Original pre-transfer evidence URLs remain unchanged.

## Solo-founder governance

David is the sole qualified owner. Do not add placeholder owners or claim
independent review. Main requires pull requests, Required CI, Required security
and merge queue, with no bypass, force push or deletion. Existing environment
reviewer settings remain unchanged.

Future release authorization must retain exact SHA and digest, repository and
owner IDs, ref, event, workflow, environment, secret versions, spend bound,
cleanup and traffic scope. Source validation and merged code grant no additional
cloud, provider, database or release authority.

## Remaining cutover sequence

1. Pass source/federation, recovery, preview and Notion tests, plus candidate CI
   and security. Review the candidate and merge through the queue. The standard
   repository-settings auditor now targets the organization without an override.
2. Inventory every applicable Google provider, pool and service-account binding.
   The older six-boundary plan is incomplete: include staging migrations and
   assess proposed preview federation separately before any activation.
3. Prepare exact single-owner trust patches with repository and owner IDs, ref,
   event, workflow and environment restrictions intact. Obtain bounded cloud
   approval, then apply and read back one authorized boundary at a time. Do not
   introduce wildcard or dual-owner trust.
4. Audit Actions, environment and integration metadata. Coordinate Qase changes
   with PR #175. Before Notion resumption, reconcile historical PR URLs, event
   keys and merged-row keys in the existing data source so the namespace change
   cannot skip tickets or create duplicates. Do not mutate Notion automatically.
5. Resolve the configured 365-day release-evidence policy against the observed
   90-day Actions retention limit without silently shortening the policy. Retain
   fresh read-only audits and exact-SHA release evidence before requesting
   bounded release resumption.

All nine release/sync workflows remain paused. Operational, staging, provider,
database, customer activation and production traffic gates remain separate.
Proposed preview infrastructure is not a prerequisite for GitHub governance.

## Verification commands

Run from the repository root:

```sh
node deploy/gcp/review-staging-github-enterprise-migration.mjs --review
node --test deploy/gcp/staging-github-enterprise-migration.test.mjs
pnpm run test:gcp-platform
node scripts/src/audit-repository-settings.ts --expected-sha <reviewed-main-SHA>
```

The first three commands perform offline validation. The final command reads
live GitHub metadata using the existing authorized session. None applies cloud
trust, enables workflows, publishes images, migrates a database or moves traffic.
