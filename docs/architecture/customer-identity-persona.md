# Customer identity case and Persona boundary

Status: Persona is the locked Alpha KYC vendor. The Samra case model,
deterministic fake adapter, credential-gated Persona sandbox adapter, and signed
webhook boundary are implemented and tested. Sandbox mode is disabled by
default. No Persona account, template, credential, customer PII, browser flow,
or deployed webhook is connected.

## Decision

Samra Pay owns the identity case, normalized state, onboarding capability gate,
provider references, event disposition, and audit evidence. Persona is an
adapter that may collect and evaluate identity evidence; a Persona status or
payload never writes a customer capability directly.

This slice remains synthetic staging only. It does not configure Persona, store
identity documents, collect customer PII, create a wallet, change Replit, or
enable a deployment. It prepares a fail-closed server contract that can be
activated only with an approved Persona sandbox inventory.

The complete Alpha sequence is governed by
[Alpha platform and vendor boundary](./alpha-platform.md).
The cross-provider target is governed by
[provider portability and Samra control-plane ownership](./provider-portability.md).
The current interface/schema remain Persona-only and allow one case per
onboarding; they do not yet support a second provider or reverification history.
See the [dated code audit](../reviews/2026-09-14-provider-portability-code-audit.md).

## Durable model

`samra_core.customer_identity_cases` stores one current case per onboarding
aggregate. It contains only Samra and opaque provider references, normalized
state, reason family, version, and timestamps. Provider payloads, names,
addresses, email, phone, SSN, documents, selfies, Auth0 subjects, tokens, and
secrets are prohibited.

`samra_core.customer_identity_case_transitions` is append-only state evidence.
`samra_core.customer_identity_provider_events` is append-only receipt evidence
containing an opaque event reference, normalized decision, disposition, and a
SHA-256 payload digest. It never stores the provider payload.

The normalized case states are:

```text
created -> pending -> review -> approved
                   \-> declined
                   \-> error -> pending/review/approved/declined
```

Approved and declined are terminal case states. A later contradictory terminal
decision is recorded as a conflict and restricts onboarding for reviewed
operations handling, including when onboarding has already reached a later
wallet or funding stage. The wallet record and provider mapping remain durable
evidence; restriction removes progression and customer capability rather than
erasing provider history. A stale event is retained as ignored evidence and
cannot move state backward.

## Provider boundary and current limitation

The API first creates or resumes the Samra case in PostgreSQL. It then calls a
`CustomerIdentityProvider` using only the Samra case reference and a stable
provider request key. The provider adapter must make that request idempotent.
The provider inquiry reference is attached exactly once in a second database
transaction.

This is a useful adapter seam, not provider neutrality today: the TypeScript
contract, database constraints, and persistence implementation are Persona-
specific. A future provider/reverification change needs an additive case-attempt
and evidence model while retaining the Samra customer ID.

If the process stops between provider creation and attachment, a retry uses the
same request key. If the provider call fails, the case records a retryable error.
A concurrent successful caller wins over a failing caller.

The deterministic fake Persona adapter derives the same opaque inquiry
reference from the same request. The sandbox adapter pre-creates an inquiry
server-side using Persona's `Idempotency-Key`, a locked API version, the
approved template ID, and only the opaque Samra identity-case ID as
`reference-id`. Names, email, phone, address, Auth0 subject, token, and document
data are not sent by this call.

The adapter has a fixed Persona API origin, a ten-second timeout, no redirects,
and generic provider errors. It rejects a non-sandbox key at startup and cannot
be selected outside the staging deployment or without Auth0 customer mode and
PostgreSQL persistence. Selecting any non-fake identity or wallet provider also
disables the unauthenticated developer routes and internal operations controls.

## API contract

