# Portable client scenarios

Migrated from the preserved Qase CSV on 2026-09-09. These are scenario definitions, not execution results. Legacy IDs support historical lookup only. See [user testing](../user-testing.md) for run records and prerequisites.

All cases require an isolated, authorized synthetic environment. A missing capability is **Blocked**, never a pass. Mobile cases require an installed build. Do not expose operator controls to customer accounts.

## CLIENT-WEB-001 Dashboard renders ledger-derived book and available balance

Legacy reference: SAMP-101. Priority: high; severity: blocker.

**Purpose:** Proves the customer web dashboard treats the API and control ledger as financial truth.

**Prerequisites:** Synthetic API mode is enabled. PostgreSQL is migrated and seeded. Customer web can reach the API.

**Steps**

1. Open the customer dashboard in API mode.
2. Record book balance, available balance, and recent activity.
3. Compare them with GET /api/v1/accounts and GET /api/v1/activity.

**Expected results**

1. The dashboard loads without mock fallback.
2. Every displayed monetary value exactly matches the API decimal-string minor-unit values.
3. No browser-authored balance or transaction appears.

**Cleanup:** No test-created transfer remains pending.

## CLIENT-WEB-002 Remittance quote uses immutable server economics

Legacy reference: SAMP-102. Priority: high; severity: critical.

**Purpose:** Proves the browser displays the server quote and does not calculate fee, FX, recipient amount, or total debit locally.

**Prerequisites:** Synthetic API mode is enabled. A valid beneficiary and funded USD account exist.

**Steps**

1. Enter USD 100 on the public remittance flow.
2. Request a quote.
3. Compare send amount, fee, rate, recipient amount, expiry, and total debit with the quote API response.

**Expected results**

1. The page displays USD 100.00 plus the exact server fee and rate.
2. All values and expiry match the quote response.
3. Refreshing does not silently recalculate different economics.

**Cleanup:** The quote may expire naturally and no transfer is required.

## CLIENT-WEB-003 Completed transfer refreshes balance and activity

Legacy reference: SAMP-103. Priority: high; severity: blocker.

**Purpose:** Proves canonical transfer status and ledger effects replace the pending hold on the customer web surface.

**Prerequisites:** Synthetic API mode and fake worker are enabled. A fresh server quote exists.

**Steps**

1. Submit the quoted transfer once.
2. Observe submitted processing state.
3. Wait for the fake worker to complete the transfer.
4. Recheck account balances and activity.

**Expected results**

1. One transfer is created.
2. Processing remains visible until the API reports a terminal state.
3. Completion refreshes ledger-derived book/available balances and activity exactly once.

**Cleanup:** The created transfer reaches a terminal state.

## CLIENT-WEB-004 API outage fails visibly without mock financial fallback

Legacy reference: SAMP-104. Priority: high; severity: blocker.

**Purpose:** Proves an unavailable backend cannot be replaced by plausible-looking mock balances or transfer data.

**Prerequisites:** Customer web is configured for API mode and has loaded once successfully.

**Steps**

1. Stop or isolate the synthetic API.
2. Reload dashboard and remittance routes.
3. Use Retry once while the API remains unavailable.

**Expected results**

1. Each affected route shows an explicit unavailable/error state.
2. Retry remains available.
3. No mock balance, mock activity, or mock calculator appears.

**Cleanup:** API service is restored after the test.

## CLIENT-WEB-005 Mock mode preserves the approved legacy experience

Legacy reference: SAMP-105. Priority: medium; severity: major.

**Purpose:** Proves API cutover work does not unintentionally replace the design-review and demo surface.

**Prerequisites:** Customer web is explicitly configured for mock mode.

**Steps**

1. Open dashboard and remittance routes in mock mode.
2. Exercise quote handoff and primary navigation.
3. Confirm no API-only unavailable cards appear.

**Expected results**

1. The approved mock presentation and navigation remain intact.
2. Quote handoff remains client-only demo behavior.
3. The UI does not claim the mock values are live financial truth.

**Cleanup:** No API or database mutation occurs.

## CLIENT-MOB-001 Mobile API configuration fails closed

Legacy reference: SAMP-106. Priority: high; severity: critical.

**Purpose:** Proves mobile cannot enter API mode with an unsafe or ambiguous backend origin.

**Prerequisites:** A test mobile build can be launched with controlled Expo environment variables.

**Steps**

1. Launch API mode without an API origin.
2. Launch with an origin containing credentials, path, query, or fragment.
3. Launch with non-loopback HTTP.
4. Launch with a valid HTTPS origin.

**Expected results**

1. The first three configurations fail closed with actionable configuration errors.
2. The valid HTTPS origin is accepted.
3. No request silently targets Replit or a relative origin.

**Cleanup:** Test environment variables are restored.

## CLIENT-MOB-002 Mobile Home renders API balances and activity

Legacy reference: SAMP-107. Priority: high; severity: blocker.

**Purpose:** Proves mobile Home uses backend ledger truth rather than the static demo balance and session history.

**Prerequisites:** Mobile is in API mode and can reach the seeded synthetic API.

**Steps**

1. Open mobile Home in API mode.
2. Record book balance, available balance, and activity.
3. Compare them with the account and activity API responses.

**Expected results**

1. Values exactly match the API.
2. The static demo balance and session-only transactions are absent.
3. Loading, empty, and retry states are explicit.

**Cleanup:** No financial mutation is required.

## CLIENT-MOB-003 Mobile transfer retry reuses one idempotency key

Legacy reference: SAMP-108. Priority: high; severity: blocker.

**Purpose:** Proves a user retry cannot create two transfers or reserve funds twice.

**Prerequisites:** Mobile API mode is enabled. A fresh quote exists. Network interruption can be simulated after submission.

