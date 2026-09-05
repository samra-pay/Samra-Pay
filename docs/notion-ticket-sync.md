# Notion ticket sync

Syncs existing development tickets in the Samrapay Tasks data source from their
exact GitHub PR URL. Runs every 15 minutes (GitHub schedules may be delayed) and
on demand. No paid Notion native integration or third-party service is used.
GitHub Actions usage is subject to the repository's existing minutes allowance.

## Activation

1. For ticket sync alone, create an internal Notion integration in the Samrapay
   workspace with Read content and Update content only, and share only Tasks.
   The optional [progress reporting extension](notion-reporting.md) needs Insert
   content and its explicitly listed source databases. Neither mode needs
   comments or user-information capabilities.
2. Store the integration token as the repository Actions secret `NOTION_TOKEN`.
   Enter it directly in GitHub settings; never paste it into a ticket or chat.
3. Merge the reviewed integration PR. Add repository variable
   `NOTION_SYNC_ENABLED=true`.
4. Run **Notion ticket sync** on main with `apply=false` to verify access.
5. Run with `apply=true`, then inspect SAM-4 and SAM-5 in Notion. Record the run
   URL as connection evidence. Subsequent scheduled runs apply automatically.

The Tasks data source must contain `GitHub sync` (text), `GitHub PR` (URL),
`Development` (checkbox), and `Status` (select). The script validates these.

## Daily use and boundaries

Create a ticket before building. Paste the PR URL in GitHub PR and check Development.
Ticket IDs in PR descriptions are useful references but are not auto-discovered
by this version. No ticket is created automatically.

The separately enabled reporting extension discovers PRs and records source
creation/completion events. It reuses this workflow's existing 15-minute schedule.
It does not create a second engineering task board. Set `reporting=true` on a
manual run to verify the extension while its schedule flag remains disabled.

- Draft PR: Building. Open PR: Review.
- Merged PR: Ready to release only with a successful Linux quality gate and no
  failed or pending reported check/status on the PR head.
- Closed without merge: preserve status and record the next decision.
- Released: preserve status. This sync never asserts production deployment.
- Manual Blocked, Needs me, next actions, acceptance criteria, and release
  evidence are never overwritten. GitHub sync holds automation-specific results.

This evaluates reported PR-head checks, not branch protection or production
readiness. Release approval, merge-commit verification and production probes
remain separate. A scheduled staging probe is not proof of a public release.

Only main executes this credential-bearing workflow. It does not consume PR
code, artifacts, shell text, or external URLs. GitHub permissions are read-only.
Missing credentials, wrong schema, incomplete checks, HTTP failures and redirects
fail the run without logging response bodies. Rerun after fixing access or rate
limits. Updates are idempotent and a failed run can be safely retried.

Disable by setting `NOTION_SYNC_ENABLED=false`; revoke the integration and remove
the secret to disconnect. Existing tickets are retained.

References: https://developers.notion.com/reference/query-a-data-source and
https://docs.github.com/en/actions/reference/security/secure-use
