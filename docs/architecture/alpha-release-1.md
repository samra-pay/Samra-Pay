# Activate invite-only alpha onboarding: Auth0, Persona, and wallet creation

Decision owner: David Haile. Product scope accepted in the main task on
2026-09-06. Baseline inspected: `samra-pay/Samra-Pay` main
`1b8d8ed8cee340b61ff604b5127a7aba74169d8c`. Admission implementation merged in
[#188](https://github.com/samra-pay/Samra-Pay/pull/188), main
`854d490499110c90716ea46f4f790ad67f10bd2d`;
**production activation and the live alpha remain blocked**.

Alpha support owner: **David Haile**, explicitly accepted in the main task on
2026-09-06. This resolves support ownership. Coverage hours, backup coverage,
paging destination and successful alert-delivery/acknowledgement evidence remain
pending before rollout; this assignment does not establish a staffed rotation.

## Release outcome and boundaries

Up to 100 invited users can register, sign in, complete KYC, and create a
production wallet durably linked to their Samra account. Logout and later
login return to the same account and wallet. Auth0 handles registration,
login, logout and account recovery. Persona supplies KYC evidence; Samra
persists and enforces pending, approved and rejected outcomes (the existing
internal rejected state is named `declined`). Crossmint supplies a wallet
under the agreed customer-controlled model: customer passkey signing and
customer-controlled recovery. No server signing or recovery shortcut.

Deposits, transfers, funding and payouts are unavailable in Release 1. Real
deposits belong to a subsequent release. Existing financial invariants remain
intact, but selecting funding/payout providers is outside this milestone's
implementation path. A merged PR, sandbox wallet or healthy deployment is
not evidence of a live production alpha.

## Reuse and implementation scope

| Area | Reuse from current main | Work required for this milestone |
| --- | --- | --- |
| Identity | Auth0 JWT issuer/audience/RS256 validation, Samra identity mapping, web/mobile session and onboarding clients, Universal Login handoff | Configure managed invitations and recovery; verify exact production tenant/application/connection, callback/logout/origin and API audience; adapt customer entry/error copy to invited access |
| KYC | Durable case, signed/deduplicated webhook events, terminal-state handling, bounded sandbox adapter | Production adapter/configuration, approved template and consent, customer-facing managed Persona inquiry/resume flow; persist outcomes before wallet eligibility |
| Wallet | Samra wallet/mapping uniqueness, durable provider request key, conflict restriction, bounded creation failures and restart/retry handling | Approved production chain/configuration and Crossmint owner authentication; customer passkey/recovery enrollment and proof; production consent and durable mapping migration; keep creation and any signing authority separate |
| Admission | Merged #188: durable identity-bound invitations, atomic admission and lifetime 100-customer cap | Restricted staging grants and real-role tests are implemented in the follow-up; applying/auditing grants and production operator provisioning remain activation work |
| Release boundary | Merged #188: opt-in account/onboarding-only API profile; workers, operations and developer controls disabled | Verify the deployed API and customer UI expose only Release 1 capabilities |
| Delivery/operations | GitHub CI/security/merge queue, PostgreSQL gates, GCP runtime and migration foundations, existing readiness validator | Use existing deployment/migration paths and exact-SHA evidence; connect managed telemetry, alerts, support paging and restore/rollback proof for the actual customer service |

Open PRs inspected on 2026-09-06: [#156](https://github.com/samra-pay/Samra-Pay/pull/156)
contains safeguards for a dormant wallet adapter; its passkey approval helper
is preparation for later transfers, not a production enrollment integration.
[#174](https://github.com/samra-pay/Samra-Pay/pull/174) supplies Auth0 brand assets.
Neither is a prerequisite for the admission code here. Other open product PRs
cover public imagery/waitlist or test reporting. Reuse their relevant work when
needed; do not stack unrelated PRs or merge dependency upgrades for this scope.

## Admission implementation

`SAMRA_RELEASE_PROFILE=alpha-release-1` requires Auth0 and PostgreSQL, disables
workers, operations and developer controls, and exposes only `/me` and the
existing onboarding, consent, identity and wallet methods. Health/readiness
and the separately authenticated Persona webhook remain available. Unknown or
financial routes return 404, including for previously activated customers.
Client claims, body fields, email and demo identity headers grant no eligibility.
Default configuration remains the existing disabled/demo boundary. This profile
does not implement or enable a production provider mode.

Migration `0018_alpha_release_admission` adds three tables. A singleton control
row starts with admission limit **0**. Its permitted values are 0, 1, 5, 25 and
100. Invitations bind to one exact normalized Auth0 issuer and subject, have an
expiry and can be revoked. Admission, Samra customer creation, identity binding
and audit commit or roll back together. One database row lock serializes new
admissions across instances. Unique, immutable slots 1–100 and unique customer
and invitation mappings enforce the lifetime cap. Revocation/closure does not
free a slot. Retrying with a different HTTP idempotency key still resumes the
same account. A pre-bound identity without an onboarding record must consent;
it does not acquire legacy financial activation.

Invitation expiry prevents first admission; it does not lock out an already
admitted user. Lowering the limit to 0 pauses new admission while retaining
returning-user access. Revocation blocks subsequent requests. Already in-flight
provider work may finish and must retain its durable result for reconciliation.
Suspended/closed customers and revoked Auth0 mappings remain denied.

Prefer [Auth0's managed invitation workflow](https://auth0.com/docs/customize/email/send-email-invitations-for-application-signup):
reserve a database-connection user, record the exact issuer/subject eligibility
privately, and let that user set their own password through the hosted flow.
Delivery, verified-email behavior and recovery require acceptance before use.
Do not put emails, invitation links, passwords or tenant credentials in Git or
test output. No invitation email is sent and no live identity is created by
this PR. There is no public invitation-management API or reusable bearer code.

Migration safety: additive objects only; no startup migration or backfill of
existing users. Apply through the existing migration producer with admission
closed. Provision invitations through bounded operator access, never customer
HTTP. Record operator changes with sanitized audit evidence. Review runtime
grants so it can consume admission without granting invitations or raising the
limit. The staging grant finalizer now restricts invitations and cohort controls
to reads plus updates on their immutable ID columns, which PostgreSQL requires
for the existing row locks. Constraints reject changes to those IDs. Admissions
permit SELECT/INSERT only. Runtime cannot change eligibility, expiry, revocation,
the cap or admission history. Audits check both the group role and login,
including direct/column grants, and future tables deny runtime access until
reviewed grant finalization. Disposable real-role tests cover denied writes,
concurrent admission, operator-lock exclusion, rollback, restart, revocation and
permission-drift detection. These are implementation checks; cloud/production
grants still require application and read-back. An older unrestricted demo image is not an
acceptable production rollback target. Roll back to the prior approved gated
image or disable customer traffic; retain admission history and wallet mappings.

## Exact activation blockers

| Boundary | Missing configuration or evidence |
| --- | --- |
| Runtime | `BackendMode` supports only `disabled`/`demo`. `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` accepts only `fake`/`persona-sandbox`; wallet mode accepts only `fake`/`crossmint-sandbox-customer`. Production modes, truthful production response/consent contracts and deployed customer flow must be implemented, not obtained by renaming a sandbox flag |
| Auth0 | Read back `AUTH0_ISSUER_BASE_URL`, `AUTH0_AUDIENCE`, customer `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, customer/API origins, connection signup policy, managed invitation/password recovery email delivery, callback/logout/origin lists and account-isolation behavior. Native configuration/device acceptance is additionally required if mobile is included in the first cohort |
| Persona | Production project/environment, approved `PERSONA_INQUIRY_TEMPLATE_ID` and `PERSONA_ENVIRONMENT_ID`, API version, least-privilege `PERSONA_API_KEY`, current/rotating `PERSONA_WEBHOOK_SECRET` exact Secret Manager versions, callback URL, inquiry/session launch mechanism and authenticated webhook read-back. Current consent and response labels are non-production; no production KYC data may enter CI |
| Crossmint | Production project, chain/network and wallet configuration version, creation-only credential scope and exact secret version, allowed application origins, per-user owner authentication, customer passkey enrollment and customer-controlled recovery evidence. Current `CROSSMINT_SANDBOX_CUSTOMER_ID`/`CROSSMINT_SANDBOX_RECOVERY_EMAIL` are single-tester staging configuration, not a multi-user production design |
| GCP/database | Exact runtime identity/revision/image digest and production database secret version, TLS/private connectivity, migrated schema, runtime/operator privilege tests and bounded operator invitation provisioning. The dated 2026-09-06 16:27 UTC read-only record found no staging service/jobs and no version for `samra-staging-database-url`; this is historical metadata, not a current provider-console audit |
| Operations/data | Support owner David Haile confirmed; coverage, paging configuration and exercised alert route remain pending; approved production consent, privacy/retention/deletion/access policy; measured service indicators and provider-failure alerts; isolated cloud restore and rollback proof. `docs/operations/operational-readiness.json` remains blocked |

The current GitHub metadata read-back found only `NOTION_SYNC_ENABLED` among
repository variable names and no variables in `staging-zero-traffic-deployment`
or `production-foundation-review`. Existing protected environments are foundation
and staging delivery environments; there is no environment named `production`
or `staging`. These observations do not prove absence of provider configuration
or Secret Manager payloads. Secret values were not read. Collect exact versions
and provider-console metadata under the release's existing bounded approval;
do not ask for credentials in chat.

## Acceptance and delivery sequence

1. **Admission foundation merged in #188; review the runtime-grant follow-up.** Run existing API/unit, migration-policy,
   PostgreSQL persistence and HTTP gates. New tests cover closed/uninvited/
   expired/revoked eligibility, forged account claims, competing instances,
   rollback, changed retry keys, restart, cohort limits, lifetime cap, immutable
   history, account suspension and blocked money/developer/operations routes.
2. **Complete the connected customer journey.** In one dependent implementation
   PR where practical, finish production provider modes, managed KYC launch,
   customer-controlled wallet enrollment, legal response contracts and the
   customer completion screen. Reuse existing sandbox and synthetic tests.
   Sandbox success is prerequisite evidence, not production acceptance.
3. **Prove one production invited user.** Exact SHA/digest, configuration and
   secret versions; login → consent → KYC approved → wallet; sign out, sign in
   and recover the same Samra account/wallet after service restart. Exercise
   recovery without changing wallet control. Retain only sanitized result IDs.
4. **Prove negative cases.** Wrong/expired/missing tokens and cross-account IDs
   deny access. Pending and rejected KYC cannot create a wallet. Duplicate and
   concurrent requests, timeout/429/5xx, webhook replay and process interruption
   never create a second wallet or falsely claim success. Verify provider owner,
   passkey/recovery configuration and absence of server/delegated signers.
   Deposits and transfers remain unavailable in API and UI.
5. **Roll out 5 → 25 → 100.** Before each increase, record the current count,
   exact release, previous-cohort acceptance, working alert delivery and
   support-owner availability (David Haile). Proposed launch thresholds: zero unauthorized access or
   duplicate wallet mappings; page immediately on either, and on sustained
   onboarding/provider failures. Approve measured availability/latency and
   pending-KYC age targets before admitting users; do not invent coverage or
   mark unconfigured alerts as working. Any failed criterion holds the batch;
   pause admission and reconcile outstanding commands before resuming.

The admission foundation is merged; the current delivery unit restricts runtime
database authority and records the accepted support owner. The next
milestone is the one-user production proof; there is no promised launch date
until provider, data and operational blockers have owners and evidence. Keep
the existing CI/readiness gates and release traceability. Add release-framework
code only to resolve a demonstrated blocker to this customer journey.
