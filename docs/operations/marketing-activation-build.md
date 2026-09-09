# Verified marketing activation build

Prepared September 9, 2026. Code and synthetic validation only; no cloud resources, shared database, provider audiences, mailboxes, or public traffic are changed by this PR.

## Data flow

The release setting `VITE_SAMRA_VERIFIED_LEADS_ENABLED=true` switches the existing form to the verified lead endpoint and publishes the matching English/Amharic privacy text. The default remains the existing waitlist. Advertising permission is optional, unchecked, and independent of email. GPC/DNT suppress the browser advertising choice; GPC also overrides the server request. Current-page social labels are attached only after analytics consent. There is no anonymous identity enrichment, fingerprinting, or historical identity stitching.

The confirmation email contains a single-use, expiring fragment token and a separate withdrawal-only preference capability. GET does not confirm or withdraw. The pages have no analytics and prohibit referrers, framing and third-party resources. Confirmation requires an explicit action; advertising also requires a second unchecked choice. Preference links last 180 days and can stop advertising matching alone or all updates. Invalid/expired links direct the user to support through the privacy page. No public endpoint accepts a contact UUID as authority.

Samra's database is the source of permission. Resend delivers verification emails and receives verified contacts in an explicitly configured dedicated segment/topic. Existing Resend suppression/unsubscribe is checked before delivery and contact sync and is never reversed automatically. Full withdrawal is propagated to Resend. Do not run campaigns from the old unverified segment. Email opens, clicks and delivery do not qualify a lead or grant advertising permission.

Resend events are verified using pinned Svix 2.3.0 and the raw body before JSON parsing. A durable receipt stores only event type and hashes, not the payload. Bounce, complaint, contact unsubscribe and suppression can reduce permissions; provider events cannot restore them. Account-wide suppression is intentionally conservative, including for an address not yet registered. Signed events arriving before signup therefore prevent later confirmation mail. Only subscribe this endpoint to the documented necessary event types.

## Audience state and recovery

The versioned sync queue covers Resend, Meta and Google independently. A change to email/advertising permission queues the relevant desired state. Workers recheck current permission under the same contact lock used by withdrawal. Meta gets SHA-256 email only. Google uses Data Manager with provider-specific normalization, consent fields and an exact destination. No ethnicity, immigration status, KYC, balances, payment history or inferred hardship is exported. This is a **verified and permissioned email audience**, not proof of financial-product eligibility or valuable acquisition.

Use `marketing_audience_sync.acknowledged_revision` and state for provider completion. The foundation's `marketing_audience_removals` table retains withdrawal requests; this runtime does not advance that legacy table's completion counter.

A committed submission intent precedes the network call. Meta's receipt means the upload was accepted, not that a person matched or saw an ad. Google returns a request ID and stays pending until destination-specific status succeeds. Partial success and warnings do not count as completion. A withdrawal during a pending add waits for its resolution, then removes the member. Unknown outcomes cannot be blindly replayed because a late add could defeat a subsequent removal.

Timeouts and crashed submissions enter `uncertain`. Provider-blocked/uncertain rows require a trusted operator to inspect the exact request and call `reconcileAudience` with contact, destination, submitted revision, accepted/not-applied disposition and a SHA-256 digest of the reviewed evidence. Keep the evidence and operator audit in the private incident record; never include email or tokens in GitHub. This method is intentionally not exposed over public HTTP. It rejects stale revisions and writes an immutable reconciliation record. Do not declare not-applied merely because a user is not visibly matched.

The `metrics` command emits aggregate counts and destination/state backlog only. `registered`, `verified`, `email_active`, and `advertising_allowed` are separate measures. Monitor pending age, uncertain/blocked operations, exhausted verification attempts and provider authentication failures. Any overdue removal needs operator attention. No promise of provider removal latency or individual matching is made.

## Runtime and configuration

The existing launch-updates package now builds a standalone Node 24 bundle:

- `pnpm --filter @workspace/launch-updates build`
- `node lib/launch-updates/dist/marketing-entry.mjs server`
- `node lib/launch-updates/dist/marketing-entry.mjs worker` — one bounded pass; schedule explicitly after activation.
- `node lib/launch-updates/dist/marketing-entry.mjs metrics` — trusted operator/job only.

Use `lib/launch-updates/Dockerfile.marketing` with repository-root context. It copies only the bundled runtime into a non-root final image. No migration runs at startup. Local Docker is unavailable in the current authoring environment; container acceptance remains a CI/release check.

Required configuration is injected from reviewed Secret Manager versions, never Vite or public config:

