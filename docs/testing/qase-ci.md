# Qase CI reporting

Qase is the Alpha test-management and evidence system. GitHub Actions remains
the technical pass/fail and merge authority. A manual result can add visual or
operational evidence; it cannot override a failed automated P0 control.

## Authority and machine-readable sources

| Concern                                                        | Authority                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cadence and required gates                                     | [`testing-cadence.json`](testing-cadence.json)                     |
| Qase project, plans, environments, catalogs, and JUnit reports | [`qase-governance.json`](qase-governance.json)                     |
| Portable client manual cases                                   | [`qase-portable-client-smoke.csv`](qase-portable-client-smoke.csv) |
| Claude ledger case IDs                                         | [`qase-ledger-case-map.csv`](qase-ledger-case-map.csv)             |
| Exact-SHA release evidence                                     | [`release-evidence-contract.json`](release-evidence-contract.json) |

This document explains those contracts. It does not duplicate their complete
inventories. Renaming a governed Node test changes its automation identity and
must be treated as a mapping change.

## Automated reporting

The governed JUnit inventory is:

```text
postgres-persistence.xml
postgres-http.xml
daily-synthetic-journeys.xml
postgres-process-restart.xml
ledger-journal-assurance.xml
ledger-sweeps.xml
ledger-reconciliation-controls.xml
ledger-account-resolution.xml
ledger-balance-computation.xml
ledger-currency-precision.xml
ledger-idempotency.xml
ledger-holds-lifecycle.xml
ledger-reversals-refunds.xml
ledger-immutability-audit.xml
ledger-concurrency-atomicity.xml
ledger-materialized-balances.xml
```

- `QASE_API_TOKEN` is the only Qase credential and stays in encrypted GitHub
  repository secrets.
- Automated acceptance uses `github-ci-postgres`: disposable PostgreSQL 16 and
  synthetic data, not a deployed environment.
- Replit remains `replit-development` for manual synthetic browser evidence.
- Run titles contain cadence, branch, and exact commit.
- GitHub validates all expected non-empty JUnit files, then uploads the governed
  directory once. Qase completion occurs only after that batch succeeds.
- Pull requests use their merge-ref run; feature-branch pushes do not create a
  second record. Merged `main` is proven independently.
- Qase-triggered runs attach to the supplied run ID. Forks without the secret
  skip reporting.
- Ordinary CI remains technically authoritative if Qase is unavailable. An
  exact-SHA release candidate fails when its required Qase record cannot be
  created, uploaded, or completed.
- JUnit artifacts remain in GitHub independently of Qase according to the
  retention in the governing contracts.

Daily, weekly performance, weekly resilience, and release-candidate behavior
are owned by the [testing strategy](testing-strategy.md), not repeated here.

## Governed plans

| Plan                             | Use                                                                    |
| -------------------------------- | ---------------------------------------------------------------------- |
| P0 — Critical Financial Controls | Ledger, money, idempotency, refund, reversal, or reconciliation change |
| P1 — Operations Portal Smoke     | Workforce, portal, case, audit, or reconciliation UI change            |
| P1 — Customer Web & Mobile Smoke | Browser, iOS, Android, or cross-surface recovery change                |
| P2 — Full Backend Regression     | Release candidate or broad platform cutover                            |

The portable-client catalog maps to `SAMP-101` through `SAMP-115` under suite
`12 Portable Client Smoke`. Before bulk replacement, verify case and suite IDs
against `qase-governance.json`. Never infer current Qase state from an old
spreadsheet or screenshot.

The Claude ledger map preserves `SAMP-39` through `SAMP-90` as durable case IDs.
JUnit `testsuites`, `testsuite`, and exact test titles provide automation
identity. Two later materialized-balance controls extend the original map by
title until stable Qase IDs are recorded in the CSV.

## Manual evidence

Use manual plans for visual behavior, role-specific navigation, browser/device
interaction, support workflows, and audit exploration. Every run must identify
the exact commit, environment, configuration, tester, evidence, and defects.
Unowned scheduled manual runs should be removed rather than accumulated.

## Credential rotation

Create a replacement token, update `QASE_API_TOKEN`, verify one governed run,
then revoke the previous token. Never store a Qase token in source, workflow
YAML, logs, fixtures, screenshots, or shared documents.
