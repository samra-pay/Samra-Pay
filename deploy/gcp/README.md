# Google Cloud staging and portability foundation

Google Cloud is the locked Alpha runtime and database platform. GitHub is the
source and build authority. Replit remains a temporary preview and bounded
rollback surface. The [documentation index](../../docs/README.md) owns current
product status; this runbook owns Google Cloud execution controls.

## Current verified staging state

The authorized synthetic staging substrate contains:

- project labels, approved APIs, and seven keyless Samra service accounts;
- one immutable Artifact Registry repository;
- Firebase project linkage, without Firebase Auth, Firestore, Hosting, or a
  registered mobile app;
- one private VPC, subnet, Private Services Access allocation, and PostgreSQL
  16 Cloud SQL instance;
- an empty `samra_staging` database with backups, seven-day point-in-time
  recovery, storage bounds, and deletion protection; and
- database-secret metadata with zero credential versions.

Cloud Run services and jobs, database users and credentials, migrations,
application images, public endpoints, live providers, real customer data, and
production resources are not part of this verified state.

## Contract files

| File                            | Authority                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `staging-foundation.json`       | Project, region, APIs, identities, repository, labels, and Firebase-managed effects  |
| `staging-database.json`         | Private network and Cloud SQL shape                                                  |
| `staging-runtime-contract.json` | Future workload identities, access, images, ingress, runtime, and migration controls |
| `cloudbuild.yaml`               | Tests and exact-SHA image construction; never deployment                             |

The foundation is `samra-pay-staging` under organization `614833350075` in
`us-east4`, with synthetic data only and a $50 monthly budget alert. The alert
is notification, not a spending cap.

Firebase console linkage creates provider-managed APIs, identities, a restricted
browser key, and project labels enumerated in `staging-foundation.json`. The
Samra bootstrap does not create, expand, or grant roles to those resources.

## Guarded execution

Repository checkout, validation, tests, and container builds change no cloud
resource. Each mutating phase is independently guarded, defaults to plan or
review, and requires the exact project, organization, region, operator, source
commit, and authorization sentinel.

### Foundation

```sh
SAMRA_GCP_OPERATOR_ACCOUNT="operator@davidhaile.com" \
  bash deploy/gcp/bootstrap-staging-foundation.sh --plan
```

The apply phase may enable only the reviewed Samra APIs and labels; create the
immutable repository, seven keyless service accounts, minimum IAM bindings,
and empty database-secret metadata. It does not create billing, Cloud SQL,
Cloud Run, a Firebase app, credentials, secret versions, public access,
providers, or Replit changes. Existing resources are reused only after exact
contract verification.

### Database

```text
provision-staging-database.sh --plan    local contract validation
provision-staging-database.sh --review authenticated read-only collision review
provision-staging-database.sh --apply  guarded mutation after explicit approval
audit-staging-database.sh              independent post-apply verification
```

Apply also requires
`SAMRA_GCP_DATABASE_APPLY=AUTHORIZED_STAGING_DATABASE`. A separate fixed-SHA
Cloud Shell session must run the audit before the database phase is accepted.

The audit verifies organization, billing, labels, private networking, Cloud SQL
shape, public-IP absence, backup/PITR/deletion controls, database presence, zero
secret versions, and zero Cloud Run services or jobs. It does not connect to
the database because this phase creates no credential.

## Target workloads

| Workload                      | Target            | Access boundary                                                          |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `samra-api`                   | Cloud Run service | Private database and secret access; controlled application ingress       |
| `samra-customer-web`          | Cloud Run service | Browser SPA plus same-origin `/api` proxy; no database or secret access  |
| `samra-operations-web`        | Cloud Run service | Blocked until workforce security promotion; no database or secret access |
| `samra-design-system-preview` | Cloud Run service | Commit-addressed review surface only                                     |
| `samra-migrations`            | Cloud Run job     | One task, serial, no automatic retry, manual execution                   |
| PostgreSQL                    | Cloud SQL         | Private IP; runtime and migration identities only                        |
| Images                        | Artifact Registry | Immutable full-SHA identity                                              |

