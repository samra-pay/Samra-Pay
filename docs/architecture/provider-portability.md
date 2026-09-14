# Provider portability and Samra control-plane ownership

| Field                     | Decision                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| Status                    | Accepted                                                                    |
| Decision date             | 2026-09-14                                                                  |
| Decision owner            | David Haile                                                                 |
| Approval evidence         | Direct authorization in the 2026-09-14 repository task                      |
| Source baseline inspected | `9a948c62cf31294716d8ae1f9dcd4f80949d1658`                                  |
| Applies to                | Every material external provider integration                                |
| Supersedes                | Nothing; elaborates the architecture foundation and Alpha platform decision |

This document is both the governing architecture standard and its decision
record. A second ADR would repeat the same decision without adding authority.
The dated [code audit](../reviews/2026-09-14-provider-portability-code-audit.md)
records the current implementation gap separately.

## Related records and authority boundaries

This decision governs cross-provider ownership, interfaces, evidence, migration,
and exit. The [architecture foundation](README.md) and
[Alpha platform decision](alpha-platform.md) govern current platform scope. The
[Persona identity](customer-identity-persona.md),
[Crossmint wallet](customer-wallet-crossmint.md), [ledger](ledger.md), and
[remittance](remittance.md) records govern their current domain implementation.
The [provider-state-unknown runbook](../operations/runbooks/provider-unknown.md)
governs ambiguous live operations. Those records must link back to this decision
when materially changed; none may infer deployment or provider capability from
architecture alone.

## Context and current-state boundary

Samra Pay must be able to change an execution provider without changing the
identity of its customers, accounts, transactions, balances, product rules, or
operating history. Provider access is not ownership. A provider may perform a
regulated or technical primitive; it does not become Samra's customer system,
ledger, product policy, or operating control plane.

The accepted Alpha product intent remains Auth0 authentication, Persona KYC,
and a Crossmint wallet under a future approved USDC asset/network configuration.
The current staging create request proves only a generic EVM smart-wallet
resource and does not select or verify an exact token contract or chain. Funding
and Ethiopia payout providers remain unresolved. The repository's Rain, Caliza,
and Chapa remittance paths are synthetic. This decision does not select a new
provider, validate any provider's capability, change a contract, introduce
credentials, move funds, or establish a live integration.

Names in the landscape below were discussed or are under evaluation. They are
not endorsements or verified capability claims. Due diligence must establish
the exact legal entity, product, jurisdiction, role, license, sponsor, asset
flow, data flow, and contract before a provider is entered as available.

## Decision

1. Samra owns the customer and operating control plane.
2. External providers execute narrow capabilities behind Samra-owned,
   capability-based interfaces and provider-specific anti-corruption adapters.
3. Samra canonical IDs, states, events, pricing, ledger entries, risk actions,
   routing decisions, and customer history cannot be provider-shaped.
4. Every material integration must answer **“How do we leave this provider?”**
   before it is architecture-complete.
5. An unanswered exit, data export, migration, runoff, residual-settlement,
   customer-action, or rollback question is architecture debt. Debt that can
   affect identity continuity, financial integrity, access to funds, regulatory
   evidence, or customer service is a production activation gate.
6. Portability does not mean building several providers prematurely. The Alpha
   may use one provider for a capability while preserving canonical models,
   mappings, command/event safety, evidence, and an executable exit design.

The guiding engineering test is:

> **No critical Samra domain should require knowledge of which vendor currently
> executes the underlying infrastructure service unless the vendor distinction
> is itself a legitimate business requirement.**

## Economic purpose

Portability is bargaining power and continuity, not architectural ideology.
Samra's scarce assets should become its customers, volume, corridor knowledge,
Ethiopian distribution, loyalty relationships, transaction data, and trust—not
its dependence on a vendor API. As scale justifies the operating cost, Samra
must be able to direct the next controlled cohort, including a future 10,000-
customer/account/card/transfer cohort, to another qualified provider. That
creates leverage over pricing, interchange, reserves, settlement, FX, service
levels, roadmap, exclusivity, and contract terms.

Bundled infrastructure is acceptable when it accelerates launch and all legal
roles, mappings, evidence, economics, and exit obligations stay explicit. Samra
then progressively unbundles only when scale, risk, control, or economics justify
it. A provider change must preserve the customer's Samra relationship and
history, although a regulated migration may still require reverification, a new
card, a new wallet address, disclosure, consent, or another bounded customer
action.

