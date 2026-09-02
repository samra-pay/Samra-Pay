# Incident response framework

Status: documented, not staffed, not exercised, and not production-approved.

This framework turns an operational event into explicit containment,
ownership, evidence, and recovery decisions. It does not create an on-call
rotation or promise a response time.

## Severity

| Severity | Use when                                                                                                                            | Default posture                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| SEV0     | Financial integrity or data loss is suspected; a credential may be compromised; or an active security emergency exists              | Stop affected economic commands, preserve evidence, and require incident-command authority for recovery |
| SEV1     | A critical customer, authentication, reconciliation, database, or provider boundary is unavailable without confirmed integrity loss | Fail closed where financial state is uncertain; contain and diagnose                                    |
| SEV2     | A material degradation has a safe workaround and no known integrity impact                                                          | Limit scope, monitor evidence, and schedule correction                                                  |
| SEV3     | A minor defect or documentation gap has no material customer or financial impact                                                    | Track through the normal delivery process                                                               |

SEV0 and SEV1 require paging once a staffed route exists. No route exists today.
Do not represent that requirement as active coverage.

## Roles

Every incident record must name one person per active role. The contract leaves
all owners `null` until a roster is approved.

- Incident commander: owns severity, containment, decision cadence, and exit.
- Technical lead: owns diagnosis, change options, verification, and rollback.
- Operations lead: owns financial exposure, reconciliation, and customer-impact evidence.
- Security lead: owns credential, access, forensic-preservation, and disclosure decisions.
- Communications lead: owns approved internal and external updates.
- Scribe: records timestamps, facts, hypotheses, approvals, commands, and evidence links.

One person may temporarily hold more than one role only when the incident
commander records the capacity risk. Nobody silently assumes authority to move
money, expose traffic, rotate production credentials, restore a database, or
contact a provider.

## Lifecycle

1. **Declare.** Open the incident record. Record the reporter, start time,
   affected surfaces, observed symptoms, known data boundary, and initial
   severity. Mark every unverified statement as a hypothesis.
2. **Assign.** Name the incident commander, scribe, and required specialist
   roles. If no authorized owner is available, maintain safe containment and
   record the escalation gap.
3. **Contain.** Stop only the affected operations. Preserve immutable logs,
   release identity, audit records, and provider references. Never substitute
   mock balances or silently retry an uncertain economic command.
4. **Diagnose.** Build a timestamped timeline. Separate customer symptoms,
   application state, ledger truth, reconciliation state, provider state, and
   infrastructure state.
5. **Recover.** Record the proposed action, owner, expected effect, rollback,
   objective checks, and explicit approval before a material change.
6. **Verify.** Prove revision identity, authorization, health, ledger
   invariants, reconciliation status, and customer behavior independently.
7. **Close.** Record the end time, residual exposure, customer or regulatory
   follow-up, and named corrective actions. Severity may be reduced only with
   evidence.
8. **Learn.** Complete the postmortem for SEV0/SEV1 and for any event with money,
   credential, data, or recovery risk. Track actions to an owner and date.

## Evidence rules

- Use the incident-record template from the first declaration.
- Capture exact UTC timestamps and immutable release identifiers.
- Record who approved every traffic, credential, database, provider, or money
  boundary change.
- Link to evidence; do not paste secrets, tokens, raw payloads, customer PII,
  or database dumps into the record.
- Preserve contradictions instead of silently choosing the convenient account.
- Treat dashboard output as a signal. The Samra ledger, database records,
  reconciliation evidence, and executed approvals govern financial truth.

## Runbook routing

- [API outage](runbooks/api-outage.md)
- [Ledger integrity breach](runbooks/ledger-integrity-breach.md)
- [Reconciliation stall](runbooks/reconciliation-stall.md)
- [Provider state unknown](runbooks/provider-unknown.md)
- [Credential compromise](runbooks/credential-compromise.md)
- [Database recovery](runbooks/database-recovery.md)
