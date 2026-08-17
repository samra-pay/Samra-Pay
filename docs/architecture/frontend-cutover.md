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
mixes local financial state and ledger-backed state.

The mobile application follows the same explicit boundary:

- EXPO_PUBLIC_SAMRA_DATA_MODE=mock preserves the existing Expo presentation and
  session-only demo behavior;
- EXPO_PUBLIC_SAMRA_DATA_MODE=api loads the synthetic actor, ledger-derived
  account balances and activity, beneficiaries, remittance options, quotes,
  transfers, and canonical transfer status through the shared generated client;
- native API mode requires EXPO_PUBLIC_API_ORIGIN unless EXPO_PUBLIC_DOMAIN
  supplies the Replit preview origin;
- API-mode cards and rewards are explicitly unavailable until their backend
  contracts exist, so mock financial data never appears as backend truth;
- React Query owns lifecycle-aware polling and stops after a terminal state or
  three consecutive fetch failures;
- the mobile client formats integer minor units but never calculates balances,
  fees, FX, recipient amounts, or canonical status.

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
7. Enable mobile remittance.
8. Replace mobile balance and activity.
9. Keep unsupported mobile financial previews unavailable in API mode.
10. Remove only the mocks whose API replacements have passed.

Rewards, credit, card controls and settings remain explicit legacy demos until
their domains exist.

## UI truth rules

- submission success means processing, not completed;
- completion appears only after the fake payout event and ledger transition;
- reload during processing recovers by transfer ID;
- a retry reuses the same idempotency key;
- API errors show an error and retry action;
- API mode never silently returns mock balances or statuses.
