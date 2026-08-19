# Customer identity and Auth0 foundation

## Decision

Auth0 is the customer authentication provider. Samra Pay remains the authority for customer identity, lifecycle state, authorization, KYC state, wallets, accounts, balances, transactions, and audit evidence.

An Auth0 access token proves that Auth0 authenticated a subject for the configured API audience. It does not select a customer, create a customer profile, establish KYC status, grant a financial role, or authorize access to a customer ID supplied by a client.

## Sprint boundary

This foundation delivers:

- explicit `disabled` and `auth0` customer-authentication runtime modes;
- fail-closed validation of Auth0 RS256 API access tokens;
- exact issuer and audience configuration;
- durable `(provider, issuer, subject)` to Samra customer mapping;
- atomic, idempotent identity binding with conflict rejection;
- immutable binding identity and append-only audit evidence;
- one server-resolved customer actor for customer, account, activity, beneficiary, and remittance routes;
- separate trust boundaries for customer routes, synthetic development controls, and workforce operations;
- stable 401, unbound-identity 403, and restricted-customer 403 problem responses;
- tests for configuration, route enforcement, spoof resistance, binding concurrency, idempotency, conflict, and audit redaction.

It does not create or configure an Auth0 tenant, enable production traffic, provision real customers, ingest Auth0 logs, implement account recovery, connect Persona, create Crossmint wallets, change Replit, or store real customer data.

## Runtime contract

Customer authentication is off by default. The foundation may be enabled only with the current PostgreSQL-backed demo runtime:

```text
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=postgres
SAMRA_CUSTOMER_AUTH_MODE=auth0
AUTH0_ISSUER_BASE_URL=https://<tenant-or-custom-domain>/
AUTH0_AUDIENCE=<exact-Samra-API-identifier>
```

`AUTH0_ISSUER_BASE_URL` must be an HTTPS origin. Paths, embedded credentials, queries, and fragments are rejected. The signing algorithm is locked in code to RS256 and is not an environment override.

The API accepts access tokens only. ID tokens are not API credentials. Missing, malformed, expired, wrongly signed, wrong-issuer, and wrong-audience tokens fail with 401. A valid Auth0 subject without a Samra binding fails with 403 on customer-data routes; the controlled `POST /api/v1/onboarding` exception may atomically create the pending Samra customer, binding, and onboarding aggregate. A revoked binding or suspended/closed customer also fails with 403.

## Durable identity model

`samra_core.customer_auth_identities` stores only the minimum provider linkage:

- Samra internal customer UUID;
- provider (`auth0` only in this phase);
- exact issuer;
- exact subject;
- active or revoked lifecycle state;
- binding and revocation timestamps.

The unique key is `(provider, issuer, subject)`. One external identity can never resolve to two Samra customers. Provider, issuer, subject, and customer binding are immutable. Rows cannot be deleted or rebound. Future recovery must revoke the old binding and create a new reviewed binding; it must not overwrite history.

Email, phone, name, password, access token, refresh token, ID token, Persona data, and Auth0 profile payloads are not copied into this table. The Auth0 subject is intentionally excluded from Samra audit metadata and event keys.

## Request flow

1. The web or mobile client obtains an Auth0 access token for the exact Samra API audience using the provider SDK and Authorization Code with PKCE.
2. The client sends the access token in `Authorization: Bearer <token>`.
3. The API validates signature, algorithm, issuer, audience, expiration, and subject.
4. The API resolves the verified issuer and subject through the durable identity mapping.
5. The API rejects missing, unbound, revoked, suspended, and closed identities on customer-data routes; only the onboarding initialization route may create an unbound subject's pending customer and binding.
6. The API constructs the canonical customer actor from Samra-owned data.
7. Domain services authorize every customer-owned resource using that actor. Client-supplied customer selectors are ignored.

