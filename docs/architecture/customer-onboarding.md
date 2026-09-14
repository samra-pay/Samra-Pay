# Customer onboarding and consent foundation

## Decision

Samra Pay owns the customer ID, onboarding state, consent evidence, capability
decisions, and audit trail. Auth0 proves that an external subject authenticated;
it does not create a financial entitlement. The locked Alpha sequence is Auth0
authentication, Persona KYC, and creation of a Crossmint non-production EVM
smart-wallet resource intended for a future approved USDC configuration. The
current adapter neither selects nor verifies a USDC token contract or exact
network. Funding and Ethiopia payout remain unresolved. Cybrid, Rain, and
Bridge are post-Alpha wallet alternatives, not active integrations.

This foundation creates one durable customer and one onboarding aggregate
across web and mobile. The default connected path creates and resumes the
Samra-owned synthetic wallet record through the fake Crossmint adapter. A
separately guarded staging mode can call Crossmint to create a generic EVM
smart-wallet resource, but no deployed Samra-to-Crossmint journey is evidenced.
This does not configure Auth0, call live Persona, fund an account, enable a
deployment, or change Replit. See
[Alpha platform and vendor boundary](./alpha-platform.md).

## Runtime boundary

The endpoints exist only in the disabled-by-default Auth0 plus PostgreSQL demo boundary defined in [Customer identity and Auth0 foundation](./customer-identity-auth0.md). The current consent catalog is explicitly `non_production`; it is architecture and test evidence, not approved legal text. A returned `consentBundle` is the current server-selected catalog to present. It is not proof that the customer accepted that version; accepted evidence remains in the append-only consent records and a missing current acceptance is exposed through `submit_required_consents`.

## Web and mobile journey boundary

Web and mobile now consume one shared onboarding state model and one generated
API adapter. Both surfaces provide the same four-step progress model, explicit
versioned consent decisions, durable resume behavior, normalized identity and
wallet states, reviewed failure copy, and a clear stop before funding,
remittance, balances, or activation. A staging wallet resource remains in a
separate customer-control setup stage. The current transition guard cannot mark
it ready; a future reviewed migration may open that path only with durable,
server-verified signer and recovery evidence.

Mock mode uses an in-memory, deterministic journey with synthetic identifiers
and explicit fake Persona controls. API mode uses only server responses and
never falls back to that synthetic state. A backend outage keeps the saved
server record authoritative and produces a retryable error.

No legal choice is preselected. The connected clients do not store onboarding
state, identity evidence, access tokens, refresh tokens, provider payloads, or
PII in browser storage or mobile `AsyncStorage`. Mobile storage is limited to a
named boolean demo-session marker in mock mode.

Auth0 remains a deliberate configuration gate:

- web will use Universal Login and request the configured API audience and
  scopes through the Auth0 React SDK;
- mobile has a disabled-by-default native Auth0 adapter and Expo config plugin;
  the default mock build does not load either and remains compatible with Expo
  Go, while API mode requires a complete reviewed native Auth0 configuration;
- both clients will resolve short-lived tokens on demand through the shared
  request boundary; the request module does not persist them;
- API-mode login stays disabled until tenant, application, audience, callback,
  logout, and deep-link values are supplied and validated.

