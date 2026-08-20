# Crossmint USDC wallet boundary

## Status and decision

Crossmint is the locked Alpha wallet provider. The live integration is not yet
enabled. The Alpha scope is wallet creation and normalized lifecycle evidence
for an approved USDC configuration; it does not assume bank funding, Plaid
compatibility, card issuing, Ethiopia payout, or unrestricted money movement.

Samra Pay owns the customer-to-wallet relationship and all financial product
state. Crossmint owns only the provider capability confirmed in its executed
commercial and technical terms.

## Samra-owned model

One `customer_wallet` record represents the product wallet independent of a
provider. A separate immutable provider mapping contains:

- Samra wallet and customer IDs;
- provider name and environment;
- opaque provider wallet and account references;
- normalized asset, network, custody, and lifecycle fields;
- creation idempotency reference and timestamps;
- suspension, replacement, and closure evidence.

Names, email, phone, Auth0 subjects, Persona payloads, private keys, seed
phrases, access tokens, and provider credentials are prohibited from wallet
mapping and audit metadata.

## Provider contract

The `CustomerWalletProvider` boundary must support only reviewed operations:

- create or return the same wallet for one stable Samra request;
- retrieve normalized wallet state;
- return approved public deposit-address metadata when applicable;
- suspend or restrict through an explicit reviewed command when supported;
- normalize authenticated provider events;
- expose deterministic error families without leaking vendor payloads.

Create is idempotent. A retry after timeout or process failure must find or
return the original Crossmint wallet. The mapping attaches exactly once under a
PostgreSQL transaction; a competing result cannot silently replace it.

## Capability gate

Wallet creation requires:

1. a validated Auth0 customer actor;
2. durable onboarding and consent;
3. a normalized approved Persona identity case;
4. no duplicate-person or restricted-customer hold;
5. an idempotency key and stable Samra provider request reference.

Wallet creation does not create a balance, funding entitlement, remittance
entitlement, card, or ledger journal. Activation is a separate Samra decision.

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
- wallet and provider mapping writes are atomic and immutable where required;
- authenticated event replay creates no duplicate state or ledger effect;
- provider payloads and secrets are absent from API, audit, analytics, logs,
  Qase, and client storage;
- web and mobile resume the normalized Samra wallet state after restart;
- operations can view provider references and failures without viewing secrets
  or gaining balance-edit controls;
- financial routes remain blocked until funding and payout gates are approved.

## Live hard stops

- no written Crossmint USDC asset/network, custody, recovery, sanctions,
  transaction, fee, limit, webhook, data-retention, and exit contract;
- no separate sandbox and production credential inventory in Secret Manager;
- no approved customer disclosure and support/recovery workflow;
- any reliance on unverified bank funding or Plaid compatibility;
- any direct vendor status granting financial capability;
- any claim that future migration to Cybrid, Rain, or Bridge will be automatic.