## Samra-owned control plane

| Domain                            | Samra is authoritative for                                                                             | Provider input is limited to                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Customer identity                 | Canonical customer/person IDs, authentication mappings, lifecycle, merge/restriction history           | Authenticated subject or identity evidence                                          |
| Accounts and eligibility          | Account IDs, lifecycle, capabilities, product eligibility, internal restrictions                       | Legally required acceptance, denial, limit, or restriction evidence                 |
| KYC operations                    | Case/attempt history, normalized status, policy version, expiry/reverification schedule, support state | Evidence collection and provider decision                                           |
| Wallets and instruments           | Samra wallet/account/instrument IDs, customer association, state, mappings, disclosures                | Custody, key, address, token, or instrument operation explicitly contracted         |
| Transactions                      | Intent, quote, route version, lifecycle, idempotency, history, dispute/support association             | Execution status and evidence                                                       |
| Financial truth                   | Double-entry ledger, holds, balances, history, corrections, reconciliation decisions                   | Statements, reports, confirmations, fees, and settlement observations               |
| Economics                         | Customer price, fee, FX rule/version, promotion, margin attribution                                    | Executable provider price, fee, FX, and limit inputs                                |
| Loyalty                           | Program rules, accrual/redemption ledger, promotion version, customer presentation                     | Partner issuance/redemption acknowledgment, including Ethiopian Airlines/ShebaMiles |
| Risk and compliance orchestration | Signals, internal rules/models, decision version, case, route restriction, audit                       | Provider risk signal or legally binding counterparty decision                       |
| Routing                           | Eligible capability set, selected provider instance, route version, cohort, fallback policy            | Availability, limits, jurisdiction, cost, SLA, and risk inputs                      |
| Operations                        | Reconciliation, exceptions, audit, analytics, customer support history and resolution                  | Provider evidence and provider-side case reference                                  |

A regulated provider remains authoritative for decisions the law or contract
assigns to it. Samra must not override those decisions. Samra owns the normalized
record and the resulting Samra product, routing, restriction, and support state.

## Reference architecture

```text
customer / staff clients
        |
        v
Samra API and authorization
        |
        +--> Samra customer, account, eligibility, pricing, loyalty, risk
        +--> Samra transaction lifecycle and versioned route decision
        +--> Samra double-entry ledger, reconciliation, audit, analytics, CX
        |
        v
canonical command + capability interface
        |
        v
provider router ----> capability / role / concentration / treasury registries
        |
        +--> provider-specific anti-corruption adapter A
        +--> provider-specific anti-corruption adapter B
        |
        v
regulated or technical provider
        |
authenticated ingress -> immutable provider evidence -> canonical event
        |
        v
Samra state transition / posting policy / reconciliation
```

The outbound command intent is durable before dispatch. The target financial
command pattern keeps provider network calls outside the transaction that
records Samra state, then resolves `pending`, `succeeded`, `failed`, or
`ambiguous` through idempotent lookup or reconciliation. The current bounded
wallet-create slice is an explicit non-production exception: it holds the
customer/onboarding transaction lock across the single provider create and
mapping attachment so a concurrent identity restriction cannot race the call.
It has a short timeout, grants no financial capability, and blocks automatic
staging redispatch after an ambiguous result. Replace that exception with a
durable dispatch/reconciliation state machine before live financial effects.

## Provider landscape and role separation

One company may bundle several roles. Samra records each role separately and
does not infer one role from another.

| Capability under discussion | Named landscape                                                                                       | Required role clarity                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Customer authentication     | Auth0 for Alpha                                                                                       | Identity provider, credential/session operator, subject mapping                                         |
| KYC                         | Persona for Alpha                                                                                     | Evidence collector, verification vendor, legally accountable decision maker, data controller/processor  |
| Wallet/custody              | Crossmint for Alpha; Utila, Rain, Cybrid under evaluation                                             | Wallet technology, custodian, key/MPC operator, asset/chain support, recovery operator                  |
| Card/program                | Wirex, Rain, Nium, Cross River, or a future issuer under evaluation                                   | Program manager, processor, issuer, sponsor bank, network, wallet/custodian, settlement party           |
| Banking                     | Cross River or a future bank under evaluation                                                         | Account holder, deposit bank, sponsor bank, payment originator/receiver                                 |
| Stablecoin/settlement       | Stellar, Utila, Rain, Cybrid, Nium under evaluation                                                   | Network, wallet/key operator, custodian, issuer/redemption party, liquidity and settlement counterparty |
| Cross-border/final mile     | Thunes, Cybrid, Wise, possible Western Union, direct Ethiopian institutions, or MTOs under evaluation | Remitter/transfer provider, correspondent, FX principal/agent, payout network, final-mile institution   |
| Loyalty                     | Ethiopian Airlines/ShebaMiles relationship under evaluation                                           | Loyalty partner and fulfillment counterparty; Samra retains rule and ledger ownership                   |

