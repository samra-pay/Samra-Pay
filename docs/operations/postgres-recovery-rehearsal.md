# PostgreSQL recovery rehearsal

Status: local, disposable, synthetic evidence only. This is not a production
restore procedure and does not certify a production RPO or RTO.

## What the gate proves

The weekly rehearsal migrates and twice seeds a newly created local PostgreSQL
database, writes a custom-format logical dump, restores it into a second empty
database, and compares:

- deterministic fingerprints for every non-system base table;
- every applied Drizzle migration hash and timestamp against the checked-in SQL
  SHA-256 and `_journal.json` `when` value;
- balanced journals, per-currency double entry, and materialized ledger truth;
- all non-system trigger definitions, including critical ledger and audit guards;
- sequence state; and
- matching PostgreSQL server, `pg_dump`, and `pg_restore` major versions;
- a streamed dump SHA-256 under a 64 MiB synthetic ceiling; and
- phase timings.

A pass produces:

- `artifacts/api-server/test-results/weekly-backup-restore.xml`; and
- `artifacts/api-server/test-results/weekly-backup-restore.json`.

The JSON contains metadata, fingerprints, invariants, timings, execution
provenance, and the PostgreSQL client identity. A GitHub result is bound to the
exact Samra Pay repository, event, workflow ref, candidate SHA, run SHA, run ID,
run attempt, and checked-out `HEAD`. It records the exact digest-pinned client
image. A local result uses explicit `local` and `null` provenance sentinels. The
evidence contains no connection string, password, customer record, row
contents, or dump.

GitHub Actions runs `pg_dump` and `pg_restore` from
`postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94`
with pull disabled, a read-only container filesystem, dropped capabilities,
no-new-privileges, the runner UID/GID, and only the synthetic dump directory
mounted. The evidence records `tooling.clientMode` as
`digest-pinned-container` and `tooling.clientImage` as that exact digest.

## Run locally

Prerequisites are PostgreSQL 16 on the literal IPv4 loopback address,
PostgreSQL 16 `pg_dump` and `pg_restore` on the local executable path, and the
exact disposable credentials below. Local evidence records
`tooling.clientMode` as `local-path` and `tooling.clientImage` as `null`; the
test still rejects a client/server major-version mismatch. The role must be
able to create and drop databases.

```sh
TEST_DATABASE_URL='postgresql://samra_resilience:samra_resilience@127.0.0.1:5432/samra_resilience' \
SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION='I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES' \
WEEKLY_BACKUP_RESTORE_RESULTS_PATH='test-results/weekly-backup-restore.json' \
pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit
```

The test accepts only two complete loopback profiles: the weekly profile above
and the isolated release profile
`samra_release_recovery:samra_release_recovery@127.0.0.1:5436/samra_release_recovery`.
It rejects every other host, port, role, password, database, evidence path,
connection-string option, fragment, and inherited `PG*` override before it
creates a database. It creates only random names matching
`samra_backup_source_<32-lowercase-hex>` and
`samra_backup_restore_<32-lowercase-hex>`. The drop guard accepts only those
patterns.

## Failure and cleanup

The prior JSON result is removed before the run so a failure cannot inherit a
stale pass. Source and target pools are closed, both disposable databases are
dropped, and the temporary dump directory is deleted on success or failure.
The JSON is written only after cleanup succeeds and the dump is proved absent.

Treat a missing trigger, fingerprint drift, sequence drift, migration hash or
timestamp mismatch, PostgreSQL client/server major mismatch, oversized dump,
unbalanced journal, currency imbalance, projection drift, cleanup error, or
missing evidence file as a hard failure. Preserve the JSON and JUnit outputs;
never retain or upload the dump.

## Production boundary

Production recovery still requires a separately authorized backup-freshness
check, point-in-time recovery review, restore to an isolated clone, access and
network controls, ledger and reconciliation verification, named incident roles,
approved RPO/RTO targets, traffic-cutover approval, and rollback evidence.
Never point this rehearsal at staging, production, a shared database, or
customer data.
