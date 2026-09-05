# Automatic progress reporting

The [Progress & Results dashboard](https://app.notion.com/p/3d214b38426681739d2ecd2c9d347cef)
shows work created and completed by week, month, and quarter. GitHub remains the
engineering source; Notion business work is updated once on its original record.
The dashboard summarizes these sources and links each captured event back to one.

## Current activation state

The Notion databases and views are built. The reporting extension is opt-in and
has not been verified with the scheduled integration. The existing ticket sync
continues unchanged unless reporting is explicitly enabled. A green test or merged
PR does not mean reporting is active; require a successful apply run and Notion
readback. Do not populate Last success by hand.

## One-time setup

Reuse the existing internal Notion integration and `NOTION_TOKEN` repository
secret. No new token, paid Notion automation, external service, or laptop process
is required. The existing GitHub Actions minutes allowance still applies.

1. Grant the existing integration Read content, Update content, and Insert content.
   Insert is required for new events, periods, and merged PR entries. Do not add
   comments, user-information access, public sharing, or access to all Samra HQ.
2. Connect only the databases listed below. Tasks is already connected. Connect
   source databases directly, not their broad parent pages; keep private Finance
   outside the scope. The integration can read content within these connected
   databases even though the collector only processes properties and metadata.
3. Merge the reviewed reporting PR after required checks pass.
4. On the existing **Notion ticket sync** workflow, choose main and run with
   `reporting=true`, `apply=false`. This checks every schema, reads all pages and
   PRs, and plans the baseline without writing anything. A dry run does not prove
   Insert capability; the first apply confirms it.
5. Run main with `reporting=true`, `apply=true`. Inspect Capture health and the
   three current period rows. The first apply establishes Monitoring since and
   baselines existing Notion states without creating fake historical completions.
6. Create one clearly labeled disposable business task after the baseline,
   assigned to David, with Business status Ready. Run capture; verify one Created
   event. Set that task to Done and run again; verify one Completed event. Repeat
   the run and confirm no duplicate. Keep this verification record labeled as a
   capture test, or remove its test events and task through Notion's normal trash
   flow and rerun so period totals exclude them. Do not use a real task as a test.
7. Set repository variable `NOTION_REPORTING_ENABLED=true`. Keep the already
   enabled `NOTION_SYNC_ENABLED=true`. Confirm a later scheduled run advances
   Last success. The existing cadence is 7, 22, 37, and 52 minutes past each hour;
   GitHub may delay schedules. The workflow runs independently of the laptop.

| Database | Data source |
| --- | --- |
| [Tasks](https://app.notion.com/p/3d114b384266806ca116c5cc76d618f8) | `3d114b38-4266-805a-832d-000b268a539e` |
| [Projects](https://app.notion.com/p/3d114b3842668044a219f6ed83c9586d) | `3d114b38-4266-8014-9c2a-000b980374c8` |
| [Roadmap](https://app.notion.com/p/3d114b3842668001852ac7797c2273da) | `3d114b38-4266-804d-bbe3-000b534dd87e` |
| [Docs](https://app.notion.com/p/3d114b384266804a8daddfc6922c6ea5) | `3d114b38-4266-8082-982c-000b9cb33bac` |
| [Meetings](https://app.notion.com/p/3d114b3842668049ae41e3adef680af2) | `3d114b38-4266-80e4-bb0e-000ba90d4bf1` |
| [Partners](https://app.notion.com/p/b7c89112b9e24653a2044f9b61e1b4b8) | `e8d79903-0268-4207-98f6-df199e3fd257` |
| [Readiness & Risk](https://app.notion.com/p/2d3b02fa6ee14357842d6a2d305c1495) | `3fcb47ed-b63e-4cb5-a414-a6bb8c3d091a` |
| [Completed PRs](https://app.notion.com/p/da7b455bf56940d2b9f317535a8e177a) | `a012a087-f698-4d69-b170-f247244b060f` |
| [Activity log](https://app.notion.com/p/002662de9f1a40d6b5397c67b1101989) | `a38473c0-ebba-4f04-9aee-1d22eb51ce8b` |
| [Reporting periods](https://app.notion.com/p/3c90c3596e4245498f4d366407fe4fd5) | `696e5d1f-becf-44a1-8559-02e528d37928` |
| [Capture health](https://app.notion.com/p/e4acafb36bb5499db8cd26ddce12b724) | `db6cd4b6-115b-472e-92a1-51b9cfb54547` |

## What is captured

- New records in the seven source databases use Notion's canonical `created_time`.
  New same-repository PRs targeting main use GitHub's `created_at`.
- Business Tasks: Business status Done. Development Tasks: Released plus nonempty
  Release evidence, recorded as **Release recorded**, not business completion.
- Projects: Stage Complete. Roadmap: literal Status Completed; Notion's broader
  complete status group also contains On Hold and Cancelled, which are excluded.
- Docs: Status Done. Reference and Needs review Tasks/Docs do not count as completed.
- Readiness: Type Gate, Status Cleared, and an Evidence link or Acceptance evidence.
  A closed risk does not become a cleared gate. A recorded gate/release is a source
  declaration, not an independent audit of its evidence.
- Meetings and Partners: creation only. No meeting held, signed contract, revenue,
  transaction, or customer outcome is inferred from creating a record.
- PR merges use `merged_at` and a verified-shaped merge SHA. New merges are
  upserted into Completed PRs by exact GitHub PR URL. Existing manual Area,
  Task relations, Release check and page content are preserved on updates.
  New entries link matching existing tasks without manufacturing another task.
- New reporting rows belong to David. Blank source Owner/Lead is filled with
  David; an explicit existing assignment is retained.

Notion completion transitions use **first observed** time. A poll cannot guarantee
that transient states or a created-and-deleted record between polls are captured.
Reopened includes leaving completion, cancellation after completion, or removing
required evidence. Events remain a history of declarations, not a claim that the
source is still complete today. Follow its source link for its current state.

Each period metric counts unique records with that event in that period. Rework
does not double-count a record in one period, but the same record can appear in
different periods. Reopen counts are separate. Do not sum different work types or
assume quarterly unique totals equal summed weekly unique totals.

## Reliability and boundaries

All source and output schemas are validated before capture. Queries are paginated;
unexpected sources, duplicate keys, corrupt state, and incomplete responses fail
the run. GitHub PR bodies and arbitrary URLs are never executed or fetched.
Requests use fixed API origins, redirect rejection, timeouts, a Notion request
queue, and bounded rate-limit retries. No credential, response body, page body,
customer data, or finance record is logged.

The workflow's existing concurrency group permits one writer. Stable event keys
and saved completion cycles prevent duplicate counts on retries. An ambiguous
create response fails the run instead of immediately replaying the POST; the next
run queries existing keys first. Notion does not offer a transaction across all
these pages. A failed run may leave some events or totals updated; trust totals
only when Capture health is Healthy with a recent Last success.

The state cursor advances only after events, merged PRs, owners, and periods are
written. First-period coverage and periods intersecting a gap over 45 minutes are
marked Partial. Periods in progress are Partial. Earlier unknown periods are not
invented as zero. Weeks begin Monday in America/New_York, with calendar months and
quarters; UTC boundaries account for daylight saving time.

The Cursor property stores compact prior states and gap ranges. Keep it intact.
The bounded first version refuses state above 180,000 characters or a query over
100 pages instead of silently truncating. At that scale, partition capture state
and event queries before increasing limits. It currently scans all captured events
and PRs; this is sized for the solo operation, not an unbounded event warehouse.

The native Freshness formula displays Stale after 45 minutes without a success.
If access or the workflow is disabled, this indicator still ages without a writer.
GitHub failures remain visible in the existing workflow; no new messages to other
people or notification services are created.

## Disable and recover

Set `NOTION_REPORTING_ENABLED=false` to stop scheduled reporting while retaining
the original ticket sync. No Notion history is deleted. To disconnect entirely,
also disable `NOTION_SYNC_ENABLED` and revoke the integration through its existing
settings. Do not reset Last success or Cursor to bypass a failure. Fix access or
schema, restore damaged state from a known record, and retry main with reporting
enabled explicitly. Review period coverage after a long outage.

Validation: `node --test scripts/notion/*.test.mjs`. The same tests run in the
credential-free Linux CI job and before every scheduled sync.

References: [Notion request limits](https://developers.notion.com/reference/request-limits),
[data-source queries](https://developers.notion.com/reference/query-a-data-source),
[GitHub pull requests](https://docs.github.com/en/rest/pulls/pulls).
