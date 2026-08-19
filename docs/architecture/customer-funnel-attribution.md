# Customer funnel telemetry and acquisition attribution

Status: synthetic PostgreSQL and API foundation. No production tracking,
advertising SDK, customer PII, device fingerprint, provider credential, or live
deployment is enabled by this change.

## Authority boundary

Samra Pay owns the acquisition session, event vocabulary, identity link,
attribution rules, customer milestones, and reporting contract. Marketing tools
may eventually receive a limited outbound copy, but they do not define funnel
truth.

Client events are low-trust observations. They may report only an allowlisted
owned-surface interaction. A browser or mobile app cannot claim that a customer
authenticated, accepted consent, passed identity verification, activated an
account, completed a transfer, or reached a repeat-send milestone. Those facts
are derived at read time from Samra-owned PostgreSQL records.

## Data model

- `customer_acquisition_sessions` contains a random opaque session reference,
  server creation time, and 90-day expiry boundary.
- `customer_acquisition_events` is append-only. It contains the session,
  one-way command and request fingerprints, allowlisted event type, platform,
  normalized attribution dimensions, and server receipt time.
- `customer_acquisition_links` is append-only and links one acquisition session
  to at most one durable Samra customer. A customer may have multiple sessions.
- A successful link writes immutable Samra audit evidence. The Auth0 subject is
  never copied into that evidence.

The public API returns the opaque session reference for native clients and also
sets it as a first-party `HttpOnly`, `SameSite=Lax` cookie for the web. The
cookie grants no customer or financial access. Customer binding still requires
a validated Auth0 access token and an existing active Samra identity binding.

## Accepted low-trust events

| Event | Meaning | Explicitly does not prove |
| --- | --- | --- |
| `landing_view` | An owned web landing experience rendered | unique person, ad impression, signup |
| `app_open` | The owned mobile client opened | install, authenticated user, retained user |
| `quote_started` | The customer began quote input | valid or server-priced quote |
| `quote_completed` | The client displayed a quote result | accepted price, funding, transfer, ledger entry |
| `signup_started` | The customer selected the signup/onboarding path | authentication or customer creation |

No endpoint accepts raw URLs, referrers, query strings, IP addresses, user
agents, device IDs, emails, phone numbers, names, identity evidence, amounts,
currencies, provider payloads, customer IDs, Auth0 subjects, or client-supplied
timestamps.

## Attribution dimensions

Only these normalized dimensions are accepted:

- channel: `direct`, `organic_search`, `organic_social`, `paid_search`,
  `paid_social`, `referral`, `email`, `partner`, `offline`, or `unknown`;
- source, medium, and campaign: optional lowercase slugs of at most 64
  characters.

The server reports both:

1. first touch: the earliest eligible event linked to a customer;
2. last non-direct: the latest eligible pre-link event whose channel is neither
   `direct` nor `unknown`, falling back to first touch.

The customer cohort is selected by first-touch server time. Reports contain
aggregate counts only and expose no session or customer identifier.

## Samra-owned customer milestones

The report derives these stages from canonical records:

1. linked customer;
2. onboarding started;
3. all three current required consent types accepted;
4. normalized identity case approved;
5. onboarding activated;
6. first completed remittance;
7. second completed remittance;
8. third completed remittance;
9. fourth completed remittance;
10. fifth completed remittance.

Completed-send stages count only `remittance_transfers.state = 'completed'`.
Client telemetry, provider webhooks, outbox events, and screen navigation cannot
increment them.

## API and workforce access

- `POST /api/v1/acquisition/events` records one public low-trust event with an
  `Idempotency-Key`.
- `POST /api/v1/acquisition/bind` links the opaque session after Auth0 and Samra
  identity resolution.
- `GET /api/v1/internal/operations/customer-funnel` returns the aggregate
  30-day report by default or an explicit window of at most 366 days.

Only `operations_analyst` and `administrator` roles receive `funnel:read`.
Each report read creates operator audit evidence. The operations portal Reports
page consumes this generated API contract and performs no financial or
conversion-state reconstruction in the browser.

## Required evidence

The change is acceptable only when Linux CI proves:

1. migrations apply from prior schema and repeat safely;
2. concurrent event retries create one append-only event;
3. same-key changed input conflicts;
4. an acquisition session cannot be linked to two customers;
5. concurrent link calls converge on one durable link;
6. invalid or PII-shaped dimensions are rejected;
7. Auth0 subjects are absent from acquisition and audit evidence;
8. report output contains aggregate counts and no customer identifiers;
9. identity and five-send milestones come from canonical PostgreSQL state;
10. event, link, and session records reject mutation;
11. public capture remains separate from authenticated customer and workforce
    boundaries;
12. generated clients, typecheck, tests, build, and PostgreSQL gates pass.

## Hard stops before production telemetry

- no approved privacy notice, consent basis, retention/deletion procedure, or
  data-subject request process;
- no production rate limiting, bot filtering, abuse budget, or monitoring;
- no documented campaign taxonomy owner and change-control process;
- no approved cross-domain cookie, mobile install-attribution, or deep-link
  policy;
- no approved export contract for a marketing, analytics, CMS, or messaging
  vendor;
- any proposal to send PII, identity evidence, financial data, bearer tokens,
  Auth0 subjects, or raw provider payloads through acquisition telemetry.

## Next build

Instrument the owned web and mobile journeys through a shared, fail-open
telemetry adapter. Product functionality must continue when telemetry is
unavailable. The client must sanitize campaign inputs before transmission,
retry only with the same idempotency key, preserve only the opaque mobile
session reference, and bind only after durable onboarding creation succeeds.
