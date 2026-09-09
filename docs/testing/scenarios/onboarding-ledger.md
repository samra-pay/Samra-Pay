# Onboarding and synthetic ledger scenarios

Status: defined, not executed. Use the [session procedure](../user-testing.md). Each case requires an explicitly authorized, isolated Test environment and synthetic app data. A facilitator runs operator steps; participants use normal customer controls. These cases do not authorize deployment, real money, provider activation or destructive resets.

## UAT-01 — Invite admission

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** An operator has prepared one invited synthetic user and one uninvited identity.

**Participant / facilitator steps:** Open the app as the invited user and register. Sign out. Attempt registration/account access as the uninvited identity.

**Expected result:** The invited user can proceed; the uninvited identity cannot obtain an eligible Samra account or access another account. Repeated registration consumes at most one invitation.

**Operator evidence and cleanup:** Record admission decisions and synthetic account count; never record identity tokens. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-02 — Login, logout and return

Priority: **P1**. Initial result: **Not run**.

**Prerequisites:** One admitted account exists.

**Participant / facilitator steps:** Sign in, record the displayed account alias, sign out, and return through sign-in. Try a protected URL after logout.

**Expected result:** The same Samra account returns. Logged-out navigation requires authentication; cached screens cannot execute protected actions.

**Operator evidence and cleanup:** Verify stable internal mapping using a redacted operator comparison, not an exposed customer ID. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-03 — Account recovery

Priority: **P1**. Initial result: **Not run**.

**Prerequisites:** A nonproduction identity supports recovery and the tester controls its test inbox.

**Participant / facilitator steps:** Sign out. Use Forgot password/recovery. Complete the managed flow, then sign in with the updated credential.

**Expected result:** Recovery completes to the same account. Invalid/expired recovery links fail safely. The UI does not reveal whether unrelated identities exist.

**Operator evidence and cleanup:** Tester enters credentials privately. Do not collect emails, recovery links, passwords or inbox screenshots. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-04 — Account isolation and expired session

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** Two independent admitted accounts A and B with distinct synthetic balances; operator can perform scoped API checks.

**Participant / facilitator steps:** A and B log in separately. A signs out. Operator attempts B-owned resource access using A authorization and retries a protected command with an expired test session.

**Expected result:** Neither identity can read or mutate the other account. Expired/invalid authorization is rejected; no ledger effect occurs.

**Operator evidence and cleanup:** Operator verifies API access as well as UI. Use a test harness; never paste tokens into issues. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-05 — Simulated KYC pending and rejected

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** Fake identity adapter and operator-controlled pending/rejected fixtures; no live KYC provider.

**Participant / facilitator steps:** Open onboarding for the pending user, refresh, and sign out/back in. Repeat with the rejected user. Attempt wallet creation in each state.

**Expected result:** Pending/rejected outcomes persist and display correctly. Neither state permits a wallet requiring approved KYC.

**Operator evidence and cleanup:** These simulated outcomes do not satisfy production KYC. Record fixture name and observed decision only. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-06 — Simulated KYC approval and wallet creation

Priority: **P1**. Initial result: **Not run**.

**Prerequisites:** Fake identity and wallet adapters; synthetic eligible user with approved fixture.

**Participant / facilitator steps:** Complete the simulated approved path. Request a wallet. Sign out and return.

**Expected result:** One synthetic wallet maps durably to the same Samra account. Returning shows the same wallet. No production wallet or signing authority is created.

**Operator evidence and cleanup:** Verify durable mapping with a redacted operator check. This does not prove customer-controlled production signing/recovery. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-07 — Wallet repeat request and interrupted response

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** Operator can inject a bounded fake wallet response loss.

**Participant / facilitator steps:** Request the synthetic wallet, interrupt the response, retry, then restart the API during the agreed test window and return.

**Expected result:** The account converges to one wallet mapping; no duplicate wallet is created. Unknown provider state is explicit.

