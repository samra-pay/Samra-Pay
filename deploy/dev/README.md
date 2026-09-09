# Local Dev backend

This is the reproducible **local synthetic backend**, not the shared user-testing
environment. It reuses the existing API and migration images, PostgreSQL 16,
migrations, fixtures and worker. Authentication is disabled for local API
exercises; published ports bind only to loopback. Never deploy this profile to
GCP or share it with testers. No cloud credentials or provider keys are loaded.

Prerequisites: Docker Engine/Desktop with Compose v2, Git, and enough free disk
for the existing workspace images. No new image registry or paid cloud service
is required. Run commands from the repository root.

```sh
docker compose -f deploy/dev/compose.yaml up --build -d --wait api
curl --fail http://127.0.0.1:18084/api/readyz
curl --fail http://127.0.0.1:18084/api/v1/accounts
```

The order is PostgreSQL healthy → explicit migration → idempotent fixture seed →
API ready. The seed uses the existing balanced 425000-minor-unit USD opening
journal. Existing fixtures include a second synthetic customer for isolation
checks, but do not constitute two Auth0 user accounts. The fixed database
password is deliberately local-only fixture data, not a cloud credential.

Normal development uses the installed local Node 24/pnpm toolchain described in
[CONTRIBUTING](../../CONTRIBUTING.md); rebuild the selected image after changes.
The customer mock preview remains separate. This profile does not claim a
working Auth0 login or API-connected browser/mobile journey. Those belong to the
[shared Test plan](../gcp/dev-test-environments.md).

```sh
# Restart only the API; preserve the database and its transaction history.
docker compose -f deploy/dev/compose.yaml restart api
# Stop this stack, preserving the named local database volume.
docker compose -f deploy/dev/compose.yaml down
```

A destructive reset is optional and affects this Compose project's local data.
Do not use it during a test session whose evidence has not been recorded:

```sh
docker compose -f deploy/dev/compose.yaml down --volumes
```

Do not run automated destructive integration suites against this persistent Dev
database. CI/integration suites retain separate disposable databases. Do not
point `DATABASE_URL` or `TEST_DATABASE_URL` at staging/production to work around
local failures. The Compose environment is explicit and does not inherit vendor
secrets from the host. Do not publish the local API on non-loopback interfaces.