No row asserts that a named organization offers every listed role, serves the
US–Ethiopia corridor, or is approved for Samra. A network such as Stellar is not
automatically a custodian, bank, liquidity provider, licensed remitter, or
customer-facing provider. A bank, issuer, processor, program manager, network,
wallet operator, and settlement counterparty must never be collapsed into a
single generic `provider` fact.

## Canonical IDs and provider mappings

Every durable business object starts with a Samra-generated ID. Provider IDs
are opaque references attached after the Samra object exists.

The canonical mapping model must support:

- a `provider_instance_id` identifying the exact legal entity, product,
  environment, jurisdiction, and configuration—not only a vendor brand;
- Samra resource type and ID plus provider resource type and opaque ID;
- mapping state, `effective_from`, optional `effective_to`, and last-verified
  timestamp;
- route/cohort and migration-batch provenance;
- multiple historical mappings and, when migration requires it, concurrent old
  and new mappings;
- provider evidence reference and digest without exposing raw provider payloads
  to clients, logs, analytics, or ordinary support tooling;
- uniqueness on the provider-instance/resource pair and explicit rules for
  selecting the active mapping.

Changing a mapping cannot change a Samra customer, account, wallet-container,
transaction, quote, case, journal, or support ID. A provider resource may be
closed or replaced while its historical mapping and evidence remain queryable.

## Capability interfaces and anti-corruption adapters

Core interfaces are named for a capability, such as `IdentityVerification`,
`WalletProvisioning`, `PaymentFunding`, `CrossBorderTransfer`, `Payout`,
`CardAuthorization`, or `LoyaltyFulfillment`. They are not named for Persona,
Crossmint, Rain, Cybrid, or another vendor.

The capability contract uses Samra commands and normalized outcomes. Each
provider adapter alone may contain provider endpoints, status codes, webhook
types, field names, SDK objects, retry rules, and authentication mechanics. It
must translate at the boundary and preserve enough evidence to explain the
translation.

Provider-specific extensions are acceptable when they are real product or
regulatory requirements: a custody recovery ceremony, network finality rule,
issuer dispute field, payout document, or legally required disclosure. Keep the
extension behind a capability/version check and out of unrelated core models.
Do not flatten useful differences into a lowest-common-denominator interface.

## Canonical commands, events, and webhook ingress

A provider webhook is evidence, not a Samra domain event. Ingress must:

1. authenticate the exact provider instance and environment;
2. persist an immutable receipt/evidence reference before applying effects;
3. deduplicate on provider instance plus provider event ID;
4. bind the first receipt to its event type, related provider resource, mapped
   Samra resource, and payload digest, rejecting a conflicting replay;
5. normalize through the adapter to a canonical event;
6. apply a permitted state transition and any ledger policy idempotently; and
7. record disposition, reason, timestamps, correlation, and operator-visible
   recovery state.

Canonical events describe facts such as `IdentityDecisionObserved`,
`WalletProvisioned`, `FundingAccepted`, `TransferAccepted`, `PayoutCompleted`,
`SettlementObserved`, `CardAuthorizationObserved`, `ClearingObserved`,
`RefundObserved`, or `LoyaltyFulfillmentObserved`. Names such as
`RAIN_REFUNDED`, `CALIZA_ACCEPTED`, or `CHAPA_PAID` belong in an adapter event
map, not in core transition rules.

Late, duplicated, and out-of-order events must be safe. A provider event never
directly sets customer eligibility, balance truth, or a ledger result.

## Ledger, settlement, and reconciliation independence

The Samra ledger is the balance and financial-history authority. Provider
balances and reports are observations reconciled against it.

- Journals reference Samra transactions and the persisted route/provider
  provenance that caused the posting.
