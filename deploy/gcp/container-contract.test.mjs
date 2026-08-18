import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/container-portability.yml";
const smokePath = "deploy/gcp/smoke-containers.sh";
const workflow = await readFile(workflowPath, "utf8");
const smoke = await readFile(smokePath, "utf8");

const images = [
  ["api", "samra-api"],
  ["customer-web", "samra-customer-web"],
  ["operations-web", "samra-operations-web"],
  ["design-system", "samra-design-system-preview"],
  ["migrate", "samra-migrations"],
];

test("builds every Google Cloud target from the exact GitHub SHA", async () => {
  assert.match(workflow, /SAMRA_CONTAINER_IMAGE_TAG: \$\{\{ github\.sha \}\}/);
  for (const [dockerfile, image] of images) {
    assert.match(
      workflow,
      new RegExp(`--file deploy/gcp/Dockerfile\\.${dockerfile}`),
    );
    assert.match(
      workflow,
      new RegExp(`samra-${image.replace(/^samra-/, "")}:`),
    );
    const source = await readFile(
      `deploy/gcp/Dockerfile.${dockerfile}`,
      "utf8",
    );
    assert.match(source, /^USER node$/m);
    const installIndex = source.indexOf("pnpm install --frozen-lockfile");
    const productionIndex = source.indexOf("ENV NODE_ENV=production");
    assert.ok(
      installIndex >= 0,
      `Dockerfile.${dockerfile} must install dependencies`,
    );
    assert.ok(
      productionIndex < 0 || productionIndex > installIndex,
      `Dockerfile.${dockerfile} must install its build toolchain before production mode`,
    );
  }
  assert.doesNotMatch(workflow, /docker push|gcloud\s|replit|worf\.replit/i);
});

test("runs migrations before API and browser runtime probes", () => {
  const migrationIndex = smoke.indexOf("docker run --rm --network host");
  const apiIndex = smoke.indexOf(
    'docker run --detach --name "${SAMRA_API_CONTAINER}"',
  );
  assert.ok(migrationIndex >= 0 && apiIndex > migrationIndex);
  for (const required of [
    "SAMRA_PERSISTENCE_MODE=postgres",
    "SAMRA_RUN_WORKER=true",
    "SAMRA_INTERNAL_OPERATIONS_ENABLED=false",
    "/api/healthz",
    "/api/readyz",
    "/remittance",
    "/login",
    "/api/v1/internal/operations/summary",
    "samra-design-system-preview",
  ]) {
    assert.ok(smoke.includes(required), `Missing runtime probe: ${required}`);
  }
});

test("keeps the portability job isolated, recurring, and evidence-producing", () => {
  for (const required of [
    "workflow_dispatch:",
    "pull_request:",
    "push:",
    "schedule:",
    "image: postgres:16",
    "persist-credentials: false",
    "permissions:",
    "contents: read",
    "if: always()",
    "uses: actions/upload-artifact@v4",
    "retention-days: 30",
  ]) {
    assert.ok(
      workflow.includes(required),
      `Missing workflow control: ${required}`,
    );
  }
  assert.ok(smoke.includes("container-portability.json"));
  assert.ok(smoke.includes("container-portability.xml"));
});
