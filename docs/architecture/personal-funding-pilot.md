# Personal Crossmint funding pilot

Owner and support owner: David Haile. Decision date: 2026-09-07.

## Decision and present status

David approved moving forward with a private personal pilot using existing Auth0,
a customer-controlled Crossmint wallet, and Crossmint-hosted KYC and debit-card
funding. He specified his own debit card, the United States, and a maximum total
authorization of **USD 20**, including fees. His state of residence for KYC remains
to be confirmed. Crossmint explicitly lists all U.S. states for noncustodial wallets;
its card-onramp coverage must be confirmed separately. No state exclusion has been
verified for this pilot.
Persona activation is paused because his incorporation document is unavailable.
This is not approval for a public funding release or for funding the 100-user alpha.

This change implements the **internal order-reservation, creation and progress boundary**.
It is not registered in `createConfiguredDemoRuntime`, selectable through
environment variables, or exposed through an HTTP route. The migration seeds no
pilot authorization, wallet or order. No provider, customer or cloud mutation was
performed while implementing it. Production remains blocked.

No treasury wallet is needed for this flow: Crossmint delivers the purchased USDC
directly to David's customer-controlled wallet. A Samra company treasury for its own
capital or future settlement liquidity is a separate future decision. The pilot
does not receive customer funds into a company wallet or add server signing.

The existing alpha routes, Persona requirement, wallet configurations and financial
route restrictions are unchanged. No fake Persona approval is used for the pilot.

## Reuse and remaining implementation

| Area      | Reuse                                                                      | Remaining work before personal acceptance                                                                                           |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in   | Auth0 registration/login/logout/recovery and isolated sessions, PR #191    | Verify private deployed origin, exact client/audience/callbacks, invite and returning-account behavior                              |
| Account   | Samra customer UUID and immutable issuer/subject binding                   | Resolve the one real pilot account through authenticated onboarding; no email-based linking                                         |
| Wallet UI | Read-only dashboard in merged PR #192                                      | Attach the private pilot flow after its production wallet and checkout gates pass                                                   |
| Wallet    | Existing provider boundary and customer-control requirements               | Customer passkey enrollment, recovery/exit proof, production provisioning with durable ownership and no duplicate wallet on restart |
| Funding   | PostgreSQL reservation, Crossmint order adapter and durable progress reads | Quote/destination integrity, hosted checkout, resumable checkout credentials and independent onchain delivery verification          |
| KYC       | Crossmint-hosted onramp verification                                       | Durable purpose-scoped pending/rejected/verified evidence; no inferred global Samra approval                                        |

Base native USDC is the proposed narrow network for the adapter. Its presence in
code does not establish provider availability or approve the network for a live
charge. The staging equivalent is Base Sepolia test USDC.

## Implemented command behavior

`PostgresPersonalFundingStore` resolves the validated Auth0 issuer/subject to the
same active Samra customer on every call. An operator-provisioned authorization
selects exactly one account and an already verified wallet. There is no API for
creating or changing that authorization. It is separate from Alpha Release 1
admission and grants no alpha feature or remittance entitlement.

The authorization records the provider environment, EVM wallet reference/address,
maximum USD minor units, expiry, and digest of the reviewed authorization and
wallet-control evidence. It can only be revoked; the wallet, customer, environment,
budget and evidence cannot be replaced in place. A digest is a reference to evidence,
not proof that the evidence is sufficient. An operator must review the actual record
before provisioning anything. No production authorization record currently exists
as a result of this change.

The database permits **one purchase attempt**, not one per browser/session/API
instance. The amount is an integer minor-unit string, at most 2,000 cents and at
most the operator's lower ceiling. A transaction commits the reservation and its
append-only event before the provider call. A concurrent or returning request can
read that attempt but cannot dispatch another. A new key or changed amount conflicts.

Timeouts, rate limits, malformed replies and other uncertain failures retain the
reservation as `provider_unknown`. A process failure before recording the response
leaves `reserved`. Neither state allows automatic redispatch. Crossmint order
idempotency was not established by the reviewed documentation, so this code does
not invent an idempotency header or promise exactly-once external execution.
Recovery requires provider reconciliation of the original attempt, not deletion
of the reservation or a second order. Even a failed purchase retains its slot.

The server adapter sets the destination, token, USD card method and amount. It
never takes a customer ID, destination, receipt email or token from an HTTP body.
The receipt email is private server configuration for the verified pilot customer.
Fixed HTTPS endpoints, rejected redirects, a four-second deadline, a 64-KiB body
limit and generic errors bound the provider interaction. There is no wallet-create,
signing, recovery, transfer, refund or payment-submission method in this adapter.

The checkout token is returned only to the internal caller after the order
reference commits. It is not persisted, logged or returned by resume. A lost token
cannot currently resume checkout; it must not cause another purchase. No public API
or browser receives that token in this slice. `checkout_created` proves only an
order reference. `fundingConfirmed` remains false; no ledger posting, balance,
wallet activation, Persona decision or successful-KYC assertion is written.

`PersonalFundingStatusService` retrieves only the provider order already bound to
the authenticated account. It performs one bounded server-side GET with `orders.read`,
then rechecks account ownership before recording an append-only observation under
migration 0020. It cannot create, change or pay for an order. The provider environment
and returned order reference must match. Only allowlisted payment/delivery statuses
are retained; KYC preparation, personal fields, raw errors and checkout tokens are
discarded. Unknown status strings normalize to `unknown`. Missing/malformed order
shapes fail closed. The reviewed GET API page currently contains an unrelated license
example; the parser follows the documented onramp response in the Swift quickstart,
which still needs staging contract verification before activation.

