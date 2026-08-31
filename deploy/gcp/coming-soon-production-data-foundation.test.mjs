import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonProductionDataFoundation,
  validateComingSoonProductionDataFoundation,
} from "./validate-coming-soon-production-data-foundation.mjs";

test("locks a decision-gated private production data plan", () => {
  assert.deepEqual(validateComingSoonProductionDataFoundation(), {
    schemaVersion: 1,
    status: "validated-decision-required-not-applied",
    phase: "coming-soon-production-data-foundation",
    projectId: "samra-pay-production",
    region: "us-east4",
    network: "samra-production-vpc",
    subnetCidr: "10.50.0.0/24",
    privateServicesAccessCidr: "10.51.0.0/24",
    instance: "samra-production-postgres",
    databaseVersion: "POSTGRES_16",
    tier: "db-custom-1-3840",
    availabilityType: "ZONAL",
    database: "samra_production",
    monthlyBudgetAlertUsd: 25,
    liveCostDecisionRequired: true,
    customerDataAuthorized: false,
    cloudStateRead: false,
    cloudMutationAuthorized: false,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
});

test("rejects project, network, database, cost, and customer-data drift", () => {
  for (const mutate of [
    (value) => (value.productionBoundary.projectId = "samra-pay-staging"),
    (value) => (value.network.subnet.cidr = "10.51.0.0/24"),
    (value) => (value.database.databaseVersion = "POSTGRES_17"),
    (value) => (value.database.tier = "db-f1-micro"),
    (value) => (value.database.availabilityType = "REGIONAL"),
    (value) => (value.database.ipv4Enabled = true),
    (value) => (value.database.deletionProtection = false),
    (value) => (value.database.backup.pointInTimeRecoveryEnabled = false),
    (value) => (value.costGate.estimateApproved = true),
    (value) =>
      (value.costGate.approvedMaximumMonthlyInfrastructureSpendUsd = 25),
    (value) => (value.customerDataGate.customerDataCreationAuthorized = true),
    (value) => (value.applyAuthorized = true),
  ]) {
    const contract = structuredClone(readComingSoonProductionDataFoundation());
    mutate(contract);
    assert.throws(() => validateComingSoonProductionDataFoundation(contract));
  }
});

test("keeps financial workloads, credentials, runtime, vendors, and DNS outside", () => {
  const contract = readComingSoonProductionDataFoundation();
  assert.equal(contract.database.financialWorkloadAllowed, false);
  assert.equal(
    contract.database.regionalHaUpgradeRequiredBeforeFinancialWorkloads,
    true,
  );
  const source = JSON.stringify(contract);
  assert.doesNotMatch(
    source,
    /postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|api[_-]?key|password|versions\/latest/iu,
  );
  for (const excluded of [
    "database user",
    "customer data",
    "Cloud Run",
    "load balancer",
    "Auth0",
    "Squarespace DNS",
  ]) {
    assert.match(source, new RegExp(excluded, "u"));
  }
});

test("runs only a local zero-cost plan and exposes no cloud mutation", async () => {
  const scriptPath =
    "deploy/gcp/plan-coming-soon-production-data-foundation.sh";
  const output = execFileSync("bash", [scriptPath, "--plan"], {
    encoding: "utf8",
  });
  assert.match(output, /PRODUCTION DATA FOUNDATION PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /Cloud state read: no/);
  assert.match(output, /db-custom-1-3840/);
  assert.match(output, /Regional HA is required before transaction workloads/);
  assert.match(output, /makes no claim.*fits inside USD 25/s);
  assert.match(
    output,
    /PLAN COMPLETE — NO CLOUD, CUSTOMER DATA, DEPLOYMENT, TRAFFIC, OR DNS CHANGES/,
  );

  const rejectedApply = spawnSync("bash", [scriptPath, "--apply"], {
    encoding: "utf8",
  });
  assert.equal(rejectedApply.status, 2);
  assert.match(rejectedApply.stderr, /has no review or apply mode/);

  const source = await readFile(scriptPath, "utf8");
  assert.doesNotMatch(
    source,
    /gcloud|curl|terraform|tofu|kubectl|sql instances create|compute networks create|run deploy|dns record-sets/iu,
  );
  execFileSync("bash", ["-n", scriptPath]);
});
