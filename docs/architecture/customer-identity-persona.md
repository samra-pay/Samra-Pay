# Customer identity case and Persona boundary

Status: Persona is the locked Alpha KYC vendor. The Samra case model and
deterministic fake adapter are implemented and tested; no live Persona account,
template, credential, PII, or webhook is connected.

## Decision

Samra Pay owns the identity case, normalized state, onboarding capability gate,
provider references, event disposition, and audit evidence. Persona is an
adapter that may collect and evaluate identity evidence; a Persona status or
payload never writes a customer capability directly.

This slice is synthetic only. It does not configure Persona, accept a real
webhook, store identity documents, collect PII, create a wallet, change Replit,
or enable a deployment.

The complete Alpha sequence is governed by
[Alpha platform and vendor boundary](./alpha-platform.md).

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
operations handling. A stale event is retained as ignored evidence and cannot
move state backward.

## Provider-neutral start contract

The API first creates or resumes the Samra case in PostgreSQL. It then calls a
`CustomerIdentityProvider` using only the Samra case reference and a stable
provider request key. The provider adapter must make that request idempotent.
The provider inquiry reference is attached exactly once in a second database
transaction.

If the process stops between provider creation and attachment, a retry uses the
same request key. If the provider call fails, the case records a retryable error.
A concurrent successful caller wins over a failing caller.

The current deterministic fake Persona adapter derives the same opaque inquiry
reference from the same request. A live adapter is prohibited until Persona's
idempotent-create or reference-lookup behavior is verified in writing.

## API contract

| Endpoint                                                         | Purpose                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/v1/onboarding/identity`                               | Create or safely resume the identity case and fake provider inquiry    |
| `GET /api/v1/onboarding/identity`                                | Resume normalized customer-facing identity state                       |
| `POST /api/v1/dev/onboarding/identity/{identityCaseId}/decision` | Apply deterministic fake provider evidence in non-production demo mode |

Customer endpoints require a validated Auth0 access token. Start requires an
`Idempotency-Key` and is allowed only from durable
`identity_in_progress`. The development decision endpoint is not mounted in
production-style mode.

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

## Hard stops before live Persona

- no approved Persona production account and inquiry template;
- no verified create/retry, webhook-signature, timestamp-tolerance, and event
  replay contract;
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

The next build is credential-gated Persona sandbox activation: approved
template and environment inventory, server and webhook secrets in Secret
Manager, signature and timestamp verification, normalized webhook replay, PII
retention controls, and reviewed web/mobile support and appeal paths. No
sandbox value is guessed or committed to source.