Returning to the same account reads dated progress from PostgreSQL. A response from
an older request cannot replace the latest request's observation. A provider outage
retains that evidence and returns `providerRead: unavailable`, never fresh success.
`requires-kyc`, `manual-kyc` and `failed-kyc` map to required, pending and rejected
for this purchase. Later payment states do not manufacture a Samra KYC approval.
Even `payment: completed` plus `delivery: completed` leaves `fundingConfirmed: false`:
independent token-delivery proof remains separate. No observation posts to the ledger.

Expiry or pilot revocation prevents a new reservation. The still-active customer
may read their existing receipt for support; authentication revocation or account
suspension blocks all reads. Revocation does not undo an order already dispatched.

## Provider/configuration blockers

Observed 2026-09-07: the production Crossmint **Samra Pay** project exists, its
overview prompts for the first API key, and General settings select Crossmint-hosted
KYC. These observations do not establish production onramp approval. No settings
were changed during that read-only inspection.

Refreshed production console inspection on 2026-09-07 confirms no server-side or
client-side keys. The create-key form offers `orders.create` and `orders.read`;
selectable scopes are not evidence of onramp activation. The form was closed without
creating a key. No production credential version is available to record.

Before a live pilot:

1. Crossmint must confirm production wallet/onramp access, U.S. state eligibility,
   supported debit-card funding, minimums/fees and required business documents.
   Its onramp docs require production sales approval. Do not assume a personal
   test waives the missing incorporation-document requirement.
2. Confirm a checkout configuration that enforces the fixed wallet and **USD 20
   all-in charge**, including fees. Crossmint's documented `clientSecret` authorizes
   order reads **and updates**; a public `orders.create` key can create orders
   outside Samra's reservation. A client-side amount check is insufficient.
   Server reservation limits alone are not a provider-enforced charge limit.
   Until a verified restriction/server-controlled flow exists, do not publish
   a checkout token or a broad order-create key.
3. Verify passkey operational signing and customer-controlled recovery on the
   exact production wallet. The current SDK's silent device signer/default
   recovery flow must not replace per-transfer customer approval. No server or
   automatic recovery signer may be introduced as a shortcut. Preserve the
   same wallet after sign-out, restart and a supported recovery exercise.
4. Inventory exact Git SHA/release artifact, private origin, Auth0 application,
   Crossmint project and API-key scopes. Pin server credentials and any future
   checkout encryption key to explicit Secret Manager versions. No values or
   receipt email belong in source, logs or test evidence. Finish approved
   disclosure, retention, alerts and David's incident/support contact.
5. Complete the private route/checkout wiring, provider-verified onramp decisions,
   staging status-contract tests and independent token-delivery read-back. Preserve migration/readiness
   checks. No new release orchestration is needed.

## Vendor replacement

Keep Auth0 now. Crossmint recommends an existing auth provider for production and
supports Auth0. Samra's UUID remains the account identity; provider credentials and
wallet records are not account IDs. If Crossmint Auth is ever used temporarily,
switching to Auth0 needs verified account linking and a same-wallet test. Crossmint
derives its wallet owner from the JWT user ID, so an email match or an environment
switch cannot prove wallet continuity.

Store future KYC decisions with provider, purpose, reference, decision and time.
Crossmint onramp approval applies to its funding flow, not the full Samra customer
lifecycle. Persona can later provide a separate Samra verification case and, with
consent and required data, supply Crossmint's documented KYC-import flow. Crossmint
still performs its own checks. Do not copy a Crossmint purchase into a Persona
approved case or promise automatic evidence/key/wallet portability.

## Acceptance and stop conditions

Local/CI checks cover one account, 20-dollar reservation cap, expiry/revocation,
atomic rollback, two-pool concurrency, restart, changed commands, immutable mapping
and history, runtime privilege denial, ambiguous provider outcomes, fixed requests,
payload bounds and secret redaction. They use synthetic records and mocked HTTP.
Progress tests additionally cover pending/rejected KYC, wrong orders/accounts,
out-of-order reads, immutable observations, provider outages and refusal to turn
provider delivery status into a funded balance.
The new persistence case is part of the existing Required CI PostgreSQL suite.

Live acceptance remains: David signs in, completes hosted KYC, creates/returns to
his customer-controlled wallet, reviews and personally confirms a charge no greater
than USD 20 including fees, and sees independently verified USDC delivery to that
wallet. Returning must preserve account, wallet and receipt. Test unauthorized
accounts, pending/rejected KYC, duplicate requests and provider failure first.
Stop on any destination/quote/signer mismatch, uncertain payment, missing delivery,
or missing provider eligibility. No automatic repayment or transfer.

This pilot does not authorize the 5 → 25 → 100 rollout or deposits/transfers in
Alpha Release 1. A merged PR is neither a live pilot nor a live alpha.

## Sources checked 2026-09-07

- [Crossmint onramp activation](https://docs.crossmint.com/onramp/overview)
- [Managed onramp integration](https://docs.crossmint.com/onramp/quickstarts/react)
- [Create order and checkout-token authority](https://docs.crossmint.com/api-reference/headless/create-order)
- [Server/client order permissions](https://docs.crossmint.com/payments/headless/guides/client-or-server)
- [Auth provider and owner mapping](https://docs.crossmint.com/wallets/guides/bring-your-own-auth)
- [Device signer defaults](https://docs.crossmint.com/wallets/guides/signers/device-signer)
- [Persona data import](https://docs.crossmint.com/onramp/guides/import-user-kyc-data)
- [Native USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Direct wallet delivery](https://www.crossmint.com/products/onramps)
- [Wallet versus onramp geographic coverage](https://help.crossmint.com/articles/5047173710-what-countries-do-you-support)
- [Onramp response and backend polling](https://docs.crossmint.com/onramp/quickstarts/swift)
- [Provider status meanings](https://docs.crossmint.com/payments/headless/guides/status-codes)
