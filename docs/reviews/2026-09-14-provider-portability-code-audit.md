# Provider-portability code audit — 2026-09-14

| Field | Value |
| --- | --- |
| Scope | Source, schemas, migrations, contracts, tests, and governing documentation |
| Baseline | `9a948c62cf31294716d8ae1f9dcd4f80949d1658` |
| Method | Read-only code audit; no cloud, vendor-console, contract, or live-data inspection |
| Governing target | [Provider portability and Samra control-plane ownership](../architecture/provider-portability.md) |

## Conclusion

No P0 is currently reachable because money movement is synthetic and fails
closed. The API supports only disabled/demo backend modes, remittance uses
deterministic fakes, and Alpha Release 1 does not expose financial routes. Under
the requested severity rubric, four latent designs are still P0 because they
would create material provider lock-in or financial-integrity risk if used for
live money. They must block activation even though they are not a present loss.

The repository has a credible foundation: Samra UUIDs, provider-resource
mappings, an append-only double-entry ledger, idempotency scaffolding, durable
event records, Persona webhook authentication, and bounded Persona/Crossmint
adapter files. That foundation is not operational portability. No production
provider can be safely swapped today.

Severity means:

- **P0:** creates material lock-in or financial-integrity risk;
- **P1:** should be corrected before production Alpha;
- **P2:** acceptable early-stage debt that must be tracked with an owner/trigger;
- **P3:** cosmetic or low-value abstraction/clarity debt.

## Current reachability boundary