The request logger does not serialize request headers and also redacts authorization and cookie fields. Raw bearer tokens must never be written to logs, databases, analytics, audit metadata, URLs, crash reports, or client persistence owned by Samra.

## Threat controls

| Threat                                 | Control                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| ID token used as an API token          | Exact API audience and Auth0 access-token middleware                   |
| Algorithm downgrade                    | RS256 locked in code                                                   |
| Tenant or custom-domain confusion      | Exact normalized HTTPS issuer                                          |
| Customer-ID spoofing                   | Server resolves customer only from verified issuer and subject         |
| One identity bound to two customers    | Database unique key plus atomic conflict check                         |
| Concurrent duplicate binding           | Transaction plus `ON CONFLICT` idempotency                             |
| Rebinding after compromise             | Immutable mapping; revoke-and-replace design                           |
| Suspended customer retaining access    | Customer lifecycle checked on every resolution                         |
| Token leakage                          | Header-free request serialization, redaction, and no token persistence |
| Customer token reaching staff controls | Customer and workforce middleware remain separate                      |
| Auth0 outage treated as valid          | Validation fails closed; no mock fallback in Auth0 mode                |

## Acceptance criteria

The foundation is acceptable when all of the following are proven:

1. Default configuration preserves the existing synthetic demo behavior.
2. Auth0 mode cannot start without demo backend mode, PostgreSQL, HTTPS issuer, and exact audience.
3. Customer routes return 401 without a valid access token.
4. A valid but unbound subject returns `CUSTOMER_IDENTITY_UNBOUND` and no customer data.
5. A suspended or closed Samra customer returns `CUSTOMER_ACCESS_RESTRICTED`.
6. A verified active identity returns the Samra-owned customer and ignores spoofed demo actor headers.
7. Development and workforce routes remain on their separate controls and do not require a customer token.
8. Replayed and concurrent binding requests create one mapping and one audit event.
9. Attempting to bind the same Auth0 identity to another customer fails atomically.
10. Migration, typecheck, generated-contract check, API tests, PostgreSQL tests, and build pass in Linux CI.
11. No live Auth0 tenant, real token, customer PII, deployment, or Replit change is part of the evidence.

## Follow-on PR sequence

### PR A — foundation

This document, configuration, JWT middleware, durable identity mapping, canonical actor resolution, API contract, and automated tests.

### PR B — onboarding aggregate (implemented by this follow-on)

Create the Samra onboarding record and pending customer profile, bind an Auth0 subject exactly once, define verified-email/phone policy, capture consent versions, and issue the next required onboarding step. No Persona or Crossmint call occurs before this state machine is durable.

### PR C — web and mobile clients

Integrate Auth0 Universal Login in the web client and the supported Auth0 native SDK in mobile. Use Authorization Code with PKCE, request the exact API audience, use SDK-managed secure token handling, and connect the existing bearer-token getter. Do not put bearer or refresh tokens in application-managed browser local storage.

### PR D — recovery and identity operations

Define account linking, compromised-account recovery, email/phone changes, step-up authentication, MFA policy, subject replacement, administrative review, Auth0 log ingestion, retention, and customer-facing notification controls.

### PR E — Persona handoff

Start Persona only from a durable onboarding state. Persist Samra-owned case IDs and normalized decisions, verify signed webhooks, preserve raw evidence under retention controls, and keep vendor-specific payloads behind an adapter.

## Hard stops

Stop before live enablement if any of these are unresolved:

- no separate Auth0 applications for web, mobile, and machine clients;
- no exact callback, logout, and allowed-origin inventory;
- no custom API audience or RS256 configuration;
- no disposable tenant integration test using real signed access tokens;
- no reviewed signup, email verification, MFA, recovery, breach-response, and customer-notification policy;
- no privacy and retention decision for Auth0 and Persona evidence;
- any route accepts a client-provided customer ID as authorization;
- any token or Auth0 secret appears in Git, logs, screenshots, analytics, or shared documents.