- Provider control accounts are explicit by provider instance, legal owner,
  asset/currency, jurisdiction, and settlement purpose. No unqualified default
  provider account may receive a posting.
- Provider success alone does not authorize a posting. A versioned Samra posting
  policy determines the journal from normalized evidence.
- Reconciliation compares independently obtained provider evidence with Samra
  transactions, mappings, journals, fees, FX, and settlement positions. It does
  not manufacture the provider side from the Samra amount.
- Corrections use new journals and retain the original discrepancy, decision,
  operator, evidence, and route version.

During a migration, old and new providers reconcile independently. Samra keeps
old mappings, in-flight transactions, disputes, reversals, chargebacks, refunds,
fees, reserves, and residual settlement open until contractual and financial
runoff is complete. A new provider cannot absorb unexplained old-provider
positions. Final exit requires zero or approved residuals, exported evidence,
closed exceptions, and a signed operational read-back.

## KYC portability and reverification

The Samra customer/person ID persists across KYC providers. Each verification
or reverification is a separate Samra case/attempt with provider mapping,
policy/tier/version, jurisdiction, normalized result, reason family, evidence
reference, timestamps, expiry, and next-reverification date.

Normalized lifecycle must distinguish at least initiated, pending, manual
review, approved, declined, unable to verify, expired, reverification required,
restricted, and provider unavailable. A new provider decision does not erase
the old case. Samra eligibility is a separate, versioned decision that consumes
the provider outcome and any legally binding restriction.

A KYC exit plan must answer how evidence is exported or retained, what the
provider may delete, what Samra is legally allowed to store, which customers
must reverify, how the same Samra customer is matched without unsafe auto-merge,
and how access/support behave during reverification.

## Wallet and custody portability

The Samra wallet/account-container ID persists even when an underlying provider
wallet, account, address, key arrangement, or asset rail changes. This is a
product identity boundary, not a claim that cryptographic keys or addresses can
always move.

Before production, document:

- who legally owns the asset and who controls each key/share;
- custody, MPC, signer, recovery, suspension, and compromise procedures;
- chain, token contract, address, memo/tag, confirmation/finality, and fee rules;
- transaction, balance, statement, and audit-evidence export;
- whether keys or addresses can move and what proof is available;
- whether a compliant on-chain/off-chain asset transfer is required instead;
- customer consent, disclosure, downtime, new-address, tax, and support effects;
- old-provider monitoring, sanctions/freeze handling, residual dust, and final
  reconciliation.

If key portability is unavailable, the migration may create a new provider
resource, preserve the Samra wallet container, bind both mappings during the
controlled cohort, transfer eligible assets under an approved instruction, and
retain the old mapping through runoff. A create-only sandbox adapter is not
evidence of production custody, signing, recovery, or portability.

## Card and program portability

Samra must model program manager, processor, issuer, sponsor bank, network,
wallet/custodian, settlement account, and dispute owner as separate roles even
when one provider bundles them. Samra owns the customer-facing card account,
product state, pricing, rewards, transaction history, support case, and mapping.

Provider adapters normalize authorization, advice, clearing, reversal, refund,
chargeback, dispute, fee, tokenization, card-status, and settlement evidence.
Provider PANs, network tokens, and account numbers remain protected mappings and
never become the Samra account ID.

A migration must explicitly decide whether cards require reissue, new PAN/token,
wallet re-provisioning, customer activation, balance/reserve movement, recurring
merchant updates, dispute/chargeback runoff, statement retention, and regulatory
notice. Old and new cohorts may coexist; an in-flight authorization and its
clearing/reversal remain attached to the original route.

## Remittance, final mile, and route ownership

Samra owns the transfer intent, quote, disclosed price, fee, FX rule, recipient,
route selection, lifecycle, ledger, reconciliation, and support history. Funding,
FX, settlement, cross-border movement, and Ethiopian final-mile payout are
separate capabilities even when one provider supplies several.

Every quote/transfer persists an immutable route snapshot containing:

- route and policy version, selection time, cohort, jurisdiction, and decision
  reason;
- exact provider instances and legal roles for funding, FX, transfer,
  settlement, and payout;
- asset/currency path, quoted provider economics, customer economics, expiry,
  limits, and expected settlement times;
- required treasury/liquidity source and control accounts;
- capability evidence version and applicable compliance/risk result; and
- fallback rule, noting that an accepted/in-flight transfer does not silently
  reroute.

