# Google Cloud portability foundation

This directory makes the Samra Pay runtime portable to Google Cloud without
changing Replit or provisioning cloud resources. GitHub remains the source of
truth. Replit can remain available as a temporary preview and rollback surface
until a separately approved cutover.

## Bounded target architecture

| Workload               | Google Cloud target      | Purpose                                                          |
| ---------------------- | ------------------------ | ---------------------------------------------------------------- |
| `samra-api`            | Cloud Run service        | Samra API and controlled synthetic worker                        |
| `samra-customer-web`   | Cloud Run service        | Existing customer web UI plus same-origin `/api` proxy           |
| `samra-operations-web` | Cloud Run service        | Existing Operations Portal plus same-origin `/api` proxy         |
| `samra-migrations`     | Cloud Run job            | Reviewed, one-off forward database migrations                    |
| PostgreSQL             | Cloud SQL for PostgreSQL | Durable staging and later production persistence                 |
| Container images       | Artifact Registry        | Immutable, commit-addressed release images                       |
| Build pipeline         | Cloud Build              | Tests and image construction from the GitHub source              |
| Secrets                | Secret Manager           | `DATABASE_URL` and future credentials; never image layers or Git |

The customer and Operations Portal containers preserve the existing browser
interfaces. Their small Node server serves the compiled SPA and proxies `/api`
to `SAMRA_API_ORIGIN`. This keeps browser cookies first-party and provides an
explicit HTTP 502 response when the API is unavailable; it never substitutes
mock financial data.

The mobile UI remains an Expo application. It is not moved into Cloud Run. A
later, separately tested mobile configuration must point the existing generated
client at the Cloud Run API URL. Replit-specific Expo preview convenience may
remain during transition, but it is not part of the backend hosting contract.

## What this foundation does not do

- create or modify a Google Cloud project;
- create Cloud SQL, Cloud Run, Artifact Registry, IAM, DNS, or secrets;
- deploy an image or application;
- run a migration against any database;
- change Replit files, workflows, secrets, ports, or deployments;
- enable real providers, production data, or production security claims;
- change the existing visual design.

## Build contract

`cloudbuild.yaml` runs the platform contract tests and repository typecheck,
then builds four images. It only builds and publishes images. Deployment is a
separate approval gate.

Required Cloud Build substitutions:

| Substitution  | Default         | Meaning                                                  |
| ------------- | --------------- | -------------------------------------------------------- |
| `_REGION`     | `us-east1`      | Artifact Registry and runtime region; confirm before use |
| `_REPOSITORY` | `samra-staging` | Existing Artifact Registry Docker repository             |
| `_IMAGE_TAG`  | `manual`        | Use the immutable Git commit SHA for controlled releases |

Example for a future authorized build from Cloud Shell:

```sh
gcloud builds submit \
  --config deploy/gcp/cloudbuild.yaml \
  --substitutions _REGION=us-east1,_REPOSITORY=samra-staging,_IMAGE_TAG="$(git rev-parse HEAD)" \
  .
```

This command must not be run until the project, billing account, region,
Artifact Registry repository, and least-privilege Cloud Build service account
have been approved.

## Staging runtime contract

The API service requires Cloud Run's injected `PORT` plus these explicit
values:

```text
NODE_ENV=production
SAMRA_BACKEND_MODE=demo
SAMRA_PROVIDER_MODE=fake
SAMRA_PERSISTENCE_MODE=postgres
SAMRA_RUN_WORKER=true
SAMRA_INTERNAL_OPERATIONS_ENABLED=false
DATABASE_URL=<Secret Manager reference>
```

`SAMRA_INTERNAL_OPERATIONS_ENABLED` is intentionally false in production-mode
containers because the current application correctly restricts synthetic
internal operations to non-production mode. Authentication and authorization
must be promoted deliberately before an Operations Portal is exposed beyond a
controlled staging audience.

Each web service requires:

```text
SAMRA_API_ORIGIN=https://<samra-api-cloud-run-host>
```

Do not set `PORT`; Cloud Run injects it. Do not place `DATABASE_URL` in a build
argument, image, repository file, or ordinary environment-variable manifest.

## Database and migration guardrails

1. Create a dedicated staging Cloud SQL PostgreSQL instance and database.
2. Use a dedicated migration identity and a distinct runtime identity.
3. Store the connection value in Secret Manager.
4. Attach Cloud SQL access only to the API and migration identities.
5. Set a bounded application connection pool before allowing horizontal scale.
6. Deploy the migration image as a Cloud Run job with one task and no automatic
   retry until migration idempotency has been reviewed.
7. Execute migrations manually before deploying the corresponding API revision.
8. Never run migrations during image build or API startup.
9. Never use `drizzle-kit push --force` or destructive down migrations.
10. Enable backups and point-in-time recovery before persistent acceptance tests.

Production must use a separate project or, at minimum, separate identities,
database, secrets, and services. Staging data must remain synthetic.

## Manual testing surfaces

The Google Cloud staging environment preserves three test surfaces:

1. Customer web URL: browser-based remittance and account-flow testing.
2. Operations Portal URL: CS investigation, audit, ledger, reconciliation, and
   controlled-failure testing.
3. Expo mobile preview/build: mobile UI and flow testing against the staging API
   after the mobile API-origin configuration is completed.

The existing Qase project remains the manual pass/fail record. A staging release
cannot advance on visual inspection alone.

## Cutover gates

Before any Replit dependency is removed:

- all images build from a clean GitHub commit;
- Cloud SQL migrations pass on an empty staging database and a restored copy of
  the prior synthetic schema;
- API health and explicit-failure behavior pass;
- restart, concurrency, idempotency, ledger, refund, reversal, reconciliation,
  and immutable audit evidence pass against Cloud SQL;
- customer web and Operations Portal route matrices pass;
- mobile staging connectivity and core flows pass;
- the critical Qase regression run is complete with no unresolved severity-one
  or severity-two defect;
- logging, alerting, backups, rollback, and named operational ownership exist;
- Replit remains available for a bounded rollback window before decommissioning.