**Operator evidence and cleanup:** If safe failure injection is unavailable, mark Blocked. Do not improvise a real provider outage. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-08 — Synthetic opening funds

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** Operator can issue a scoped, idempotent synthetic-credit command; clean Test database and fake financial providers.

**Participant / facilitator steps:** Operator issues a 10000-minor-unit USD test credit to A. A opens balance/activity. Repeat the same credit command with its original key.

**Expected result:** A receives exactly $100.00 once. Equal debit and credit postings balance; B is unchanged. No real funding request occurs.

**Operator evidence and cleanup:** Inspect journal, source synthetic clearing account, and ledger-derived available/book balances. Never edit balances directly. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-09 — Synthetic transfer success

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** A has sufficient synthetic funds and a synthetic beneficiary; fake worker is available.

**Participant / facilitator steps:** A requests a quote for $10.00, reviews its actual server fee and total, confirms once, and waits for completion.

**Expected result:** One transfer progresses to a terminal successful state. Holds settle exactly once and final balance delta equals the server-quoted total debit.

**Operator evidence and cleanup:** Compare journal postings, holds, canonical activity and reconciliation. Do not assume a hard-coded fee or model this as peer-to-peer transfer unless supported. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-10 — Insufficient funds

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** A has a known synthetic available balance.

**Participant / facilitator steps:** Request and attempt a transfer whose total debit exceeds available funds; retry once.

**Expected result:** Server rejects unsafe execution. No negative available balance, extra hold or posted transfer debit is created.

**Operator evidence and cleanup:** Verify account, hold and journal state before/after, regardless of where the UI stops the request. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-11 — Transfer duplicate and lost response

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** One valid quote; operator has a bounded fake network interruption.

**Participant / facilitator steps:** Confirm once, lose the response after commit, then use the app Retry action.

**Expected result:** The original transfer is recovered with one financial effect. No second hold/debit is produced.

**Operator evidence and cleanup:** Verify durable idempotency across UI/API and both retries; do not generate a fresh key to hide an uncertain outcome. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-12 — Provider failure, delayed callback and refund

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** Operator has isolated fake failure, delayed-event and duplicate-event scenarios.

**Participant / facilitator steps:** Submit a synthetic transfer. Exercise each fake failure/event sequence separately, recording fixture resets. Observe refund/reversal if supported.

**Expected result:** Only authenticated accepted events change state; duplicates/out-of-order events do not cause extra postings. Unknown state stays explicit. Refund reaches a known state once.

**Operator evidence and cleanup:** Compare terminal status, journal, holds and reconciliation. Any unavailable scenario is Blocked, not silently omitted. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-13 — Restart and cross-surface consistency

Priority: **P0**. Initial result: **Not run**.

**Prerequisites:** Web and installed mobile use the same Test API; an operator has read-only financial inspection and an agreed restart window.

**Participant / facilitator steps:** Create a synthetic transfer on web. Operator restarts the API. Return on web and mobile; inspect the corresponding transaction in operations/read-only tooling.

**Expected result:** Account, transfer, wallet mapping where applicable, and exact balances persist across restart and agree across surfaces. No fixture reset occurs on startup.

**Operator evidence and cleanup:** Record each deployed/mobile version. Mark unavailable surfaces Blocked rather than inferring mobile results from web. Restore the test scenario and record its final state without erasing the run evidence.

## UAT-14 — Outage and recovery

Priority: **P1**. Initial result: **Not run**.

**Prerequisites:** Operator can safely stop/isolate only the Test API during a scheduled session.

**Participant / facilitator steps:** Load account data, simulate outage, reload and retry. Restore API and return.

**Expected result:** Explicit unavailable/loading states replace access to stale actions. No plausible mock balance appears in API mode. Recovery returns canonical state.

**Operator evidence and cleanup:** Confirm provider keys remain absent and no fallback targets staging or production. Record restoration and cleanup. Restore the test scenario and record its final state without erasing the run evidence.
