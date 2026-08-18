# Backend assurance release readiness

## Conclusion

The functional baseline for the bounded durable-backend and ledger-assurance
build is GitHub commit `c529764f9fe465a08fbb6e6cc8bb9f26c4a3afc5`.

This means the synthetic PostgreSQL backend, control ledger, reconciliation
controls, operations read model, workforce access, case-management controls,
Qase reporting, and materialized balance read path have automated acceptance
evidence. It does not mean the product is approved for real customer money,
production staff access, or live provider traffic.

## Authoritative evidence

- [Wave 12 pull request](https://github.com/haileleuld87/Samra-Pay/pull/23)
- [Final Wave 12 CI run](https://github.com/haileleuld87/Samra-Pay/actions/runs/32099923188)
- [Final materialized balance performance run](https://github.com/haileleuld87/Samra-Pay/actions/runs/32099923141)
- [Ledger performance baseline](./ledger-performance-baseline.md)
- [Qase reporting contract](./qase-ci.md)

The final clean commit passed the Linux quality gate, PostgreSQL persistence
gate, HTTP-to-PostgreSQL acceptance gate, automated Qase report, one-million-
posting materialized balance gate, and Qase performance report. Duplicate
push-event runs also passed, providing an independent repeat of the standard
Linux, PostgreSQL, HTTP, and Qase gates.

## Proven controls

| Control area     | Current evidence-backed state                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence      | PostgreSQL owns durable transfers, provider evidence, idempotency, outbox, reconciliation, workforce, cases, audit, holds, journals, and projections.          |
| Atomicity        | Transfer, ledger, hold, reconciliation, case, audit, and outbox changes commit or roll back at explicit transaction boundaries.                                |
| Double entry     | Every posted journal requires at least two accounts, positive minor-unit amounts, one currency, and equal debits and credits.                                  |
| Idempotency      | Logical business events, provider commands, reversals, reconciliation resolutions, and rebuild commands reject changed replay evidence.                        |
| Concurrency      | Concurrent reserve, terminal-state, reversal, journal, and projection operations are serialized or resolve to one valid result.                                |
| Immutability     | Posted journals, postings, audit events, reconciliation resolutions, and terminal financial evidence reject update or deletion.                                |
| Balance truth    | Application reads use a materialized projection; journals, postings, and active holds remain the deterministic rebuild source.                                 |
| Drift and repair | Full-account sweeps detect exact drift; controlled operator commands rebuild atomically and append immutable evidence.                                         |
| Restart          | Durable transfer, worker, ledger, projection, idempotency, and audit behavior survives new processes and database connections.                                 |
| Reconciliation   | Exceptions are durable, visible, append-only in history, and resolved only through controlled evidence-backed commands.                                        |
| Operations       | The synthetic operations portal has server-enforced workforce roles, transaction/customer search, audit visibility, reconciliation review, and case workflows. |
| Test management  | GitHub Actions produces retained JUnit artifacts and reports the automated backend and ledger suites to Qase.                                                  |

## Performance decision

At one million postings on one account, the final GitHub run measured a
materialized balance-read p99 of `0.815ms`, against a hard `25ms` gate. The
100,000-posting p99 was `0.837ms`; increasing history 10x did not degrade the
read path. The query plan uses indexed product, ledger-account, and projection
lookups and does not scan journal history.

## Qase state

The 52 imported Claude ledger cases are mapped as `SAMP-39` through `SAMP-90`.
Two additional automated projection cases extend that set. GitHub CI is the
technical pass/fail authority; Qase is the durable test-management and reporting
record.

Manual Qase execution remains appropriate for the operations portal's visual
behavior, role-specific navigation, customer-support workflows, audit explorer,
and Replit runtime configuration. Manual review is not a substitute for the
PostgreSQL gates and must not be used to override a failed automated invariant.

## Hard boundaries

The following remain deliberately unimplemented or unapproved:

- real Rain, Caliza, Chapa, bank, card-network, or settlement traffic;
- real customer PII or production money;
- production identity federation, MFA, lifecycle automation, and secret
  management;
- shared or production database migration;
- production deployment, backup/restore certification, alerting, and on-call
  operations;
- legal, licensing, remitter-of-record, corridor, safeguarding, and regulatory
  approval;
- any balance, journal, transfer, refund, or reconciliation override in the
  employee portal.

Crossing any boundary requires a separately authorized phase with named owners,
environment-specific rollback, security and compliance review, and fresh Qase
acceptance evidence.

## Next decision

Do not add more ledger-foundation behavior by default. The next controlled work
sequence is:

1. run the manual Qase operations-portal plan against the current Replit
   synthetic environment;
2. record defects without changing financial invariants to accommodate the UI;
3. decide whether to authorize a production-readiness phase covering identity,
   secrets, database operations, observability, backup/restore, and provider
   contracts;
4. connect real providers only after that phase and the legal corridor gates
   pass.
