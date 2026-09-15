# User testing without Qase

Decision: David Haile retired Qase on 2026-09-09. GitHub owns scenario definitions,
test-session records, defects, fix PRs, and retained automated evidence. This
supersedes older mandatory and optional Qase guidance. No new testing platform
or paid subscription is required.

## How David and testers use it

1. The facilitator selects a deployed, authorized **Test/UAT** build, writes its
   full source SHA and runtime revision (plus mobile build number when relevant),
   and confirms the test URL, provider modes, fixture version and test accounts.
   A URL containing staging, a merged PR, or a green build is not sufficient.
2. Open a **User test session** issue using the repository's New issue menu.
   Select scenarios below and assign an engineering facilitator. David is the
   support owner; this does not assign him every technical incident role.
3. Give participants the test URL/install link and plain-language steps. They
   do not need GitHub access: David or the facilitator records their observations
   under aliases such as Tester A. Do not invite customers into the source repo
   just to collect feedback. Use synthetic app profiles and simulated KYC;
   authentication credentials still remain private.
4. Record each scenario's actual result, timestamp, surface and evidence in the
   session. Outcomes are **Not run, In progress, Passed, Failed, Blocked**.
   Missing environments, inaccessible accounts or unavailable controls are
   Blocked. Planned steps and automated unit-test results are not manual passes.
5. For a failure, open a **Test failure** issue or link an existing matching
   defect. Record expected versus actual behavior, reproduction steps, severity,
   affected build, owner and redacted evidence. Link the session and scenario.
6. Link the fix PR. After deployment, rerun the failed scenario and neighboring
   cases on the new exact version. Append the retest result; preserve the original
   failure. Close the defect only after verification, or explicitly record a
   duplicate/deferred disposition. A merged fix alone is not a verified fix.

## Scenario catalog and first session

- [Local synthetic persona lab](synthetic-persona-lab.md): repeatable artificial
  customer journeys through the API and ledger in disposable local PostgreSQL.
  Its simulated authentication is engineering evidence, not participant acceptance.
- [Onboarding and synthetic ledger scenarios](scenarios/onboarding-ledger.md):
  admission, login/recovery, account isolation, simulated KYC/wallet, synthetic
  funding, transfer failures, repeat requests, refunds and restart consistency.
- [15 preserved portable-client scenarios](scenarios/portable-client.md):
  customer web, installed iOS/Android, API truth, outages and cross-surface recovery.

First session: run UAT-01 through UAT-04 and UAT-08 through UAT-10 with two
independent test users. Run UAT-05 through UAT-07 only when simulated onboarding
is available. Then run failure/recovery cases UAT-11 through UAT-14 with an
operator. Repeat applicable cases on installed mobile builds; web evidence does
not count as iOS/Android evidence. The test environment is a separate delivery
prerequisite, not created by these templates.

## Result record

Use one row per scenario, tester alias and surface. Preserve session history with
append-only result comments; do not replace earlier failed results with a pass.

| Scenario | Tester alias / surface | Result | Actual observation | Evidence / defect | UTC time |
| --- | --- | --- | --- | --- | --- |
| UAT-01 | Tester A / web | Not run | No observation yet | None | Not started |

Each session must identify the deployed SHA/revision, scenario-catalog SHA, URL
or build, browser/OS/device versions, provider modes, fixture version, owner and
scope. A redeployment starts a new session or a clearly separate retest record.
This is a human-reviewed record, not a machine-certified release gate. GitHub
form fields help collection; the facilitator must check completeness and cannot
infer truth from form submission.

## Failure triage and tracking

Use title prefixes `[User test]` and `[Test failure]`. GitHub issue search works
without new labels or a custom app:

- Sessions: `is:issue "[User test]" in:title`
- Open defects: `is:issue is:open "[Test failure]" in:title`
- Assigned defects: add `assignee:USERNAME`.

Use the existing engineering Project if available; do not create a second board.
Suggested status values are To triage, Ready, In progress, Awaiting retest, and
Verified. These are a proposed board view, not an assertion that fields have
been configured. GitHub issues and their linked evidence remain usable alone.

| Severity | Meaning | Treatment |
| --- | --- | --- |
| P0 | Account isolation, duplicate financial effect, unbalanced journal, leaked secret or sensitive data | Stop affected testing; contain and investigate; blocks the affected release |
| P1 | Login, account recovery or a core journey cannot complete | Assign promptly; blocks acceptance of that journey |
| P2 | Usability issue with a safe workaround | Prioritize in the engineering backlog |
| P3 | Cosmetic or minor copy defect | Batch with related changes |

David owns acceptance priority. Assign an engineering owner to each actionable
failure. Review failures after every facilitated session. Record passed/failed/
blocked/not-run counts, open P0/P1 defects, and the next retest. Do not hide a
blocked case by removing it from the pass-rate denominator.

## Boundaries and release acceptance

Test/UAT uses real application authorization and PostgreSQL accounting with fake
financial providers and synthetic funds. Explicitly verify separate identity,
wallet, funding and payout modes; one fake-provider flag is not enough. Fake
KYC approval is scenario setup, not a production verification decision. Never
relax production eligibility, signing, or recovery to run a test.

Only operators can seed/reset fixtures or inject failures. Synthetic credits
use balanced immutable journals; resets are isolated and recorded. Preserve
independent customer accounts. Do not touch shared data during an active session
without coordinating with its owner. No real card, real money, real identity
papers or live payout is part of this testing scope.

Do not attach tokens, passwords, authorization headers, real email addresses,
KYC documents, raw provider bodies, database dumps or personal financial details.
Use redacted screenshots and restricted evidence links. Stop before capturing
sensitive content; reporting an incident is separate from uploading its secrets.

A synthetic acceptance milestone requires all selected critical scenarios to
pass, no unresolved P0/P1 defect in scope, preserved exact-version evidence,
and David's review. Production activation retains its separate provider,
security, operational and financial gates. Passing UAT never enables real funds.

## Qase retirement and retained evidence

Repository workflows no longer call Qase, accept Qase dispatch inputs, or read
Qase API tokens. CI JUnit artifacts, weekly performance/resilience results, all
ten release gates, hashed manifests and existing retention remain. The existing
version-2 release/staging schema still writes local compatibility fields named
`qase`, with reporting disabled, no run identity and skipped outcomes. Those
files are not external delivery or a new dependency. Historical receipt
verification remains intact; old records are not rewritten.

The original [CSV](qase-portable-client-smoke.csv) and
[Qase inventory snapshot](qase-governance.json) remain historical source material.
Only 15 manual case bodies were present locally. The historical inventory lists
114 cases; that is not proof all remote case bodies/results have been exported.
Do not delete the Qase workspace until its unique cases and results are preserved
or explicitly dispositioned. No external account, subscription, integration
installation or secret is deleted by this repository change. After merge,
confirm no active run is using Qase, then retire unused credentials/integrations
through the existing access process. No Qase plan purchase is required.
