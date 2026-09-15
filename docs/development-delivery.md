# Develop → Test → Stage → Deploy

Decision owner: David Haile. Requested 2026-09-09. This is the delivery process
for all subsequent Samra Pay application changes, including already-open PRs.
It does not claim that the environments or any particular release have passed.

| Step    | Target and purpose                                                                                                                                | Evidence required to advance                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Develop | Isolated branch from current main; local Mac workspace and isolated local/CI tests; shared `samra-pay-dev` when cloud behavior needs verification | Appropriate automated checks, exact source SHA, reviewed change and affected local/native smoke result; cloud Dev evidence when used                         |
| Test    | Stable candidate in `samra-pay-test`; synthetic users and money                                                                                   | Exact revision/digests/configuration, scenario session, account isolation and affected user-flow results; failed cases linked to defects and retested        |
| Stage   | `samra-pay-staging`; production-like release rehearsal                                                                                            | Existing immutable release-candidate workflow, database/migration safety, image/revision verification, operational readiness and promotion/rollback evidence |
| Deploy  | `samra-pay-production`; separately approved live scope                                                                                            | Named release owner, explicit release authorization, ready operational gates, approved provider configuration, verified deployment and rollback record       |

Use short-lived feature branches and the protected main merge queue. Environments
are deployment targets, not separate long-lived code branches. A GitHub merge
records source integration; it does not skip Test, Stage, or release authorization.
Documentation-only changes run their relevant checks and record why runtime tests
are not applicable. Do not invent a deployed result for such a change.

The September 10 environment coordination makes local development the primary
daily workspace: Cursor, repository Node/pnpm versions, and the existing
React Native/Expo app. Use Xcode/iOS Simulator and Android Studio/Emulator for
native acceptance. Auth0 requires a custom native development build; Expo Go is
only a mock visual preview. Cloud Dev remains available for bounded integration
sessions, with its compute paused outside those sessions. Shared Test is the
stable, persisted UAT target. Do not require an always-on Cloud Dev service as
an extra gate for every local edit.

Use one reviewed source candidate through the sequence. Record image digests and
build provenance in every environment. If artifacts must be rebuilt for an
existing environment contract, record the new digests and repeat relevant
verification. A source/configuration/migration change after Test acceptance
invalidates affected acceptance and requires a new Test session. Never treat
older-SHA results as evidence for a changed candidate.

## Work and test records

Use the existing GitHub issue/Project and PR. Record the problem, acceptance
criteria, owner, affected surface and environment, and next gate. Reuse the
[scenario catalog and test-session procedure](testing/user-testing.md); do not
create another test-management platform. The engineer links automated runs and
Dev evidence. The facilitator records observed Test results under tester aliases,
links defects and retests, and identifies unresolved P0/P1 issues. David owns
acceptance priority and support; he retains the merge/release decisions unless
he explicitly delegates them.

Public marketing, customer web, API, and installed mobile builds have different
acceptance needs. Test the affected surface. A browser check does not certify an
iOS/Android build. Public site previews are useful for review but are not shared
customer Test environments. Existing public-site delivery still needs affected
preview/Test evidence and its separate production release approval.

The [September 10 open-work inventory](operations/open-work-delivery-2026-09-10.md)
maps existing PRs to their next acceptance requirements. Refresh each PR's state
before acting; the inventory is not merge or deployment approval.

## Isolation, fixtures, and operations

Dev and Test use separate GCP projects, databases, service identities, Auth0
clients/audiences, and secrets. All identity, wallet and financial provider modes
remain fake. Synthetic approval is not real KYC, and synthetic credits are not
deposits. No production data or credentials may enter either environment.

Only the operator CLI provisions invitations and initial synthetic journal
credits. Customers still complete consent themselves. Retain fixtures across
sessions, never reset a shared database as incidental CI cleanup, and preserve
failure evidence before any separately reviewed reset. Use disposable databases
for automated destructive/resilience tests.

Follow [native runtime/session operation](../deploy/gcp/dev-test-runtime.md):
start the database and API, verify readiness, then open web access. Close web,
drain pending financial work, stop API, then stop database. Record session hours
against the combined $50 monthly planning budget. Alerts are not a hard cap.
A failed drain requires recovery; it must never force an interrupted transfer.

The existing [staging release controls](operations/staging-release-control-plane.md)
and [operational readiness](operations/operational-readiness.md) remain mandatory.
This process authorizes no production funds, provider activation, or customer
rollout merely because code, a build, or a Test session passed.

The [customer product environment contract](operations/customer-product-environments.md)
extends the four deployment targets into the controlled Production sequence:
zero traffic, invited identity-and-wallet Alpha, a separately approved
money-movement pilot, then wider production. `www.samrapay.com` remains the
independent public site throughout that sequence; the customer application is
released separately at `app.samrapay.com`.

## September 10 local runtime proof

The existing local Compose stack was built from protected main and started on
David's Mac. Migration, seed, one fake-provider transfer, duplicate replay,
journal balance and restart persistence passed. See the
[local evidence](operations/evidence/2026-09-10-local-dev-runtime.json). Its
auth-disabled loopback API is a developer tool; shared Auth0 UAT remains separate.
[PR #215](https://github.com/samra-pay/Samra-Pay/pull/215) merged the native
configuration/SDK fixes and records the saved Dev/Test Auth0 Native clients.
iOS 26.5 and base Android tools are installed. The September 10 iOS compilation
stopped at the 2 GB free-space floor; Android NDK/CMake/emulator installation and
both platforms' build/install/participant acceptance remain incomplete.
Keep those results separate from browser and shared-backend evidence.