Routing may consider legal eligibility, corridor coverage, availability,
success rate, speed, landed cost, FX, limits, treasury position, settlement
risk, operational capacity, customer promise, and concentration limits. Price
or provider changes after customer acceptance require a new permitted flow, not
silent mutation. Direct Ethiopian institutions and MTOs use the same mapping,
evidence, canonical-event, ledger, and reconciliation boundary as an API vendor.

## Loyalty, promotions, pricing, and risk

Samra owns versioned pricing, fee, FX, loyalty, promotion, eligibility, and risk
rules. A partner quote or risk result is an input. A partner fulfillment result
is evidence. Neither becomes Samra's rule or customer history.

For Ethiopian Airlines/ShebaMiles or another loyalty partner, Samra maintains a
double-entry or equivalently auditable points ledger, rule version, accrual,
reversal, expiry, redemption, liability, and partner reconciliation. Partner
membership IDs are mappings. Failed partner fulfillment does not erase a Samra
obligation or silently alter the customer award.

Risk stores the signal source, observed time, model/rule version, reason codes,
decision, action, reviewer, and affected capability. Provider risk intelligence
must remain replaceable and cannot be the only copy of Samra's case rationale.

## Required registries

The registries may begin as reviewed configuration and dated evidence. They must
become durable, queryable control-plane data before dynamic routing or material
scale.

### Capability registry

For each provider instance and environment: capability/version, jurisdiction,
currency/asset/network, customer/business eligibility, limits, SLA, degraded
behavior, API/webhook/idempotency support, reconciliation source, evidence date,
evidence owner, approval state, and effective dates. Unknown or stale evidence
means unavailable, not supported.

### Regulatory-role registry

Record the exact legal entity and contract that performs CIP, verifies identity,
owns KYC approval, performs OFAC/sanctions screening, performs transaction
monitoring, files SARs, legally holds USD, legally holds stablecoins, issues the
card, sponsors the program, manages the program, processes transactions, provides
ACH/RTP/FedNow origination or access, bears fraud liability, owns chargebacks,
acts as the legal remittance provider, originates the transfer, performs
destination payout, carries licensing responsibility, controls funds flow,
controls/processes data, and owns customer complaints. Also record the network,
FX principal/agent, custodian, settlement counterparty, jurisdiction,
license/sponsor, responsibility, indemnity, and escalation. Never populate a
role from marketing language.

### Concentration register

Measure exposure by provider instance, legal entity, parent, role, corridor,
currency/asset, network, bank, geography, customer cohort, percentage of
customers, transaction volume, revenue dependence, stored value, financial and
reserve exposure, settlement receivable/payable, open disputes, data/wallet/card
portability, regulatory dependency, replacement readiness, and estimated
migration complexity. Each concentration has an owner, limit, alert, mitigation,
and exit dependency.

### Treasury and liquidity register

Record the legal/operational location of customer funds and stablecoin balances;
prefunding, chargeback reserves, payout liquidity, minimum balance, intraday
exposure, settlement cycle/cutoff, FX source, spread, fees, collateral, capital
lockup, withdrawal restrictions, sweep/return mechanics, bank/account legal
owner, insolvency treatment, termination reserve release, and residual exit
process. A technically replaceable API is not portable when liquidity cannot
move or working capital doubles during overlap.

### Contractual portability register

Record term/renewal, termination assistance, notice, exclusivity, minimums,
price changes/resets, data ownership/export format and timing, KYC evidence
rights, historical transaction export, evidence retention, subprocessors,
credential/key treatment, post-termination API access, customer communication,
transition period and migration assistance, SLA, disaster recovery,
change-of-control, audit rights, open disputes, reserve release, settlement after
termination, surviving and regulatory-transition obligations, and deletion
certificate. Contract review must match the exact provider entity and capability
registry entry. These are commercial/legal requirements, not legal conclusions.

## Graceful degradation and controlled cohorts

Every capability declares `healthy`, `degraded`, `unavailable`, and `disabled`
behavior. Degradation may pause new quotes, onboarding, wallet creation, funding,
or payout while allowing safe reads, support, cancellations, or already-settled
history. It never enables mock fallback, invents success, hides an ambiguous
external result, or treats a provider balance as Samra truth.

