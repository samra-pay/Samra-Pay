# Local synthetic persona lab

The persona lab drives two artificial customer identities through the existing
Samra HTTP API, onboarding, wallet, operator and financial services. It adds no
new wallet system, real provider integration or customer-facing API. Avatar
pictures are not needed for these repeatable engineering checks.

Authentication and consent are simulated by the test harness. Samra's customer
mapping, admission, account ownership, activation and financial authorization
checks remain enabled. These are not actual Auth0 accounts, human participants,
KYC approvals, blockchain wallets, deposits or payouts.

## Run locally

Use Node 24, pnpm 11.19.0, the frozen lockfile and a running local Docker engine.
The database image is the same digest-pinned PostgreSQL 16 image as Local Dev.
No Google Cloud Workstations API, cloud login or provider credentials are needed.

```sh
pnpm install --frozen-lockfile
# Read-only plan: creates no database and executes no journeys.
pnpm run test:personas --plan
# Run the complete simulation in a new disposable local database.
pnpm run test:personas
```

Each run creates its own labeled, memory-backed PostgreSQL container, publishes
only a random loopback port, runs the existing migrations and starts an
ephemeral loopback API. It does not use the persistent Local Dev volume, an
existing database URL, the shared Dev/Test projects or cloud credentials.
The runner refuses remote Docker endpoints. No fixture seed/reset is run on
an existing database; the runtime checks that the selected database is pristine
before writing. Child processes receive a restricted environment without host
provider secrets, database overrides or Node execution overrides.
The runner also requires a fresh run/container marker written through that
exact Docker container. A loopback address or an environment flag alone is
insufficient; forwarding a shared database to a local port does not satisfy
this check.

The fixture database is removed after success or failure, only after verifying
its exact ownership label. Existing containers/volumes are untouched. Reports
remain under `artifacts/api-server/test-results/personas/<run-id>/`:

- `summary.md`: readable per-persona results and observed accounting checks.
- `results.json`: structured results, source SHA, dirty-worktree flag and scope.

An incomplete run is blocked, not passed. A failed scenario or cleanup exits
nonzero. If cleanup cannot be verified, the terminal prints the exact local
container name for inspection; do not run broad Docker cleanup commands.
Ctrl-C and SIGTERM cancel test work, retain a non-passing outcome and await
owned-container cleanup. A forced process kill, engine failure or machine crash
cannot guarantee cleanup; inspect only containers labeled
`com.samrapay.persona-run` from this runner and preserve any remaining evidence.

## Personas and scenarios

The [manifest](../../artifacts/api-server/test/persona-lab/personas.json) contains
Mekdes, the funded sender (500 synthetic USD), and Dawit, the low-balance
customer (1 synthetic USD). Both have separate artificial identities, wallets,
accounts and fictional Ethiopia recipients. These are separate remittances,
not a claim that wallet-to-wallet peer transfers are implemented.

Use `pnpm run test:personas --manifest /absolute/path/personas.json` to select
another two-person fixture. Keep the exact aliases `sender` and `limited`.
The sender's opening balance must be 10000–100000 minor units; the limited
persona's must be 1–100. Only fictional display names and integer minor-unit
strings are accepted. Do not add emails, passwords, real identities, provider
keys, URLs or arbitrary commands. Funding uses the existing balanced,
idempotent operator credit, never a direct materialized-balance edit.

The run covers:

1. Local readiness, anonymous denial and disabled developer operations routes.
2. Exactly two invitations, preview rollback and invitation replay.
3. Each persona's simulated consent, identity approval and one persistent wallet.
4. Distinct opening balances and no duplicate funding effect.
5. Separately owned artificial recipients through the existing beneficiary API.
6. A completed transfer with the exact server-quoted debit and balanced journals.
7. Repeated transfer submission without another hold or charge.
8. Rejected overspending without changing the low-balance account.
9. Cross-account denials and an expired simulated session.
10. Failed payout, refund and repeated worker processing without balance drift.
11. Runtime restart with wallet, account, activity and isolation preserved.
12. Independent journal, materialized-balance, hold and cleanup checks.

Fourteen individual scenario results, including both onboarding paths and
cleanup, are required for a pass. Missing, duplicate or malformed evidence
cannot become a passing result. Reports exclude database URLs, credentials,
authentication subjects, raw exceptions and provider payloads.

## Verification and limits

```sh
pnpm --filter @workspace/api-server run test:personas:contracts
pnpm --filter @workspace/api-server run test:personas:typecheck
```

The ordinary API test command includes the contract and CLI safety tests.
The database-backed lab is a separate explicit command; it is not automatically
a shared-environment release gate. Preserve its report with the reviewed source.
An uncommitted run is labeled as such and does not certify an immutable candidate.

This first lab does not prove browser interaction, actual Auth0 login/recovery,
installed mobile behavior, provider-sandbox connectivity, real settlement or
human usability. Pending/rejected identity fixtures, real network response
loss and additional failure combinations remain covered separately or require
future persona scenarios. Do not describe the retry check as an actual injected
network outage.

Continue the [shared user-testing procedure](user-testing.md) for Dev/Test.
Automated personas do not satisfy its two-person manual acceptance requirement,
authorize roster expansion, approve cloud IAM changes or enable production funds.
