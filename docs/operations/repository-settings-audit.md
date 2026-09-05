# Read-only GitHub merge settings audit

The repository validator checks workflow source. This auditor checks GitHub's
effective rules for `main` against the existing
[repository control contract](../testing/repository-controls.json). It does not
change GitHub settings or activate the
[prepared Enterprise migration](github-enterprise-control-plane-migration.md).

## Run and retain evidence

Use Node 24 and the already-authorized GitHub CLI session. Review the exact
current `main` SHA, then run from the repository root:

```sh
pnpm run audit:repository-settings --expected-sha <full-reviewed-main-SHA>
```

For a JSON-only evidence file, invoke Node directly and redirect stdout to an
evidence location outside the checkout:

```sh
node scripts/src/audit-repository-settings.ts --expected-sha <full-reviewed-main-SHA> > /absolute/evidence/path/repository-settings.json
```

Exit `0` means all audited metadata controls were satisfied. Exit `2` means
the report is blocked by a missing or unverified control. Exit `1` means the
local invocation or policy could not be evaluated. Do not suppress a nonzero
exit or treat a blocked report as successful enforcement evidence.

The target repository, stable repository ID, and owner ID come from the active
authority in the existing
[migration contract](../../deploy/gcp/staging-github-enterprise-migration.json).
The target cannot be redirected with a CLI option. An authorized transfer must
update that contract through its existing migration process.

The JSON records the supplied SHA, timestamps, policy and auditor hashes,
ruleset IDs, individual control results, and hashes of API observations.
Responses and raw CLI errors are not retained; a failed read records only its
HTTP status when available. Retain the reviewed auditor commit alongside the
report. Response hashes are integrity references, not independently replayable
proof of response contents or signed GitHub attestations.

## What the result establishes

The auditor uses GET requests to GitHub's repository metadata, branch metadata,
effective branch rules, and each applicable ruleset's details. It checks:

- The exact private repository, owner, default branch, and reviewed `main` SHA.
- A protected branch and stable effective rules across repeated observations.
- Required pull requests and merge queue, with force pushes and deletion blocked.
- Both required check names with strict up-to-date enforcement.
- Active repository or inherited rulesets with visible, empty bypass lists.

GitHub's [effective branch rules API](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28#get-rules-for-a-branch)
includes active inherited rules and excludes disabled/evaluate rules. The audit
handles pagination and refuses malformed or incomplete evidence. It limits
detail reads to 30 applicable rulesets and blocks if that bound is exceeded.

GitHub [omits bypass actors when the caller cannot inspect them](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28#get-a-repository-ruleset).
An absent field is unverified, never an empty list. Use an already-authorized
maintainer's read-only invocation if visibility is insufficient; do not create
broader credentials or change permissions just to make the result green.

The result is a point-in-time metadata assessment, not an atomic snapshot or
guarantee of future settings. It does not verify check results, check app binding,
independent review, payment status, cloud federation, deployment, or production
readiness. Legacy branch protection alone cannot satisfy the required merge
queue/ruleset contract. Keep exact-candidate CI evidence and release approval
separate.

## Current activation decision

The [recorded enforcement gap](repository-merge-controls.md) remains a platform
decision. GitHub documents private-repository merge queues as an
[organization feature on Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
A personal Pro upgrade alone does not satisfy this repository's full policy.

Follow the existing migration gates: verify current paid Enterprise entitlement,
account recovery, backup/freeze evidence, explicit transfer authorization, and
the planned single-owner cloud federation cutover. Historical billing or
recovery observations are not current evidence. After authorized activation,
retain a fresh unblocked audit and separate exact-SHA CI results before claiming
GitHub enforcement. This command grants no authority to purchase, transfer,
change visibility, or apply cloud changes.