| Setting                                                                                                      | Meaning                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `SAMRA_MARKETING_MODE=verified`                                                                              | Explicit runtime activation; disabled fails closed                                                            |
| `SAMRA_CLOUD_PROJECT_ID=samra-pay-production`                                                                | Exact project boundary                                                                                        |
| `K_SERVICE=samra-launch-updates` or `CLOUD_RUN_JOB=samra-marketing-worker`                                   | Runtime-provided service/job identity                                                                         |
| `SAMRA_MARKETING_DATABASE_URL`, `SAMRA_MARKETING_DATABASE_CA`                                                | Separate marketing role, verified TLS; connection-string query overrides rejected                             |
| `SAMRA_MARKETING_TOKEN_KEYS`, `SAMRA_MARKETING_TOKEN_KEY_VERSION`                                            | JSON version-to-base64 secrets, minimum 32 random bytes; retained versions for outstanding links              |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`                                                                    | Scoped provider and endpoint credentials                                                                      |
| `SAMRA_EMAIL_TRACKING_DISABLED=true`                                                                         | Attestation after verifying click/open tracking disabled in provider settings                                 |
| `SAMRA_RESEND_VERIFIED_SEGMENT_ID`, `SAMRA_RESEND_VERIFIED_TOPIC_ID`                                         | Dedicated verified marketing segment/topic, no existing unverified import                                     |
| `SAMRA_META_SYNC_ENABLED=true`                                                                               | Separate Meta activation; omitted means disabled                                                              |
| `SAMRA_META_AUDIENCE_ID`, `SAMRA_META_API_VERSION`, `META_ACCESS_TOKEN`, `SAMRA_META_TERMS_ACCEPTED=true`    | Reviewed exact audience/version, scoped credential and prior terms acceptance                                 |
| `SAMRA_GOOGLE_SYNC_ENABLED=true`                                                                             | Separate Google activation; omitted means disabled                                                            |
| `SAMRA_GOOGLE_ADS_ACCOUNT_ID`, `SAMRA_GOOGLE_AUDIENCE_ID`, `SAMRA_GOOGLE_CUSTOMER_MATCH_TERMS_ACCEPTED=true` | Reviewed destination, account eligibility and prior terms acceptance                                          |
| `GOOGLE_MARKETING_CLIENT_ID`, `GOOGLE_MARKETING_CLIENT_SECRET`, `GOOGLE_MARKETING_REFRESH_TOKEN`             | Owner-granted offline OAuth access for `https://www.googleapis.com/auth/datamanager`; in-memory refresh/cache |

The configuration flags attest to reviewed facts; setting one does not prove provider eligibility, create an audience, disable provider tracking or accept terms on the owner's behalf. Token rotation must retain old keys through the preference-link lifetime or intentionally invalidate old links with a support procedure.

## Release sequence

1. Merge reviewed exact-candidate code only after required CI/security. Keep PRs #204 (social attribution), #206 (form measurement) and #208 (foundation) distinct; this build extends #208 without silently merging the other PRs.
2. Resolve the public website release source; current main is not evidence of the currently deployed design. Prepare the exact source SHA, bundle/image digest and rollback revision.
3. Apply reviewed migration 0020 using the existing separate migration process. Provision a role limited to the marketing tables and schema usage; no ledger/customer/workforce access. Runtime needs SELECT/INSERT on permission/event/reconciliation history, SELECT/INSERT/UPDATE on marketing profiles/receipts/challenges/sync/removals/limits/suppression/contacts, and no table ownership or history UPDATE/DELETE. Provision TLS and least-privilege secrets through existing cloud controls.
4. Configure the dedicated Resend verified segment/topic, signing secret and tracking settings. Wire `/confirm-email`, `/email-preferences`, `/api/v1/marketing-leads`, `/api/v1/marketing-leads/confirm`, `/api/v1/marketing-leads/preferences`, and `/api/v1/marketing-leads/resend-webhook` to this service. Keep unrelated routes inaccessible. Add perimeter abuse controls; database budgets are global minute caps, not a replacement for edge protection. Do not trust caller-supplied forwarding headers as identity.
5. With an explicitly approved mailbox, prove delivery, confirmation, distinct choices, unsubscribe and signed callback processing. Then enable the public form flag and matching privacy text in the same reviewed release. Existing contacts remain unverified.
6. Separately verify advertising account eligibility, terms, credentials and audience destination. Test each provider with an approved synthetic/test member, read back acceptance/removal, then activate its sync. Schedule and monitor the worker with always-available execution, not an in-process timer on request-only Cloud Run CPU. No ad campaign or spend is created here.

Retention/deletion policy and a governed private support process must be settled before customer activation; append-only consent evidence cannot be silently deleted by the runtime. The aggregate metrics command is operational evidence, not yet a revenue/CAC dashboard. Campaign cost ingestion and post-launch financial-product conversion events are separate work.

## Local validation

Passed: 100 launch-updates unit tests, 12 database unit tests, 21 PostgreSQL lifecycle tests and one full synthetic HTTP/provider flow; 263 website tests; TypeScript compilation; API regeneration; default and enabled public builds; frozen dependency installation; action-pin, migration-policy and repository controls. All 21 migrations applied to a fresh disposable local database. English and Amharic consent forms were visually inspected locally. The bundled runtime exits disabled without configuration. Docker is unavailable locally; the PR adds an isolated CI image check. These checks do not establish actual email delivery, audience matching or production deployment.

## Primary interface references

- [Resend signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests) and [event types](https://resend.com/docs/webhooks/event-types).
- [Google Data Manager ingestion](https://developers.google.com/data-manager/api/reference/rest/v1/audienceMembers/ingest), [removal](https://developers.google.com/data-manager/api/reference/rest/v1/audienceMembers/remove), and [request status](https://developers.google.com/data-manager/api/reference/rest/v1/requestStatus/retrieve).
- [Google OAuth offline access](https://developers.google.com/identity/protocols/oauth2/web-server#offline).
- [Meta's official Custom Audience SDK source](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/custom-audience.js). Meta's guide returned HTTP 429 during research; confirm the exact current API version/response contract during the approved provider acceptance test.
