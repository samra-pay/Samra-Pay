# Crossmint customer wallet boundary

## Status and decision

Crossmint is the locked Alpha wallet provider. The Samra-owned PostgreSQL
wallet aggregate, explicit non-production consent, authenticated API contract,
immutable provider mapping, deterministic fake adapter, and failure/replay
controls for persisted local outcomes are implemented. The older
server/external-signer sandbox adapter
remains dormant. The separate `CrossmintCustomerSandboxAdapter` is selectable
only through the guarded, creation-only `crossmint-sandbox-customer` staging
mode. A deployed Samra-to-Crossmint connection is not evidenced. The Alpha
scope is creation and normalized lifecycle evidence for a non-production EVM
smart-wallet resource intended for a future approved USDC configuration. The
current create request neither selects nor verifies a USDC token contract or
exact chain. It does not assume bank funding, Plaid compatibility, card issuing,
Ethiopia payout, or unrestricted money movement.

Samra Pay owns the customer-to-wallet relationship and all financial product
state. Crossmint owns only the provider capability confirmed in its executed
commercial and technical terms.

The cross-provider target is governed by
[provider portability and Samra control-plane ownership](./provider-portability.md).
The current schema and wired adapter are intentionally Crossmint-specific and
creation-only; they are not a completed custody-migration boundary. See the
[dated code audit](../reviews/2026-09-14-provider-portability-code-audit.md).

## Samra-owned model

One `customer_wallet` record provides the Samra wallet ID and contains the
customer and onboarding bindings, provider and provider-request references,
idempotency reference, lifecycle state, Samra product asset intent, environment,
configuration version, and wallet timestamps. The current `asset = USDC` value
means intended Samra product use; it is not evidence that Crossmint configured
or issued a USDC token on a network. The current aggregate still embeds
Crossmint, USDC, and Crossmint configuration constraints.

A separate immutable provider mapping currently contains only:

- the Samra wallet ID and provider name;
- the opaque provider wallet reference;
- the provider-normalized chain family and custody values (`evm` is currently a
  chain family, not a verified exact blockchain network);
- the public address;
- the provider configuration version; and
- the mapping creation timestamp.

It does not independently contain the Samra customer ID, wallet environment,
asset, lifecycle state, or creation idempotency reference; those remain on the
parent wallet aggregate.

The mapping is Crossmint-only and unique by Samra wallet, so it cannot yet hold
concurrent old/new provider resources, effective dates, or superseded/runoff
state. Those are forward-migration requirements before a provider transition,
not implemented Alpha behavior.

Names, email, phone, Auth0 subjects, Persona payloads, private keys, seed
phrases, access tokens, and provider credentials are prohibited from wallet
mapping and audit metadata.

## Provider contract

The eventual `CustomerWalletProvider` boundary may support only reviewed
operations:

- create or return the same wallet for one stable Samra request;
- retrieve normalized wallet state;
- return approved public deposit-address metadata when applicable;
- suspend or restrict through an explicit reviewed command when supported;
- normalize authenticated provider events;
- expose deterministic error families without leaking vendor payloads.

The wired customer sandbox adapter currently implements creation only. Provider
retrieval, signing, recovery, transactions, authenticated wallet events, and
provider reconciliation are not implemented capabilities.

The create request sends one stable idempotency key, and a persisted local
response replays deterministically. That is not evidence that an upstream
create completed or failed after a transport timeout. Until Crossmint's exact
idempotency guarantee is verified and provider lookup/reconciliation is wired,
an ambiguous staging outcome must fail closed and must not automatically issue
another create request. A durable staging `provisioning` or `error` row is
therefore reconciliation-required, not an automatic-dispatch queue. The mapping
attaches exactly once under a PostgreSQL transaction; a competing result cannot
silently replace it.

## Capability gate

Wallet creation requires:

1. a validated Auth0 customer actor;
2. durable onboarding and consent;
3. a normalized approved Persona identity case;
4. no duplicate-person or restricted-customer hold;
5. an idempotency key and stable Samra provider request reference.

Wallet creation does not create a balance, funding entitlement, remittance
entitlement, card, or ledger journal. Activation is a separate Samra decision.

## Implemented API and synthetic evidence