Evidence: backend/provider modes are disabled/demo and fake
([config](../../artifacts/api-server/src/config.ts#L3-L5)); remittance composes
deterministic fakes
([runtime](../../artifacts/api-server/src/domain/demo-runtime.ts#L180-L189));
and Alpha Release 1 allowlists onboarding rather than financial routes
([route gate](../../artifacts/api-server/src/routes/v1/index.ts#L261-L294)).

This prevents present customer-funds exposure. It does not lower the following
latent design findings, which cannot be carried into a live rail.

## P0 — material lock-in or financial-integrity risk

### 1. Provider-event replay is not bound to its original evidence

Remittance deduplication uses only `provider:providerEventId`
([events](../../lib/remittance/src/events.ts#L216-L218)). The service hydrates
the inbox only for the incoming transfer
([service](../../lib/remittance/src/service.ts#L386-L403)). PostgreSQL conflict
handling does not compare the related resource, event type, occurrence time, or
payload digest
([persistence](../../lib/db/src/postgres-persistence.ts#L468-L501)).

A provider event ID reused against a second transfer could be applied to that
second transfer while the durable row remains attached to the first. A replay
whose type or payload changed is also treated as a duplicate rather than a
conflict. Before live ingress, bind provider instance/event ID to immutable
resource, type, normalized event, and payload digest; quarantine any mismatch.

### 2. Provider command intent is not durable before the external effect

External provider calls occur inside the PostgreSQL unit of work
([service](../../lib/remittance/src/service.ts#L131-L245),
[transaction boundary](../../lib/db/src/postgres-persistence.ts#L25-L53)). A
command attempt is inserted only after a provider resource link returns and is
treated as successful
([persistence](../../lib/db/src/postgres-persistence.ts#L812-L843)). Customer
idempotency strings are reused to derive vendor keys
([service](../../lib/remittance/src/service.ts#L188-L224)).

Two customers can also supply the same header value, producing the same vendor
key when the provider scopes idempotency to one Samra account. A provider
success followed by timeout or database rollback could leave no durable local
evidence. Before live calls, persist a Samra command ID derived from the
canonical transfer, provider role, and operation plus a request digest; dispatch
outside the state transaction; and support `pending`, `succeeded`, `failed`, and
`ambiguous` recovery.

### 3. Remittance orchestration is vendor-coded and has no route snapshot

The domain provider type is closed to Rain, Caliza, and Chapa
([model](../../lib/remittance/src/model.ts#L52-L59)); ports and suite fields use
those vendor names
([providers](../../lib/remittance/src/providers.ts#L4-L51)); and the service
hardcodes their sequence
([service](../../lib/remittance/src/service.ts#L188-L229)). Core events are
`CALIZA_*`, `CHAPA_*`, and `RAIN_*`
([events](../../lib/remittance/src/events.ts#L4-L20)). The database enum repeats
the closed set ([enums](../../lib/db/src/schema/enums.ts#L66-L70)). Quotes and
transfers contain no immutable route, route version, legal-role assignment, or
cohort ([schema](../../lib/db/src/schema/remittance.ts#L174-L350)).

One-for-one fake implementations can change only while preserving the exact
current vendor semantics. A real funding, movement, payout, or refund provider
change requires edits across domain events, orchestration, persistence, ledger,
and reconciliation. Replace core vendor concepts with capability-role ports and
persist the accepted route before live money movement.

### 4. Reconciliation and ledger routing assume synthetic Caliza/Rain evidence

The demo derives the alleged external amount from Samra's own amount
([runtime](../../artifacts/api-server/src/domain/demo-runtime.ts#L468-L496)).
Runs are labeled Caliza
([reconciliation](../../artifacts/api-server/src/domain/postgres-reconciliation.ts#L15-L31)),
and are not bound to an independently obtained provider report. Settlement and
financial correction select `control_rain_usd` without persisted route
provenance
([ledger](../../lib/db/src/postgres-ledger.ts#L363-L390),
[database guard](../../lib/db/drizzle/0009_reconciliation_resolution_controls.sql#L145-L187)).

Provider-specific control accounts are correct; an unqualified default is not.
Before live routing, reconcile independent reports by provider instance, role,
currency/asset, account, and period. Preserve separate old/new-provider runoff,
residual settlement, exceptions, and closure criteria.

## P1 — correct before production Alpha

### 5. KYC has a good adapter seam but a Persona-only lifecycle

The service interface is literal `persona`
([interface](../../artifacts/api-server/src/domain/customer-identity.ts#L9-L18)).
The schema permits only Persona and only one case per onboarding
([schema](../../lib/db/src/schema/customer-identity.ts#L16-L68)). Persistence
also hardcodes Persona
([persistence](../../lib/db/src/postgres-customer-identity.ts#L145-L188)). The
model has no parallel/multiple-attempt reverification lifecycle and no durable
policy/tier/version, evidence-artifact reference, expiry, or reverification
deadline. Persona production mode is explicitly not implemented
([config](../../artifacts/api-server/src/config.ts#L213-L285)).

The signed Persona webhook and normalized decisions are strong reference code.
The production-Alpha P1 is the missing evidence/retention/reverification/exit
package. The additive multiple-attempt/mapping schema can remain tracked P2
until a second provider or actual reverification implementation is approved;
that later change must preserve the Samra customer and eligibility history.

### 6. Wallet/custody is Crossmint-, EVM-, USDC-, and single-mapping bound

The service interface is literal Crossmint/USDC
([interface](../../artifacts/api-server/src/domain/customer-wallet.ts#L11-L21)).
The core schema constrains provider, asset, and configuration to Crossmint
values ([schema](../../lib/db/src/schema/customer-wallet.ts#L16-L85)). The
separate mapping table is useful, but its Crossmint check and one-mapping-per-
wallet uniqueness prevent concurrent old/new resources
([mapping](../../lib/db/src/schema/customer-wallet.ts#L114-L142)). The wired
sandbox adapter creates one allowlisted address only; it has no signing,
transaction, recovery, balance, event, or reconciliation lifecycle
([adapter](../../artifacts/api-server/src/domain/crossmint-customer-sandbox.ts#L13-L127)).

The production-Alpha P1 is proving custody, key control, recovery,
statements/evidence, asset movement, customer action, and contractual exit. A
forward concurrent-mapping schema change can remain tracked P2 until a provider
migration is approved; a config switch will not be sufficient at that point.

## P2 — structural portability debt

| Finding | Evidence | Required trigger/disposition |
| --- | --- | --- |
| No provider-instance, capability, regulatory-role, route/cohort, concentration, treasury, or migration registry | Provider mappings are minimal and remittance has no route snapshot ([schema](../../lib/db/src/schema/remittance.ts#L28-L57)) | Add reviewed configuration before a material integration; make it durable before dynamic routing or material scale |
| Customer contracts expose Persona, Crossmint, Crossmint configuration versions, and the three remittance vendors | [OpenAPI identity](../../lib/api-spec/openapi.yaml#L1635-L1676), [wallet](../../lib/api-spec/openapi.yaml#L1720-L1778), [reconciliation](../../lib/api-spec/openapi.yaml#L2499-L2522) | Keep normalized customer behavior in public contracts; expose provider identity only for deliberate disclosure/support purposes |
| Top-level `SAMRA_PROVIDER_MODE=fake` can coexist with separate Persona/Crossmint sandbox modes | [configuration](../../artifacts/api-server/src/config.ts#L160-L285) and [composition](../../artifacts/api-server/src/domain/create-demo-runtime.ts#L79-L130) | Rename or consolidate the control before an operator could interpret it as “no external calls” |
| A replayed reconciliation run does not bind the complete report/header | Duplicate run handling updates completion without comparing provider, period, counts, or report lineage ([reconciliation](../../artifacts/api-server/src/domain/postgres-reconciliation.ts#L15-L31)) | Bind a full input/report digest before independent provider reconciliation |
| KYC schema cannot retain multiple provider attempts or a parallel reverification | Persona-only, one-case constraint ([schema](../../lib/db/src/schema/customer-identity.ts#L16-L68)) | Add an append-only attempt/mapping model only when a second provider or reverification implementation is approved |
| Wallet schema cannot retain concurrent old/new provider mappings | Crossmint-only, one-mapping constraint ([schema](../../lib/db/src/schema/customer-wallet.ts#L114-L142)) | Add active/superseded/runoff mapping states and effective dates only when a migration implementation is approved |
| Loyalty is mock/client-side, including hardcoded ShebaMiles math | [mobile](../../artifacts/samra-pay-mobile/app/%28tabs%29/rewards.tsx#L27-L57), [web](../../artifacts/samra-pay/src/lib/remittance.ts#L1-L59) | Build Samra-owned rules, points liability/history, and reconciliation before a partner adapter |
| Card, provider risk, and stablecoin settlement production domains do not exist | Cards are unavailable in API mode ([mobile cards](../../artifacts/samra-pay-mobile/app/%28tabs%29/cards.tsx#L28-L40)); risk is a static fixture ([operations fixture](../../artifacts/samra-pay-ops/src/lib/fixtures.ts#L149-L155)) | Absence is not portability. Define canonical IDs/events/mappings and ownership before selecting or enabling a provider |

## P3 — clarity and cleanup debt

- `artifacts/api-server/src/domain/crossmint.ts` is a second sandbox proof of
  concept used by tests but not runtime composition. Mark, move, or remove it in
  a separately authorized cleanup so it cannot be mistaken for production
  custody capability.
- Legacy Rain/Caliza/Chapa account labels, scenarios, and fixtures are acceptable
  synthetic history only when current docs and APIs do not present them as
  selected or portable production providers.

## Coupling by provider category

| Category | Current implementation truth | Portability today |
| --- | --- | --- |
| Authentication / Auth0 | Samra customer UUID and subject mapping are strong; schema/config are Auth0-specific | Alpha configuration can change; replacing the identity provider requires mapping, validation, session/client, and migration work |
| KYC / Persona | Bounded adapter, authenticated webhook, canonical case ID; Persona literal and one case per onboarding | Fake ↔ Persona sandbox mode only; another provider or reverification is not a low-impact swap |
| Wallet/custody / Crossmint | Canonical wallet ID and mapping; wired staging path is creation-only; aggregate and mapping are Crossmint/USDC-specific | Fake ↔ one Crossmint sandbox creator only; custody or asset migration is not implemented |
| Remittance / Rain, Caliza, Chapa | Deterministic synthetic suite; provider names define ports, events, sequence, DB enum, ledger and reconciliation assumptions | A fake can be replaced only under identical vendor roles; changing the route/provider is cross-cutting |
| Card/program | UI mock; no backend issuer, processor, instrument, event, dispute, or settlement model | Nothing operational exists to swap |
| Banking/funding | Provider unresolved; no live integration | Nothing operational exists to swap |
| Stablecoin/settlement | Crossmint creates an address; no live signing, movement, chain ingestion, settlement, or reconciliation | Nothing operational exists to swap |
| Cross-border/final mile | Synthetic remittance only; no selected live provider or direct Ethiopian institution | Nothing operational exists to swap |
| Loyalty / ShebaMiles | Client-side demo calculation and mock rewards state | No owned backend liability/history or partner adapter exists |
| Risk | Static operations fixture; no provider model or persistent decision/rule history | No provider integration exists; canonical risk control plane must come first |

Wirex, Utila, Rain, Cybrid, Nium, Cross River, Stellar, Thunes, Wise, possible
Western Union, Ethiopian institutions/MTOs, and Ethiopian Airlines/ShebaMiles
are evaluation context only. No current source establishes their contractual
role, capability, selection, or production readiness.

## What can and cannot be swapped now

The only current substitutions are non-production modes: fake Persona to the
Persona sandbox and fake wallet creation to one allowlisted Crossmint sandbox
adapter. Rain/Caliza/Chapa fakes can be replaced one-for-one only if the exact
hardcoded roles and events remain unchanged. These are implementation switches,
not provider portability.

No production provider is operationally swappable. Persona replacement needs
schema, state, evidence, API, and reverification work. Crossmint replacement
needs schema, concurrent mappings, custody/key/asset lifecycle, and customer
transition work. Remittance replacement needs capability ports, canonical
events, route snapshots, ledger selection, and independent reconciliation.
Card, banking, live settlement, cross-border/final-mile, loyalty, and risk do
not have production integrations to swap.

## Highest-leverage next actions

1. **Protect financial integrity before any live money adapter:** persist Samra
   command intent before dispatch, move external effects outside the database
   state transaction, model ambiguous outcomes, and make event replay binding
   conflict-safe.
2. **Replace vendor-coded remittance semantics:** introduce funding, movement,
   settlement, payout, refund capability ports plus canonical events, and persist
   the accepted route/version/roles on every quote and transfer.
3. **Make reconciliation provider-instance aware:** ingest independent reports,
   select control accounts from persisted provenance, hash the complete run, and
   test overlapping old/new-provider residual settlement.
4. **Close the production Alpha exit gates:** prove Persona evidence retention
   and reverification; prove Crossmint custody/key/recovery/export/asset-migration
   behavior; then add only the forward schema needed for multiple attempts and
   concurrent mappings.
5. **Create the minimum control registries before new provider selection:** exact
   capability, legal role, jurisdiction, route/cohort, concentration, treasury,
   contract, and exit evidence. Define card, risk, loyalty, and settlement
   canonical domains before an adapter, not after.

These actions are sequenced by financial integrity, current Alpha exposure,
portability leverage, and implementation cost. They are not authorization to
implement a provider, alter a contract, deploy, or activate customer capability.
