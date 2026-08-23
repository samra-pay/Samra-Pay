# Crossmint USDC wallet boundary

## Status and decision

Crossmint is the locked Alpha wallet provider. The Samra-owned PostgreSQL
wallet aggregate, explicit non-production consent, authenticated API contract,
immutable provider mapping, deterministic fake adapter, and failure/replay
controls are implemented. A fail-closed server-only sandbox adapter is also
implemented but remains dormant and unreachable from the runtime. The live
Crossmint integration is not enabled. The Alpha scope is wallet creation and
normalized lifecycle evidence for an
approved USDC configuration; it does not assume bank funding, Plaid
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

## Implemented API and synthetic evidence

| Endpoint                         | Purpose                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/onboarding/wallet` | Create or safely resume one synthetic wallet after Auth0 authentication and Persona-style identity approval |
| `GET /api/v1/onboarding/wallet`  | Resume normalized Samra wallet state without exposing the provider reference                                |

Both endpoints are present only in the Auth0 plus PostgreSQL runtime. Start
requires `Idempotency-Key` and the exact non-production wallet disclosure. A
changed command cannot replace an existing wallet.

The implemented evidence covers:

- one wallet per Samra customer and onboarding aggregate;
- exact consent-to-wallet foreign-key evidence;
- append-only lifecycle transitions and provider mapping;
- deterministic fake Crossmint creation from opaque Samra identifiers only;
- a dormant sandbox adapter that sends only the opaque `userId:<Samra-id>`
  owner, a stable idempotency key, and one reviewed EVM wallet configuration;
- strict sandbox response validation, bounded timeouts and payloads, generic
  failures, and no provider body or credential leakage;
- atomic mapping attachment and onboarding transition to `wallet_ready`;
- restart-safe GET and replay-safe create;
- provider timeout/failure persistence and conflicting-result restriction;
- API responses that omit provider wallet references, Auth0 subjects, tokens,
  credentials, and customer PII; and
- readiness and migration-compatibility coverage for the new relations and
  mutation guards.

This proves the internal boundary and the adapter's deterministic request and
normalization behavior against mocked responses. It does not prove a Crossmint
account, real sandbox call, approved asset/network choice, custody model,
public address, webhook, or USDC movement. The PostgreSQL wallet store still
accepts only `crossmint-synthetic-v1`; attempting to wire the sandbox adapter
without a separately reviewed activation change therefore fails closed.

## Connected web and mobile boundary

Web and mobile now use the shared Samra onboarding source to:

- retrieve the normalized wallet only when onboarding has reached a wallet
  state;
- present an unselected, versioned non-production disclosure before creation;
- submit the exact disclosure with a stable idempotency key;
- resume `created`, `provisioning`, `ready`, `restricted`, and `error` states;
- retry without asking the provider to create a second economic wallet; and
- show the configured `USDC` asset and Crossmint adapter while stating that no
  token, address, balance, funding, withdrawal, remittance, or activation is
  enabled.

The clients never import generated operation names, persist wallet state, or
receive provider wallet references. API-mode wallet readiness returns to the
non-financial product surface. Only explicit mock mode can continue into the
synthetic dashboard.

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
- web and mobile resume the normalized Samra wallet state after restart
  (implemented; PostgreSQL restart evidence is enforced by the API gate);
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

References:

- [Crossmint backend wallet REST quickstart](https://docs.crossmint.com/wallets/quickstarts/restapi)
- [Crossmint create wallet API](https://docs.crossmint.com/api-reference/wallets/create-wallet)
- [Crossmint userId owner registration](https://docs.crossmint.com/identity/register-user-data)
- [Crossmint API key scopes](https://docs.crossmint.com/introduction/platform/api-keys/scopes)
