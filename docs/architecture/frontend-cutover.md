# Frontend Cutover Contract

The current interfaces are the visual acceptance baseline. Backend work is
additive, and both clients default to their current mock data.

## Stable data-source boundary

Screens consume a Samra data-source interface rather than importing generated
transport hooks directly:

- current customer;
- accounts and ledger-derived balances;
- activity;
- actor-owned beneficiaries;
- remittance options;
- quote creation;
- transfer creation, list and detail;
- transfer cancellation.

The web cutover implements one API adapter and one hard boundary:

- `ApiSamraDataSource` calls the versioned generated client.
- default `mock` mode renders the untouched legacy overview and remittance
  components and does not route their local state through the new data-source
  interface;
- the mock-side interface deliberately rejects financial calls, preventing a
  new screen from accidentally treating legacy fixture state as API data.
- `api` mode renders the backend customer, ledger-derived account balances,
  activity, beneficiaries, quotes, transfers and transfer status;
- financial preview pages without an approved backend contract render an
  explicit unavailable state in `api` mode instead of falling back to mocks;
- stalled generated-client requests fail after 15 seconds with a retryable
  timeout error.

The route choice is fixed at the application boundary. A single workflow never
mixes local financial state and ledger-backed state. Mobile has a validated,
portable API-origin boundary that initializes the generated client before any
screen can issue a request. The mobile remittance screen now uses that boundary
in API mode; mobile balance and activity remain legacy demos until their own
cutovers pass.

## API conventions

- application routes are under `/api/v1`;
- IDs are opaque strings;
- timestamps are UTC ISO-8601 strings;
- money is `{ currency, minorUnits: string }`;
- exchange rates are decimal strings;
- command endpoints require `Idempotency-Key`;
- problem responses have stable `type`, `title`, `status`, `code` and
  optional `detail`, `fieldErrors`, `traceId`;
- frontend statuses are Samra statuses, never raw provider statuses.

## Sequence

1. Add ledger, fake providers and API with no screen imports.
2. Add generated contract and the stable API data-source adapter.
3. Enable web `/remittance` and `/dashboard/remittance` in API mode.
4. Replace web overview identity, balance and activity in API mode.
5. Keep unsupported financial previews explicitly unavailable in API mode.
6. Stabilize the contract.
7. Enable mobile remittance. **Complete.**
8. Replace mobile balance and activity.
9. Remove only the mocks whose API replacements have passed.

Rewards, credit, card controls and settings remain explicit legacy demos until
their domains exist.

## UI truth rules

- submission success means processing, not completed;
- completion appears only after the fake payout event and ledger transition;
- reload during processing recovers by transfer ID;
- a retry reuses the same idempotency key;
- API errors show an error and retry action;
- API mode never silently returns mock balances or statuses.