| Endpoint                                   | Purpose                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `GET /api/v1/onboarding/wallet/disclosure` | Return exact server-selected versions and canonical presentation copy for the active wallet mode |
| `POST /api/v1/onboarding/wallet`           | Create or resume one durable wallet command; upstream timeout reconciliation remains separate    |
| `GET /api/v1/onboarding/wallet`            | Resume normalized Samra wallet state without exposing the provider reference                     |

These endpoints are present only in the Auth0 plus PostgreSQL runtime. The
client retrieves the disclosure from Samra, keeps acceptance unselected, and
submits its exact versions with an `Idempotency-Key`. A client cannot select the
provider mode, claim customer control, or replace an existing wallet with a
changed command.

The synthetic foundation evidence covers:

- one wallet per Samra customer and onboarding aggregate;
- exact consent-to-wallet foreign-key evidence;
- append-only lifecycle transitions and provider mapping;
- deterministic fake Crossmint creation from opaque Samra identifiers only;
- a dormant sandbox adapter that sends only the opaque `userId:<Samra-id>`
  owner, a stable idempotency key, and one generic EVM smart-wallet
  configuration;
- strict sandbox response validation, bounded timeouts and payloads, generic
  failures, and no provider body or credential leakage;
- atomic mapping attachment, with synthetic creation transitioning to
  `wallet_ready`;
- restart-safe GET and an explicit synthetic-only create-recovery action that
  resumes from the durable Samra wallet command and provider request key;
- local provider-failure persistence and conflicting-result restriction, not
  upstream outcome reconciliation after a transport timeout;
- API responses that omit provider wallet references, Auth0 subjects, tokens,
  credentials, and customer PII; and
- readiness and migration-compatibility coverage for the new relations and
  mutation guards.

These synthetic tests prove the internal boundary and deterministic behavior
against mocked responses. Separately, the dated
[sandbox connection record](../operations/crossmint-sandbox-connection.md)
documents a console-created wallet and authenticated provider GET. That
evidence does not establish a deployed Samra API, durable customer mapping,
webhooks, signer enrollment, recovery, or USDC movement.

The newer customer-controlled backend path uses migration
`0017_customer_controlled_sandbox_wallets` to permit guarded staging mappings
alongside synthetic mappings. It requires staging, Auth0, PostgreSQL, an
allowlisted Samra customer, an approved identity case, the separate current
`sandbox-customer-wallet-v2` disclosure, and disabled workers/operations.
Its provider adapter can create a generic EVM smart-wallet resource with
customer email recovery, but it does not request or verify a USDC asset/token
configuration and cannot prove signer enrollment, sign, transfer, or recover
funds. Provider resource creation therefore stops at wallet
`customer_control_setup` and
onboarding `wallet_control_setup`, keeps `ready_at` null, and withholds the
public address and custody/control label. The current database transition guard
does not permit this state to advance to `ready`; it may permit that transition
only in a future reviewed migration that also requires durable, server-verified
signer and recovery evidence. No customer-callable self-attestation exists. This setup
state grants no funding entitlement.
Use the [deployment package](../operations/staging-wallet-deployment-package.md)
for the unresolved activation evidence and bounded next steps.

Migration `0021_customer_wallet_control_setup` recognizes the exact legacy
`sandbox-customer-wallet-v1` acceptance only to preserve and reclassify a valid
pre-existing staging mapping. It does not treat that historical acceptance as
the current catalog. The original row remains immutable; the clients and API
append a separate v2 acceptance before continuing, and this acknowledgement
does not redispatch provider creation. New wallet inserts and capability
transitions require the current base and environment-specific wallet consent at
the database boundary.

## Connected web and mobile boundary

Web and mobile now use the shared Samra onboarding source to:

- retrieve the normalized wallet only when onboarding has reached a wallet
  state;
- retrieve the server-selected disclosure and accept it only when the complete
  response matches the client's compiled disclosure allowlist;
- render the validated canonical presentation and submit the corresponding
  allowlisted versions with a stable idempotency key;
- resume `created`, `provisioning`, `customer_control_setup`, `ready`,
  `restricted`, and `error` states;