Official implementation references: [Auth0 React SPA quickstart](https://auth0.com/docs/quickstart/spa/react),
[Auth0 Expo quickstart](https://auth0.com/docs/quickstart/native/react-native-expo),
and [Auth0 React Native SDK](https://github.com/auth0/react-native-auth0).

## Durable model

`samra_core.customer_onboardings` is the current aggregate. It carries:

- one immutable Samra customer binding;
- the canonical current state;
- the latest completed step;
- a normalized reason family;
- an optimistic-concurrency version;
- state-entry and record timestamps.

`samra_core.customer_onboarding_transitions` is append-only state history. `samra_core.customer_consents` is append-only consent evidence with the consent type, document and bundle versions, locale, decision, server channel, and a one-way hash of the client idempotency key. Raw Auth0 subjects, tokens, email, phone, name, passwords, and provider payloads do not enter consent or audit evidence.

Pending customer rows intentionally have null profile fields. The API presents a clear pending-profile label to workforce users; it does not manufacture a customer name or country from untrusted Auth0 claims.

## Email, phone, and duplicate policy

Email, phone, and name claims are attributes, never identity keys or authorization inputs. This phase does not copy them from an access token. A future profile command may accept a contact attribute only after the exact Auth0 application, verification claim, normalization rule, change-notification rule, and retention purpose are approved. A verified email or phone still cannot automatically merge two Samra customers.

Because this foundation has no safe duplicate-person signal, a new Auth0 subject receives a separate profile-pending record and no financial capability. The Persona phase must compare normalized identity outcomes before wallet creation and route a potential duplicate to audited review. It must not create a second wallet or auto-merge records.

## State and capability gate

The durable states are:

```text
not_started
authenticated
consent_pending
identity_in_progress
identity_review
identity_approved
bank_link_pending
bank_matched
wallet_consent_pending
wallet_provisioning
wallet_control_setup
wallet_ready
funding_ready
activated
restricted
```

Only `activated` may pass the existing customer financial-route actor resolver. A bound customer in every other onboarding state receives `CUSTOMER_ONBOARDING_REQUIRED`. A revoked Auth0 binding or suspended or closed customer receives `CUSTOMER_ACCESS_RESTRICTED`. Existing synthetic customers without an onboarding row retain the pre-existing test behavior; a controlled onboarding start backfills them as activated.

The database trigger permits only the reviewed forward transition graph and transition to `restricted`. It rejects skipped activation, stale version changes, identity rebinding, evidence updates, and evidence deletion.

## API contract

| Endpoint                                   | Purpose                                    | Result                                                                                                    |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/onboarding`                  | First-login initialization or safe resume  | `201` when the aggregate is created, `200` when it already exists                                         |
| `GET /api/v1/onboarding`                   | Cross-surface resume                       | Current durable state, current catalog, and an explicit re-consent action when accepted evidence is older |
| `POST /api/v1/onboarding/consents`         | Submit the complete current consent bundle | Immutable decisions plus one atomic aggregate transition                                                  |
| `GET /api/v1/onboarding/wallet/disclosure` | Retrieve the active wallet disclosure      | Exact versions, canonical presentation copy, and explicit disabled capabilities                           |
| `POST /api/v1/onboarding/wallet`           | Record wallet disclosure and create/resume | Normalized wallet state; no provider resource identifier, PII, balance, or funding                        |
| `GET /api/v1/onboarding/wallet`            | Cross-surface wallet resume                | Current normalized Samra wallet state                                                                     |

All endpoints require an already validated Auth0 API access token. Every
command endpoint requires `Idempotency-Key`. No endpoint accepts a customer ID,
Auth0 subject, email, phone, name, KYC status, wallet status, or capability from
the client.

## First-login transaction

The server normalizes the configured issuer and verified token subject, then takes a transaction-scoped identity lock. In one PostgreSQL transaction it:

1. resolves the existing immutable identity binding, if present;
2. otherwise creates a profile-pending Samra customer with a server-generated external reference;
3. binds the Auth0 issuer and subject exactly once;
4. creates the onboarding aggregate at `consent_pending`;
5. appends the initial transition and redacted audit evidence;
6. commits all records or none.

Concurrent calls across API processes resolve to the same customer and onboarding IDs. A restart reads the same aggregate from PostgreSQL.

## Consent transaction

The server, not the client, owns the current consent catalog. A submission must contain exactly one decision for every required document and must match the current bundle, document versions, and locale.

In one transaction the server:

1. locks the authenticated identity and onboarding aggregate;
2. verifies the hashed idempotency command and request fingerprint;
3. appends each versioned consent decision;
4. for initial consent, moves an accepted bundle to `identity_in_progress` or records a normalized decline while remaining `consent_pending`;
5. for a later catalog version, preserves the customer's existing progress after acceptance or moves the onboarding and any exposed wallet access to `restricted` after decline;
6. appends transition and redacted audit evidence;
7. stores the exact response for deterministic replay.

A reused key with changed decisions returns a conflict. A declined customer may later submit a new command and continue only while initial consent remains pending. When the catalog advances, GET advertises the current bundle and re-consent action without erasing the durable identity or wallet stage; a later decline restricts access. Old and current consent rows remain separate immutable evidence and transition history records the same-state refresh. Stored consent and transition rows cannot be updated or deleted.

## Operations visibility

The operations customer summary separates onboarding customers from activated customers with statuses such as `onboarding_consent_pending` and `onboarding_identity_in_progress`. Missing profile fields render as `Customer profile pending` and `--`; the source columns remain null. This lets support see the customer without presenting placeholder text as canonical profile truth.

## Failure behavior

| Failure                                           | Server behavior                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Missing or invalid access token                   | `401 CUSTOMER_AUTHENTICATION_REQUIRED`                                            |
| Valid but uninitialized identity on resume        | `403 CUSTOMER_IDENTITY_UNBOUND`; client must call first-login initialization      |
| Non-activated customer accesses financial route   | `403 CUSTOMER_ONBOARDING_REQUIRED`                                                |
| Revoked identity or suspended or closed customer  | `403 CUSTOMER_ACCESS_RESTRICTED`                                                  |
| Missing or malformed idempotency key              | `422 VALIDATION_ERROR`                                                            |
| Wrong, incomplete, or duplicate consent catalog   | `422 INVALID_ARGUMENT`                                                            |
| Same idempotency key with different decisions     | `409 CONFLICT`                                                                    |
| Disallowed state jump or repeat after progression | `409 INVALID_TRANSITION`                                                          |
| Database failure during a command                 | Full rollback; no partial customer, binding, consent, transition, or audit record |

## Acceptance evidence

The change is acceptable only when Linux CI proves:

1. generated OpenAPI, React client, and Zod contracts are synchronized;
2. first login creates one customer, identity binding, aggregate, transition, and audit trail;
3. concurrent first-login calls across two pools return the same IDs;
4. pending profiles contain no copied Auth0 email, phone, name, or token data;
5. financial routes remain blocked before activation;
6. consent acceptance, decline, recovery, and same-key replay are atomic;
7. changed-request key reuse is rejected;
8. restart returns the same aggregate and replay response;
9. consent and transition evidence is append-only, and a current-version refresh preserves prior acceptance evidence and onboarding progress;
10. raw subjects and raw idempotency keys are absent from audit evidence;
11. prior-schema migration and repeat migration remain safe;
12. the full workspace test, typecheck, build, and PostgreSQL gates pass.

## Implemented follow-on and next build

The provider-neutral identity case and deterministic fake Persona adapter are
defined in [Customer identity case and Persona boundary](./customer-identity-persona.md).
They may start only from `identity_in_progress`, and provider decisions never
write customer capability fields directly.

The web and mobile onboarding journey is connected to durable onboarding
resume, consent, normalized identity state, explicit wallet disclosure, and
wallet create/resume. Both surfaces use the same query keys and generated
transport adapter. They retrieve the active disclosure from the server, accept
only an exact response that matches the client's compiled disclosure allowlist,
render the validated canonical presentation, keep acceptance unselected, and
submit the corresponding allowlisted version tuple. That client-side pin is a
fail-closed contract check; it does not let the client select provider mode or
invent legal copy. Within a mounted journey, both surfaces reuse one command
key. After a reload, an interrupted synthetic `provisioning` record exposes an
explicit resume action backed by the server-stored wallet command and provider
request key. Staging `provisioning` or `error` instead preserves the original
command and blocks another create while the upstream outcome is ambiguous. The
clients refresh onboarding and wallet truth after both success and failure,
then offer status refresh rather than another staging create. Provider
lookup/reconciliation remains a launch requirement before that state can be
resolved.

When the base or wallet disclosure catalog advances, the same journey pauses at
the relevant current disclosure before offering the later stage again. A base
acceptance appends new evidence while preserving the durable stage. A legacy
wallet disclosure can likewise be refreshed through the existing wallet command
without replacing its original consent reference or dispatching a second
provider create for a completed staging resource. Until refreshed, the API does
not expose a funding continuation action.

The clients display only normalized Samra state. They do not store wallet truth
locally or show a provider wallet identifier, setup-stage public address or
custody/control label, token balance, or financial entitlement. Normalized
storage is portability groundwork; it does not establish that the current
Crossmint-specific mapping can execute or survive a provider migration.

Live Auth0 tenant configuration, Persona sandbox configuration, Crossmint
sandbox credentials, and a reviewed mobile custom-development-build and
distribution workflow remain hard stops, not values to guess. The native
boundary exists in code but is not connected to an Auth0 application or live
token.

The Samra-owned funnel telemetry and acquisition attribution foundation is
defined in [Customer funnel telemetry and acquisition attribution](./customer-funnel-attribution.md).
It records allowlisted low-trust interactions without PII and derives identity,
activation, and first-through-fifth-send milestones only from canonical
PostgreSQL state.

The owned web and mobile journeys now use the shared fail-open telemetry
boundary. Web stores no acquisition value in browser-managed storage, mobile
stores only the opaque session reference, and binding follows successful durable
onboarding creation.

The alpha experience also enforces these customer-facing boundaries:

- every required consent has an owned, version-independent review route on web
  and mobile before selection;
- legal copy states current synthetic/non-production behavior and does not
  imply that Auth0, Persona, wallet, bank-funding, or payment providers are
  live;
- onboarding and identity-query failures replace the state-changing journey
  with an explicit retry boundary and never substitute local truth;
- web stage changes move keyboard focus to the new heading, mobile stage
  changes announce the new title and description, and status/error/progress
  semantics are explicit;
- wallet readiness does not route an API-mode customer into financial screens
  while funding, remittance, balance, and activation remain disabled; only mock
  mode may continue into the synthetic dashboard.

Raw and gzip performance budgets are enforced for the built customer web,
onboarding, mobile, and operations artifacts. Crossmint remains blocked until
final manual keyboard/screen-reader/device evidence, live identity
configuration, the reviewed sandbox asset/network, and credential inventory are
approved.