New routes and migrations use explicit cohorts with an effective time and
version. Start with synthetic tests, then internal/disposable testers, then a
small bounded cohort, and expand only after reconciliation and support evidence.
Existing in-flight work remains pinned to its accepted route unless a reviewed
recovery transition says otherwise. A rollback must distinguish routing new
work back from reversing already executed external activity.

## Failure scenarios that the design must survive

| Scenario                                                            | Required safe behavior                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Provider times out after accepting a command                        | Mark ambiguous; query/reconcile by idempotency key before retrying or posting                                                       |
| Database commit fails after provider success                        | Recover from pre-dispatch command intent and provider lookup; never lose the external effect                                        |
| Duplicate webhook                                                   | Deduplicate without a second transition or journal                                                                                  |
| Same provider event ID arrives with different resource/type/payload | Reject and alert as a conflicting replay                                                                                            |
| Late or out-of-order event                                          | Preserve evidence; apply only a valid monotonic/recovery transition                                                                 |
| Provider API outage                                                 | Stop affected new work, preserve safe reads/history/support, and use only an approved cohort fallback                               |
| Provider or corridor outage                                         | Stop only the dependent capability/routes and expose accurate status                                                                |
| Provider has a prolonged operational outage                         | Invoke the continuity threshold, cap exposure, and migrate only through an approved route/cohort plan                               |
| Credential, webhook secret, or provider access is revoked           | Fail closed, rotate under policy, preserve reads/evidence, and reconcile ambiguity                                                  |
| Provider resource cannot be mapped to one Samra object              | Quarantine; do not auto-create, auto-merge, or post                                                                                 |
| Quote expires or provider economics move                            | Honor the accepted contract when permitted or require a new customer-approved quote                                                 |
| Provider report disagrees with Samra                                | Open an exception; no silent ledger mutation                                                                                        |
| Settlement is late, short, frozen, or insolvent                     | Isolate the position, enforce exposure limits, and follow treasury/escalation policy                                                |
| Provider becomes insolvent                                          | Stop new exposure, protect locally held evidence, isolate balances/receivables/reserves, and invoke legal/treasury continuity plans |
| Provider terminates service or withholds export                     | Invoke contractual exit, stop new exposure, retain local evidence, and move only verified cohorts                                   |
| Provider loses a license                                            | Disable the affected legal role/jurisdiction and execute the approved regulatory transition                                         |
| Sponsor bank terminates the provider/program                        | Stop dependent capabilities, protect funds/evidence, and activate the documented bank/program transition                            |
| Card network suspends the program                                   | Stop issuing/authorizations as required while preserving account access, history, support, disputes, and settlement runoff          |
| Provider stops supporting Ethiopia                                  | Disable only the affected corridor/routes and preserve recovery, refund, support, and alternative-route controls                    |
| Provider materially increases pricing                               | Reprice only under approved customer/product rules or route future cohorts to an economically approved alternative                  |
| Provider introduces unacceptable reserves                           | Enforce treasury/concentration limits; reject new exposure or migrate future cohorts without commingling residuals                  |
| Provider changes an API incompatibly                                | Hold the capability at the adapter/version boundary; fail closed and roll forward/back under a tested contract                      |
| Provider has a security incident                                    | Isolate credentials/data paths, preserve evidence, assess affected mappings/customers, and follow incident/regulatory duties        |
| Provider loses settlement-rail access                               | Stop the dependent route, isolate outstanding positions, and reconcile or move settlement through an approved alternative           |
| Samra voluntarily migrates for better economics                     | Use the same evidence, cohort, customer, treasury, runoff, reconciliation, and rollback controls as a forced exit                   |
| KYC evidence cannot transfer                                        | Reverify against the same Samra customer with controlled access and support state                                                   |
| Wallet keys or addresses cannot transfer                            | Create a reviewed replacement resource, move eligible assets, notify customers, and reconcile both                                  |
| Card credentials require reissue                                    | Run old/new cohorts, customer activation and notices; preserve dispute and clearing runoff                                          |
| Final-mile institution suspends payout                              | Stop that route, preserve the transfer and funds state, and use only an approved recovery/refund path                               |
| Refund, chargeback, or dispute arrives after cutover                | Route it to the original provider mapping and keep residual reconciliation open                                                     |

## Stage-appropriate graduation