**Steps**

1. Submit one transfer.
2. Interrupt the response after the command may have committed.
3. Retry from the mobile UI.
4. Inspect transfer ID and available balance.

**Expected results**

1. The retry uses the persisted idempotency key.
2. The original transfer is returned.
3. One hold and one exact balance delta exist.

**Cleanup:** The transfer reaches a known backend state.

## CLIENT-MOB-004 App restart recovers a committed transfer response

Legacy reference: SAMP-109. Priority: high; severity: blocker.

**Purpose:** Proves the crash window after backend commit but before mobile response persistence recovers deterministically.

**Prerequisites:** A prepared mobile transfer command and durable idempotency key exist.

**Steps**

1. Submit a transfer and terminate the app before the response is stored.
2. Relaunch the app.
3. Allow automatic recovery to finish.
4. Inspect the backend and mobile transfer history.

**Expected results**

1. Relaunch automatically replays the prepared command.
2. The original backend transfer is recovered.
3. Exactly one transfer and one financial effect exist.

**Cleanup:** Recovery state is cleared or reduced to the authoritative transfer locator.

## CLIENT-MOB-005 App restart resumes an authorized cancellation

Legacy reference: SAMP-110. Priority: high; severity: critical.

**Purpose:** Proves a crash after the user authorizes cancellation cannot lose intent or release the hold twice.

**Prerequisites:** A submitted cancellable transfer exists and cancellation intent can be persisted.

**Steps**

1. Start cancellation and terminate the app before confirmation is stored.
2. Relaunch the app.
3. Observe automatic cancellation recovery.
4. Inspect hold lifecycle and transfer status.

**Expected results**

1. The authorized cancellation resumes only while cancellable.
2. One release occurs.
3. Recovery stops if the backend is already terminal.

**Cleanup:** Transfer is cancelled or the canonical terminal state is displayed.

## CLIENT-MOB-006 Mobile outage and unsupported products expose no mock balances

Legacy reference: SAMP-111. Priority: high; severity: blocker.

**Purpose:** Proves API mode fails visibly and cards/rewards cannot leak mock financial data.

**Prerequisites:** Mobile is configured for API mode.

**Steps**

1. Open Cards and Rewards in API mode.
2. Stop or isolate the API.
3. Open Home and Remittance.
4. Use Retry once.

**Expected results**

1. Cards and Rewards show explicit not-connected states.
2. API outage shows explicit failure and Retry.
3. No mock card, reward, balance, transfer, or calculator data appears.

**Cleanup:** API service is restored after the test.

## CLIENT-MOB-007 Mobile recovery storage excludes recipient PII

Legacy reference: SAMP-112. Priority: high; severity: critical.

**Purpose:** Proves crash recovery stores only server and idempotency locators rather than sensitive beneficiary details.

**Prerequisites:** A mobile transfer has progressed through prepared, submitted, and terminal recovery states.

**Steps**

1. Inspect the supported development view of recovery storage after quote, submit, restart, and terminal completion.
2. Search stored values for beneficiary name, account, wallet, phone, credential, and address fields.

**Expected results**

1. Storage contains only quote, transfer, idempotency, and recovery-state locators.
2. No beneficiary PII or credential is present.
3. Terminal cleanup removes obsolete recovery commands.

**Cleanup:** Temporary recovery state is removed at the terminal boundary.

## CLIENT-CROSS-001 One transfer is visible consistently across web mobile and operations

Legacy reference: SAMP-113. Priority: high; severity: blocker.

**Purpose:** Proves all user and employee surfaces read the same canonical transfer rather than maintaining independent histories.

**Prerequisites:** Customer web, mobile, and Operations Portal point to the same synthetic API and PostgreSQL database.

**Steps**

1. Create a transfer on customer web.
2. Open mobile activity.
3. Open Operations Portal transfer search and detail.
4. Compare IDs, amounts, state, and timeline.

**Expected results**

1. The same transfer ID appears on all three surfaces.
2. Amounts and canonical state agree.
3. Operations exposes additional evidence without changing the transfer.

**Cleanup:** The created transfer reaches a terminal state.

## CLIENT-CROSS-002 Crash retry preserves one transfer and one balance delta everywhere

Legacy reference: SAMP-114. Priority: high; severity: blocker.

**Purpose:** Proves the hardest mobile crash window remains consistent across customer and employee read models.

**Prerequisites:** All surfaces share the same synthetic backend. A mobile lost-response scenario can be triggered.

**Steps**

1. Trigger the committed-response-loss mobile scenario.
2. Relaunch and recover.
3. Open customer web and Operations Portal.
4. Compare transfer count, ID, hold, and balance delta.

**Expected results**

1. All surfaces show one transfer ID.
2. Available balance moves once by the exact total debit.
3. Audit evidence records the replay without a second financial effect.

**Cleanup:** The original transfer is recovered and visible.

## CLIENT-CROSS-003 Failure refund and terminal state agree across surfaces

Legacy reference: SAMP-115. Priority: high; severity: blocker.

**Purpose:** Proves provider failure and controlled refund truth propagate consistently without unsafe payout retry guidance.

**Prerequisites:** Synthetic failure scenario is enabled and all three surfaces share one backend.

**Steps**

1. Create a transfer and trigger the payout-failure/refund path.
2. Observe mobile and customer web status.
3. Inspect Operations Portal evidence and guidance.
4. Compare final balance and timeline.

**Expected results**

1. Customer surfaces show the canonical failure/refund progression.
2. Operations shows controlled refund guidance and no unsafe payout retry.
3. Final balance and audit timeline agree across all surfaces.

**Cleanup:** Refund reaches its canonical terminal state.
