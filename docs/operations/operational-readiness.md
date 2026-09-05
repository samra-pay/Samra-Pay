# Operational readiness boundary

Status: repository foundation prepared; production approval blocked.

The machine-readable authority is
[`operational-readiness.json`](operational-readiness.json). This document does
not claim staffed operations, live monitoring, approved service levels, or
recoverability of any cloud database.

## Current state

| Control             | Present in this repository                                                                                                                                    | Not proved or activated                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Telemetry           | Structured process and request logs exist; an OTLP `http/protobuf` target contract defines safe fields and dimensions                                         | No collector, backend, end-to-end trace export, dashboard, retention policy, alert, or notification route               |
| Incident response   | Severity model, unassigned roles, incident record, postmortem template, and six scenario runbooks                                                             | No roster, on-call rotation, paging, response target, communication channel, or completed exercise                      |
| Service levels      | Four indicators are named so later targets have an explicit denominator and data owner                                                                        | No production measurements, targets, windows, error budgets, or alert thresholds                                        |
| Recovery            | A weekly workflow is configured to dump and restore a synthetic disposable PostgreSQL database and compare tables, sequences, triggers, and ledger invariants | No backup-freshness proof, point-in-time recovery proof, cloud restore-to-clone exercise, approved RPO, or approved RTO |
| Provider resilience | Unknown, degraded, unavailable, and misconfigured states fail closed in the operating contract                                                                | No live health signal, automatic retry policy, provider sandbox exercise, or provider activation                        |

“Configured” is not “executed.” The weekly recovery result exists only when a
GitHub Actions run produces both the JUnit and JSON artifacts for the exact
commit. The JSON contains fingerprints and timings, never the database dump.

## Telemetry decision

The current runtime output contract is `structured-json-stdout`. The future
transport contract is OpenTelemetry Protocol over HTTP/protobuf. It keeps the
application independent of an observability vendor. The backend is `null`,
export is `disabled-not-authorized`, and no browser telemetry package is
allowed by this slice.

Until a separate implementation and activation are approved:

- process stdout remains the only runtime log destination;
- request IDs and API problem trace IDs are correlation aids, not proof of an
  exported distributed trace;
- high-cardinality IDs may be log fields but never metric dimensions;
- credentials, tokens, cookies, PII, raw bodies, financial payloads, and
  provider payloads are forbidden; and
- no alert, dashboard, retention, or response-time claim may be made.

## Activation gates

Production operational readiness requires all of the following as separate,
reviewed decisions:

1. Name the incident roster and fund a staffed coverage model.
2. Approve measurable service-level objectives, windows, and error budgets.
3. Connect a collector and backend, then verify redaction, cardinality,
   retention, dashboards, alerts, and notification routing with synthetic data.
4. Prove cloud backup freshness and restore an approved snapshot to an isolated
   clone without sending traffic to it.
5. Run an incident exercise, record timestamps and decisions, and close every
   material corrective action.
6. Approve provider-specific health, retry, and escalation behavior without
   weakening durable idempotency or Samra-owned financial truth.

Any of those actions may create spend or touch cloud, vendor, credential, or
customer-data boundaries. This repository slice does not authorize them.

## Closure work and CI evidence

The [operational closure plan](operational-closure-plan.md) lists the implementation,
owner decisions, isolated provider authorization packages and acceptance evidence
for each blocked pillar. Required CI now retains a clean-checkout, exact-SHA
readiness report with all blockers; a `--claim production-ready` invocation fails
while the source contract remains blocked. A successful build is not operational
approval. Google trust inventory and condition-only review use the separate
[cutover review tool](github-authority-cutover-review.md).