| Stage                                  | Minimum portability posture                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpha / up to 100 invited users        | One provider per approved capability is acceptable. Require canonical IDs, bounded adapter, signed/deduplicated ingress, provider mapping/evidence, Samra ledger independence, manual registry, explicit exit/runoff plan, fail-closed behavior, and no unresolved P0/P1 gate for the capability being activated.                     |
| Approximately 10,000 customers         | Durable provider-instance/capability/role registries; versioned route/cohort data; concurrent mappings; automated provider reconciliation; treasury/concentration limits; measured SLAs; tested export and bounded migration rehearsal; a qualified alternative or documented contingency for each critical capability.               |
| Approximately 50,000–100,000 customers | Multiple proven routes where economics/risk justify them; automated health and exposure controls; independent provider reports; continuous concentration/treasury monitoring; rehearsed cutover/rollback and customer communications; capacity and support evidence; board/executive acceptance of any single-provider residual risk. |

Scale does not by itself require simultaneous live providers. The risk,
economics, recovery time, legal obligations, and concentration exposure decide
when redundancy is worth its operational and capital cost.

## Minimum migration and exit plan

Before activation, the integration owner must document:

1. exit trigger, decision owner, authority, success criteria, and maximum
   tolerable interruption/exposure;
2. exact provider entity/product/environment, roles, contracts, credentials,
   resources, customers, balances, transactions, cases, and dependencies;
3. export format, completeness test, evidence retention, and deletion rules;
4. target adapter/capability gaps and additive mapping/schema changes;
5. old/new treasury, liquidity, reserve, settlement, and capital-overlap plan;
6. shadow/read-only comparison and independent reconciliation baseline;
7. cohort order, route version, in-flight cutoff, customer action/notice, and
   support escalation;
8. idempotent command/event handling and ambiguous-result recovery;
9. rollback boundary and the external actions that cannot be rolled back;
10. old-provider runoff for reversals, refunds, disputes, chargebacks, freezes,
    evidence requests, fees, and residual settlement; and
11. final acceptance read-back, exception approval, access/credential removal,
    data deletion certificate, and retained audit record.

## Architecture acceptance checklist

A material provider integration is not architecture-complete until all twenty
questions have a dated evidence link and owner. A `no` must be registered as
debt with a deadline and activation consequence.

1. What exact capability does this provider execute?
2. Which legal entity performs the regulated function?
3. What Samra domain does it touch?
4. Is Samra or the provider the system of record?
5. What provider-specific concepts are leaking into our domain?
6. What data becomes trapped if we leave?
7. What money becomes trapped if we leave?
8. What customer actions would migration require?
9. Can another provider implement the same Samra interface?
10. Can both providers operate concurrently?
11. Can we migrate by cohort?
12. How are old transactions reconciled after cutover?
13. What reserves or prefunding remain after termination?
14. Can we export all required history?
15. Can Samra continue operating if this vendor disappears tomorrow?
16. What is the smallest functionality that should fail if this provider fails?
17. Does the agreement create exclusivity?
18. What fraud/risk data would be lost?
19. What regulatory evidence would need to be recreated?
20. How do we roll back a failed migration?

## Alternatives considered

**Encode the selected provider directly in domain types.** Rejected. It is fast
for the first adapter but makes provider status names, IDs, event sequences, and
legal-role assumptions part of Samra's core and increases migration risk.

**Build one universal lowest-common-denominator provider API.** Rejected. It
hides important custody, network, card, regulatory, and final-mile differences
and can produce unsafe implicit behavior.

**Implement multiple live providers immediately.** Rejected as a default. It
adds contracts, capital, reconciliation, operations, and failure modes before
scale justifies them.

**Use capability interfaces, provider-specific adapters, canonical state, and a
stage-appropriate exit plan.** Accepted. It preserves control without pretending
that providers or regulated roles are interchangeable.

## Consequences and deliberate limits

This decision adds up-front modeling, evidence, contract, treasury, and
operational work to every material integration. Migrations may still require
new wallets, KYC, cards, disclosures, customer action, capital overlap, downtime,
or provider-specific cleanup. Portability reduces control-plane coupling; it
does not eliminate physical, cryptographic, regulatory, or contractual limits.

The architecture may keep one adapter, manual routing, and reviewed
configuration at Alpha. It must not build unused generalized frameworks,
dynamic routing, or speculative provider implementations. Provider-specific
extensions remain acceptable at the boundary when their semantics are explicit,
versioned, tested, and absent from unrelated core logic.

The current code does not yet satisfy every requirement. The linked audit grades
that debt and separates present synthetic safety from pre-production work.