- interrupt a later stage with the current base or wallet disclosure when its
  append-only acceptance evidence is older, without deleting the older evidence
  or presenting a funding action;
- replay persisted local outcomes deterministically; an interrupted synthetic
  `provisioning` record exposes an explicit resume action backed by the
  server-stored command after a client reload, while staging `provisioning` or
  `error` exposes `await_wallet_reconciliation`, preserves the command, and
  blocks another create until provider lookup and reconciliation resolve the
  ambiguous outcome; and
- keep wallet details and the address hidden during customer-control setup while
  stating that no balance, funding, withdrawal, remittance, or activation is
  enabled.

The clients never import generated operation names, persist wallet state, or
receive provider wallet references. API-mode wallet readiness can open the
[read-only wallet dashboard](customer-wallet-dashboard.md), showing the
normalized record and any supplied public address. Balance and wallet activity
remain unavailable because the current contract does not supply them. Only
explicit mock mode can continue into the synthetic financial dashboard.
Normalized Samra state supports a future portability boundary, but the current
Crossmint-only mapping does not implement provider migration or prove that a
wallet can survive one.

## Events and accounting

Crossmint events are receipt evidence, not accounting truth. The API must:

1. verify the webhook signature and timestamp;
2. persist the raw receipt under the approved retention boundary before acting;
3. deduplicate by provider and external event reference;
4. normalize the event behind the adapter;
5. lock the Samra wallet or transaction;
6. apply legal state, audit, inbox/outbox, and any reviewed ledger action
   atomically.

An observed token balance never replaces Samra's double-entry ledger. Any
future on-chain or provider-balance reconciliation compares independent
evidence and opens an exception; it never silently edits a ledger balance.

## Replacement boundary

Cybrid, Rain, and Bridge may be evaluated after Alpha through the same Samra
contract. Replacement means provisioning and mapping a new provider resource,
preserving prior evidence, and following an approved customer-consent and
balance-movement plan. It does not imply that credentials, keys, wallet
addresses, or custody relationships can be exported from Crossmint.

Before approving a replacement, compare custody, licensing, customer
eligibility, supported assets and networks, funding, payout, recovery, fees,
limits, webhooks, reconciliation, data export, termination assistance, and
customer migration requirements.

## Acceptance evidence before sandbox connection

- deterministic fake-adapter tests for create, replay, concurrent create,
  timeout, restart, changed-command rejection, and conflicting results;
- sandbox-adapter tests for exact API version and endpoint, `X-API-KEY`
  server-only transport, opaque `userId` ownership, idempotency, smart and MPC
  configuration validation, response normalization, payload bounds, and
  generic failures;
- wallet and provider mapping writes are atomic and immutable where required;
- authenticated event replay creates no duplicate state or ledger effect;
- provider payloads and secrets are absent from API, audit, analytics, logs,
  Qase, and client storage;
- web and mobile resume persisted normalized Samra wallet state after restart;
  synthetic replay evidence does not prove recovery of an ambiguous Crossmint
  create outcome after a process restart;
- a staging provider mapping cannot render wallet readiness or expose its
  address before server-verified customer-control evidence exists;
- operations can view provider references and failures without viewing secrets
  or gaining balance-edit controls;
- financial routes remain blocked until funding and payout gates are approved.

## Live hard stops

- no written Crossmint USDC asset/network, custody, recovery, sanctions,
  transaction, fee, limit, webhook, data-retention, and exit contract;
- no separate sandbox and production credential inventory in Secret Manager;
- no approved customer disclosure and support/recovery workflow;
- no verified provider idempotency and lookup/reconciliation contract for an
  ambiguous create outcome;
- any reliance on unverified bank funding or Plaid compatibility;
- any direct vendor status granting financial capability;
- any claim that future migration to Cybrid, Rain, or Bridge will be automatic.

References:

- [Crossmint backend wallet REST quickstart](https://docs.crossmint.com/wallets/quickstarts/restapi)
- [Crossmint create wallet API](https://docs.crossmint.com/api-reference/wallets/create-wallet)
- [Crossmint userId owner registration](https://docs.crossmint.com/identity/register-user-data)
- [Crossmint API key scopes](https://docs.crossmint.com/introduction/platform/api-keys/scopes)
