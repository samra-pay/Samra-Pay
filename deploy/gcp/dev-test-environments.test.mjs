import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(path, "utf8");
const plan = JSON.parse(read("deploy/gcp/dev-test-environments.json"));
const compose = read("deploy/dev/compose.yaml");
test("Dev never inherits cloud credentials or publishes its unauthenticated API off loopback", () => {
  assert.doesNotMatch(
    compose,
    /env_file:|network_mode:\s*host|privileged:|external:\s*true|AUTH0_|PERSONA_|CROSSMINT_|GOOGLE_APPLICATION_CREDENTIALS/,
  );
  assert.match(compose, /127\.0\.0\.1:55484:5432/);
  assert.match(compose, /127\.0\.0\.1:18084:8080/);
  assert.match(compose, /SAMRA_CUSTOMER_AUTH_MODE: disabled/);
  assert.match(compose, /SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: fake/);
  assert.match(compose, /SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: fake/);
  assert.match(compose, /NODE_ENV: production/);
  assert.match(compose, /SAMRA_INTERNAL_OPERATIONS_ENABLED: "false"/);
  assert.doesNotMatch(
    compose,
    /samra-pay-(?:staging|production)|samra_staging|samra_production/,
  );
});
test("Dev explicitly migrates and seeds before the persistent API starts", () => {
  assert.match(
    compose,
    /migrate:[\s\S]*postgres:[\s\S]*condition: service_healthy/,
  );
  assert.match(
    compose,
    /seed:[\s\S]*src\/test-seed.ts[\s\S]*migrate:[\s\S]*condition: service_completed_successfully/,
  );
  assert.match(
    compose,
    /api:[\s\S]*seed:[\s\S]*condition: service_completed_successfully/,
  );
  assert.match(compose, /samra-dev-postgres:\/var\/lib\/postgresql\/data/);
  const workflow = read(".github/workflows/container-portability.yml");
  assert.match(workflow, /run: bash deploy\/dev\/smoke.sh/);
  assert.equal(workflow.match(/"deploy\/dev\/\*\*"/g)?.length, 2);
});
test("shared Test is isolated, authenticated, fake-provider only and not activated", () => {
  assert.equal(plan.status, "projects-created-runtime-pending");
  const envs = plan.environments;
  assert.equal(new Set(Object.values(envs).map((e) => e.projectId)).size, 4);
  assert.equal(envs.dev.cloudDatabaseCount, 0);
  assert.equal(envs.dev.plannedCloudDatabaseCount, 1);
  assert.equal(envs.dev.initialRuntime, "shared-cloud-run");
  for (const name of ["dev", "test"]) {
    const runtime = envs[name].api.runtimeEnvironment;
    assert.equal(envs[name].billingEnabled, true);
    assert.equal(envs[name].spendingAuthorized, true);
    assert.ok(
      envs[name].database.roles.every((role) => role.endsWith(`_${name}`)),
    );
    assert.equal(runtime.SAMRA_RELEASE_PROFILE, "synthetic-shared");
    assert.equal(runtime.GOOGLE_CLOUD_PROJECT, `samra-pay-${name}`);
    assert.equal(runtime.SAMRA_DEPLOYMENT_ENVIRONMENT, name);
  }
  assert.equal(plan.budget.amountUsd, 50);
  assert.equal(plan.budget.hardCap, false);
  assert.equal(envs.test.deploymentBlocked, true);
  assert.equal(envs.test.database.publicIp, false);
  assert.equal(envs.test.api.customerAuthentication, "auth0");
  assert.equal(envs.test.api.runtimeEnvironment.NODE_ENV, "production");
  assert.equal(
    envs.test.api.runtimeEnvironment.SAMRA_INTERNAL_OPERATIONS_ENABLED,
    "false",
  );
  assert.deepEqual(Object.values(envs.test.api.providerModes), [
    "fake",
    "fake",
    "fake",
    "fake",
  ]);
  assert.equal(envs.test.api.billingMode, "instance-based");
  assert.equal(envs.test.api.minInstancesDuringSessions, 1);
  assert.equal(envs.staging.changeAuthorizedByThisPlan, false);
  assert.equal(envs.production.changeAuthorizedByThisPlan, false);
});
test("customer image selection preserves public default and permits only the existing customer build", () => {
  const docker = read("deploy/gcp/Dockerfile.customer-web");
  assert.match(docker, /ARG SAMRA_WEB_SURFACE=public/);
  assert.match(
    docker,
    /public\) pnpm --filter @workspace\/samra-pay run build ;;/,
  );
  assert.match(
    docker,
    /legacy\) pnpm --filter @workspace\/samra-pay run build:legacy ;;/,
  );
  assert.match(docker, /exit 64/);
  assert.match(
    read(".github/workflows/container-portability.yml"),
    /--build-arg SAMRA_WEB_SURFACE=legacy/,
  );
});