| Endpoint                                                         | Purpose                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/v1/onboarding/identity`                               | Create or safely resume the identity case and selected provider inquiry |
| `GET /api/v1/onboarding/identity`                                | Resume normalized customer-facing identity state                        |
| `POST /api/v1/provider-events/persona`                           | Verify and normalize a Persona sandbox decision webhook                 |
| `POST /api/v1/dev/onboarding/identity/{identityCaseId}/decision` | Apply deterministic fake provider evidence in non-production demo mode  |

Customer endpoints require a validated Auth0 access token. Start requires an
`Idempotency-Key` and is allowed only from durable
`identity_in_progress`. The development decision endpoint is not mounted in
production-style mode.

The Persona webhook does not use a customer or workforce token. It is mounted
before JSON parsing so its HMAC is calculated against the exact raw request
body. `Persona-Signature` must contain a timestamp within five minutes and a
valid SHA-256 signature from the current or one previous rotation secret. A
valid unsupported event receives `204`; invalid authentication receives a
generic `401`; the disabled route behaves like any missing route.

Only these verified decisions are durable:

| Persona event               | Samra decision |
| --------------------------- | -------------- |
| `inquiry.marked-for-review` | `review`       |
| `inquiry.approved`          | `approved`     |
| `inquiry.declined`          | `declined`     |

The event ID, inquiry ID, Samra case ID, normalized decision, disposition, and
raw-body digest are retained. The raw webhook and its identity attributes are
not retained. The inquiry ID must exactly match the one already bound to the
Samra case before any state transition is allowed.

## Disabled-by-default runtime inventory

| Name                                    | Classification | Source when activated                          |
| --------------------------------------- | -------------- | ---------------------------------------------- |
| `SAMRA_DEPLOYMENT_ENVIRONMENT`          | non-secret     | exact value `staging`                          |
| `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` | non-secret     | exact value `persona-sandbox`                  |
| `PERSONA_INQUIRY_TEMPLATE_ID`           | non-secret     | approved Persona sandbox inventory             |
| `PERSONA_ENVIRONMENT_ID`                | non-secret     | approved Persona sandbox inventory             |
| `PERSONA_API_KEY`                       | secret         | Google Secret Manager, sandbox key only        |
| `PERSONA_WEBHOOK_SECRET`                | secret         | Google Secret Manager, current endpoint secret |
| `PERSONA_WEBHOOK_SECRET_PREVIOUS`       | secret         | optional bounded rotation overlap              |

No value may be committed to GitHub, copied into a Docker image, stored in a
client bundle, or recorded in Qase evidence. See the
[Persona sandbox activation runbook](../operations/persona-sandbox-activation.md).

## Onboarding mapping

| Identity decision               | Onboarding state         | Capability result                                   |
| ------------------------------- | ------------------------ | --------------------------------------------------- |
| pending                         | `identity_in_progress`   | blocked                                             |
| review                          | `identity_review`        | blocked                                             |
| approved                        | `identity_approved`      | still blocked until later wallet/funding activation |
| declined                        | `restricted`             | blocked and routed to support/review                |
| contradictory terminal decision | `restricted`             | blocked for operations review                       |
| error                           | unchanged identity stage | blocked with retry/support action                   |

No identity result creates an account, wallet, balance, transfer entitlement, or
activation.

## Acceptance evidence

Linux CI must prove:

1. concurrent starts create one case and one provider inquiry binding;
2. restart returns the same normalized case;
3. provider start failure is durable and retryable;
4. exact provider-event replay produces no second transition;
5. changed evidence under the same event reference is rejected;
6. late pending events cannot move review or terminal state backward;
7. contradictory terminal decisions restrict onboarding;
8. case, onboarding, event, transition, and audit writes roll back together;
9. transitions and provider evidence cannot be updated or deleted;
10. raw Auth0 subjects, idempotency keys, and provider payloads are absent from
    audit and identity evidence;
11. financial routes remain blocked after identity approval;
12. prior-schema migration, repeat migration, generated contracts, typecheck,
    test, and build gates pass.

## Hard stops before Persona sandbox activation

- no approved Persona sandbox account, environment, inquiry template, and
  webhook endpoint inventory;
- no successful external sandbox certification of create/retry, signed webhook,
  timestamp tolerance, duplicate replay, out-of-order delivery, and secret
  rotation against the reviewed contract;
- no approved PII field map, purpose, retention schedule, deletion workflow,
  residency decision, or operations-access policy;
- no separate web, mobile, server, and webhook credential inventory;
- no reviewed customer consent, disclosure, manual-review, decline, appeal,
  recovery, and support policy;
- any plan to store provider payloads in application, audit, analytics, logs, or
  Qase evidence;
- any provider response directly granting financial capability.

## Connected client status and next build

Web and mobile now share onboarding resume, consent, normalized identity-case,
and synthetic wallet flows. The fake Persona boundary covers pending, review,
approval, decline, provider error, retry, and durable continuation into the
versioned wallet disclosure. A provider decision still cannot enable a balance,
funding, remittance, or activation capability.

The next Persona build is the web/mobile sandbox handoff after the account,
template, allowed origins, accessibility review, and PII policy are approved.
The API must return only a short-lived, customer-bound launch contract for the
already-created inquiry. The client callback may change presentation only;
only the signed server webhook may change durable KYC state.

Implementation follows Persona's official
[create-inquiry](https://docs.withpersona.com/2023-01-05/api-reference/inquiries/create-an-inquiry)
and [webhook verification](https://docs.withpersona.com/webhooks-best-practices)
contracts.
