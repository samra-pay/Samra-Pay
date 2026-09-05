# Operational closure plan

Status: executable repository checks prepared; five operational pillars remain
blocked in [operational-readiness.json](operational-readiness.json). This plan
specifies the evidence needed to change that state. It does not assign responders,
approve targets, create vendor state, or certify a deployment.

David is the decision owner for scope, staffing and budget. Technical operators
and incident responders must be named and accept their duties before activation;
the current six incident roles remain unassigned. Do not claim independent review
or continuous coverage from a single available operator.

## Evidence required for each pillar

| Pillar | Next implementation and decision | Required acceptance evidence |
| --- | --- | --- |
| Telemetry | Select the backend, collector destination, project, retention/access policy and spend cap. Implement the existing OTLP HTTP/protobuf contract with explicit opt-in and a bounded synthetic exercise. | Exact source SHA and runtime digest; exporter configuration without credentials; synthetic event/trace observed at the destination; redaction and cardinality rejection results; retention/access read-back; dashboard and alert route identifiers. Structured stdout alone does not prove export. |
| Incident response | Name the incident commander, technical, operations, security, communications and scribe roles; define actual staffed windows, backup coverage, acknowledgement/escalation targets and paging destination. | Accepted roster with coverage dates; delivery and acknowledgement timestamps for an explicitly authorized drill; escalation and communications exercise; incident record, postmortem and closure of material corrective actions. A configured route does not prove somebody received a page. |
| Service levels | Approve targets, windows, denominators, exclusions, data owners and error budgets for API availability, ledger integrity, reconciliation freshness and provider-state knowledge. | Queries tied to the telemetry source; bounded synthetic success/failure and missing-data cases; alert thresholds and recovery behavior; routed notification evidence. No numeric target or production measurement is approved in the current contract. |
| Recovery | Approve an isolated cloud restore drill against an exact source instance and backup/PITR point, with a temporary clone, cost limit, expiry and cleanup owner. | Backup freshness and retention read-back; restore operation/clone IDs and timing; schema, sequence, trigger and ledger-invariant comparisons; absence of application traffic; cleanup proof. Retain summaries and fingerprints, never database dumps or customer records. Synthetic PostgreSQL CI does not establish cloud RPO/RTO. |
| Provider resilience | Define separate Auth0, Persona and Crossmint health signals, error classification, escalation and safe retry decisions. Retain fail-closed behavior when state is unknown. | Exact provider tenant/environment, source SHA, runtime digest and numeric secret-version references; bounded authorization and synthetic identities; timeout/429/5xx/ambiguous-response exercises; provider-reference reconciliation and idempotency evidence; no duplicate economic effects. Provider configuration alone does not prove a successful runtime journey. |

Collect source configuration and synthetic tests first. Prepare a concrete
activation package before requesting approval. After authorized activation,
record observed results and remaining exceptions; never set an evidence field
from the intended design. Changes to the readiness schema and its strict validator
must be reviewed together with the objective evidence for each newly claimed state.

## Isolated runtime authorization packages

Use the existing activation documents for their respective boundaries:

- [Auth0 web entry](web-auth0-entry-activation.md) and
  [native authentication](mobile-auth0-native-activation.md): exact tenant/client,
  callback/origin allowlist, runtime SHA/digest, numeric secret versions where
  used, test identity, expiry and session/token cleanup. Authentication evidence
  does not authorize Persona, Crossmint, a bank, or a transfer.
- [Persona sandbox](persona-sandbox-activation.md): exact sandbox template/API
  version and webhook destination, allowlisted synthetic applicant, numeric secret
  version, maximum inquiries, authorized duration and cleanup. Do not retain
  identity documents or raw provider payloads in release evidence.
- [Crossmint sandbox](crossmint-sandbox-connection.md): exact staging project,
  endpoint, numeric secret version, synthetic customer and permitted wallet
  operation/count. No financial signing authority, recovery signer, background
  transfer or automatic debit follows from creating a wallet. Every outgoing
  transfer requires customer initiation and approval for that transfer.
- [Staging wallet deployment](staging-wallet-deployment-package.md): exact Cloud
  SQL instance/database, separate runtime/migration roles, numeric secret versions,
  TLS/server verification and private reachability. Apply only the authorized
  migration producer artifact. Retain grant, schema and cleanup evidence without
  disclosing a password, connection secret, SQL dump or customer data.

Each package must state the operator, approver, candidate SHA, environment,
resource allowlist, secret-version identifiers, maximum operations/spend, expiry,
stop conditions and cleanup. A missing field stays a blocker. Do not populate
`latest`, infer credentials from a different environment, or reuse expired approval.
A provider timeout is an unknown result, not permission to retry or use a fallback.
Any retry of an economic command also requires proven durable idempotency and the
customer's original per-transfer authority; it cannot create new standing authority.

## Machine-checkable readiness evidence

The required Linux CI job validates the source contract and writes
`tmp/operational-readiness.json`, retained in the commit/run/attempt-named
`operational-readiness-*` artifact for 30 days. The record includes the checked-out
SHA, clean-source assertion, source-contract hash, five pillars and all ten hard
stops. Report creation, provenance validation or artifact upload failure fails the
job. Thirty days is this readiness-report retention only; it does not resolve the
separate 365-day release-evidence requirement or Enterprise's observed 90-day cap.

For a clean reviewed checkout, a local report can be generated outside Git:

```sh
node scripts/src/validate-operational-readiness.ts \
  --report <new-output-path> --candidate-sha <exact-checked-out-SHA> --require-clean
```

A diagnostic report without `--require-clean` is allowed from a dirty checkout,
but records `sourceTreeClean: false` and `evidenceEligible: false`. An existing
output cannot be overwritten. Local unsigned JSON is not a GitHub attestation.
For a PR, `GITHUB_SHA` normally names its synthetic merge commit; the artifact's
SHA governs, not the PR branch's head. The merge queue produces separate evidence
for the actual merge candidate.

Consumers attempting a production-ready claim must invoke:

```sh
node scripts/src/validate-operational-readiness.ts --claim production-ready
```

This currently exits **2**, with a blocked-readiness error. It reads the governed
source contract rather than accepting a supplied green report. Invalid input or
an unsupported contract exits **1**. Ordinary contract validation can succeed while
production remains blocked; passing CI, merging code and authorizing release are
separate facts. These checks govern repository automation, not arbitrary prose
outside the repository.
