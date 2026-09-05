# Local development and contribution

Start with [agent instructions](AGENTS.md), the [current-state index](docs/README.md),
and [engineering governance](docs/engineering-governance.md).

## Supported toolchain

Use Node.js 24.x and pnpm 11.19.0, matching CI. The root package declares both
requirements. Use macOS ARM64 or Linux x64 glibc: the workspace lockfile policy
excludes several other native binary targets. Docker and disposable PostgreSQL
16 are needed for container/database checks, not for mock UI work.

From a clean branch/worktree:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Install pnpm 11.19.0 through your existing approved tool manager if missing.
Do not regenerate the lockfile to work around a toolchain or native-binary
failure. After switching checkouts, reinstall with the frozen lockfile to
relink workspace packages. Do not reuse another worktree's `node_modules`.

## Workspace

| Location                                                                  | Purpose                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `artifacts/samra-pay`                                                     | React/Vite public web; separate `legacy` customer build  |
| `artifacts/samra-pay-mobile`                                              | Expo mobile and mock web preview                         |
| `artifacts/samra-pay-ops`                                                 | Internal Operations Portal                               |
| `artifacts/api-server`                                                    | Express API and synthetic worker                         |
| `artifacts/samra-pay-ds`                                                  | Shared tokens, components, and design preview            |
| `artifacts/samra-pay-commercial`                                          | Isolated commercial presentation                         |
| `artifacts/mockup-sandbox`                                                | Visual experiments; not product authority                |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/samra-client` | OpenAPI, generated contracts, and portable clients       |
| `lib/db`, `lib/ledger`, `lib/remittance`                                  | PostgreSQL, financial invariants, and transaction domain |
| `lib/launch-updates`                                                      | Separately gated Resend launch updates                   |
| `scripts`, `deploy`, `.github/workflows`                                  | Quality evidence and guarded delivery                    |

## Local mock preview

Run each selected command in its own terminal at the repository root. These
example ports avoid collisions; `BASE_PATH=/` supplies Vite's required base.
Vite preview scripts bind to all interfaces; use only a trusted local machine.

```sh
# Public site; auth handoff and signup collection remain unconfigured.
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/samra-pay run dev

# Synthetic customer application, distinct from the public site.
PORT=5001 BASE_PATH=/ VITE_SAMRA_DATA_MODE=mock pnpm --filter @workspace/samra-pay run dev:legacy

# Mock operations preview; this does not activate server operations APIs.
PORT=5002 BASE_PATH=/ VITE_SAMRA_OPS_DATA_MODE=mock pnpm --filter @workspace/samra-pay-ops run dev

# Design-system preview.
PORT=5003 BASE_PATH=/ pnpm --filter @workspace/samra-pay-ds run dev

# API health endpoints only; no provider, worker, or database connection.
PORT=8080 SAMRA_BACKEND_MODE=disabled pnpm --filter @workspace/api-server run dev

# Local Expo mock preview, avoiding the Replit-specific dev wrapper.
EXPO_PUBLIC_SAMRA_DATA_MODE=mock EXPO_PUBLIC_SAMRA_AUTH_MODE=disabled pnpm --filter @workspace/samra-pay-mobile exec expo start --localhost --port 8081
```

Use a clean terminal without inherited cloud/vendor configuration. The root
[`.env.example`](.env.example) is a reference, not an automatically loaded
workspace-wide environment. Supply values explicitly to the relevant process.
Vite/Expo public variables are bundled into clients; they must never contain
secrets. Mobile API mode uses `EXPO_PUBLIC_SAMRA_API_ORIGIN`, requires native
Auth0 configuration, and does not work as an Expo Go auth session. See the
[mobile runtime guide](artifacts/samra-pay-mobile/README.md).

For connected identity, wallet, or public waitlist configuration, use the
specific activation runbook linked from the current-state index. Do not
populate vendor credentials just to make a local preview start.

## Verification

| Change                      | Existing checks                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Documentation/setup         | Markdown relative links, `git diff --check`, declared versions versus CI, and affected configuration checks  |
| API schema/client           | `pnpm --filter @workspace/api-spec run codegen:check`                                                        |
| Package behavior            | `pnpm --filter <package-name> run test` and its typecheck where present                                      |
| Design tokens/UI            | Design-system `tokens:check`, `test`, `typecheck`, and consumer tests; required visual/manual evidence       |
| Database/financial behavior | Disposable PostgreSQL persistence and HTTP gates; migration policy and affected ledger suites                |
| Deployment contracts        | `pnpm run test:gcp-platform`; preview changes also use `node --test deploy/preview/*.test.mjs`               |
| Governance/workflows        | `pnpm run test:repository-controls`, `test:action-pins`, `test:testing-cadence`, and `test:release-contract` |

Standard workspace validation uses:

```sh
pnpm run typecheck
pnpm run test
PORT=4173 BASE_PATH=/ EXPO_PUBLIC_DOMAIN=local.invalid pnpm run build
```

`build` already reruns tests and typechecking. Prefer the single build command
when all three are needed. `local.invalid` is embedded mock build metadata,
not a deployment target. For the native-auth build profile used in CI, copy
the non-secret `.invalid` fixtures from its Linux build step. The build
excludes the commercial package, which has
separate `commercial:typecheck` and `commercial:build` scripts. CI also runs
database, policy, security, and container checks beyond this local build.

Some checks intentionally generate files: OpenAPI codegen, token generation,
image optimization, TypeScript builds, and application builds. Inspect the diff
afterward; do not commit unrelated generated output.

## Disposable PostgreSQL

Use an isolated PostgreSQL 16 instance/database owned by this test session.
Set `TEST_DATABASE_URL` privately in the terminal to that database. It must
never equal a runtime/shared database URL. These scripts write to the selected
database; the variable name itself does not enforce isolation.

```sh
pnpm --filter @workspace/db run test:migrate
pnpm --filter @workspace/db run test:seed
pnpm --filter @workspace/api-server run test:postgres
```

Reset to a fresh, migrated and seeded disposable database before the HTTP
suite (`pnpm --filter @workspace/api-server run test:postgres-http`). Follow
the separate database setup in [.github/workflows/ci.yml](.github/workflows/ci.yml)
for full parity. Dispose only of resources this test session created.
`pnpm run db:migrate` targets `DATABASE_URL` and is not the test command.
Cloud migrations require the [governed staging workflow](docs/operations/staging-migrations.md).

## Pull requests

Use a branch from current `main`. State the problem, resulting behavior,
acceptance evidence, affected boundaries, and unresolved limitations. Link the
existing task/decision rather than creating a duplicate board entry. Update
status and architecture docs in the same PR as the change.

Require successful `Required CI` and `Required security` on the exact candidate,
plus affected conditional gates. GitHub enforces the required checks, PRs and
merge queue under the organization ruleset. A merge or green build is not a
deployment. See [merge controls](docs/operations/repository-merge-controls.md).
For live enforcement evidence, use the
[read-only settings audit](docs/operations/repository-settings-audit.md) with the
reviewed current `main` SHA. It does not replace candidate CI or authorize merge.