The mobile app remains Expo. It uses one validated
`EXPO_PUBLIC_SAMRA_API_ORIGIN` for iOS, Android, and Expo web; it is not hosted
as a Cloud Run service.

## Build and image boundary

`cloudbuild.yaml` validates platform contracts and typecheck, then builds and
publishes five full-SHA images. Deployment is a separate approval gate. The
dedicated build identity cannot act as runtime, migration, or deployer.

Required build values are:

| Value                         | Contract                                |
| ----------------------------- | --------------------------------------- |
| `_ENVIRONMENT`                | `staging`                               |
| `_REGION`                     | `us-east4`                              |
| `_REPOSITORY`                 | `samra-staging` with immutable tags     |
| `_IMAGE_TAG` and `COMMIT_SHA` | The same lowercase 40-character Git SHA |
| `_BUILD_SERVICE_ACCOUNT`      | Dedicated staging build identity        |
| `PROJECT_ID`                  | Approved staging project                |

The GitHub `Container portability` workflow builds the same images without
publishing. Against disposable PostgreSQL it proves migrations, API health and
readiness, browser SPA/API proxy behavior, the production operations-API denial,
and the design-system review surface. That gate proves container portability,
not Google Cloud provisioning, IAM, deployment, or production security.

## Runtime contract

`staging-runtime-contract.json` remains `deploymentAuthorized: false`. It
requires separate build, deploy, API, browser, design, and migration identities;
full-SHA images; authenticated ingress; and database/secret access only for API
and migration workloads.

The API runtime requires:

```text
NODE_ENV=production
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=postgres
SAMRA_RUN_WORKER=true
SAMRA_INTERNAL_OPERATIONS_ENABLED=false
DATABASE_URL=<Secret Manager reference>
```

Cloud Run injects `PORT`. Liveness is `/api/healthz`; readiness is
`/api/readyz`, which checks connectivity and schema without migrating or
seeding. `SIGTERM` must drain HTTP, worker, and PostgreSQL resources within the
configured bound.

Browser services require an HTTPS `SAMRA_API_ORIGIN`. A controlled mobile
staging bundle requires `EXPO_PUBLIC_SAMRA_DATA_MODE=api` and an HTTPS
`EXPO_PUBLIC_SAMRA_API_ORIGIN`. These origins are public configuration, not
secrets. Plain HTTP is allowed only for loopback testing.

The Operations Portal stays blocked and
`SAMRA_INTERNAL_OPERATIONS_ENABLED=false` until real workforce authentication,
staff lifecycle controls, and the operations API production-security gate pass.

## Database and migration guardrails

Synthetic staging uses a zonal `db-g1-small` PostgreSQL 16 instance. This is a
cost-controlled integration substrate, not a production-availability claim.
The application subnet is `10.40.0.0/24`; Private Services Access is
`10.41.0.0/24`. The instance has no public IPv4 address or authorized network.
SSD storage starts at 10 GB, can grow only to 50 GB, and deletion protection
must remain enabled.

Before persistent application tests:

1. create distinct migration and runtime database users;
2. store the connection value as a Secret Manager version;
3. grant Cloud SQL and secret access only to API and migration identities;
4. set a bounded application connection pool before horizontal scaling;
5. run one-task, zero-retry migrations manually before API traffic;
6. prove empty-database and prior-schema migration behavior; and
7. verify backups and point-in-time recovery.

Never migrate during image build or API startup. Never use `drizzle-kit push
--force`, destructive down migrations, plaintext credentials, or shared
production resources. Staging data remains synthetic.

## Cutover gates

Before removing any Replit dependency, require all of the following against one
exact GitHub commit:

- clean image builds and private staging deployment;
- empty and restored-schema migrations;
- API health, readiness, explicit outage behavior, and rollback;
- restart, concurrency, idempotency, ledger, refund, reversal, reconciliation,
  and immutable audit evidence against Cloud SQL;
- customer web and Operations Portal route matrices;
- mobile staging connectivity and core iOS/Android flows;
- complete critical Qase regression with no unresolved severity-one or
  severity-two defect; and
- logging, alerting, backups, named ownership, and a bounded rollback window.

No phase in this runbook authorizes production, live-provider traffic, real
customer data, legal or corridor approval, or changes to financial invariants.
