import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonProductionDataFoundation,
  validateComingSoonProductionDataFoundation,
  validateObservedProductionDataSqlInstance,
  validateProductionDataActivationEnvironment,
  validateProductionDataCostEstimateFreshness,
} from "./validate-coming-soon-production-data-foundation.mjs";
import { classifyObservedProductionDataFoundation } from "./inspect-coming-soon-production-data-foundation.mjs";

const contract = readComingSoonProductionDataFoundation();

function readyObservation() {
  return {
    project: {
      projectId: "samra-pay-production",
      projectNumber: "382465561715",
      parent: { type: "organization", id: "614833350075" },
      lifecycleState: "ACTIVE",
    },
    network: {
      name: "samra-production-vpc",
      autoCreateSubnetworks: false,
      routingConfig: { routingMode: "REGIONAL" },
    },
    subnet: {
      name: "samra-production-us-east4",
      ipCidrRange: "10.50.0.0/24",
      privateIpGoogleAccess: true,
      network:
        "projects/samra-pay-production/global/networks/samra-production-vpc",
    },
    allSubnets: [],
    privateServicesAccess: {
      name: "google-managed-services-samra-production-vpc",
      address: "10.51.0.0",
      prefixLength: 24,
      purpose: "VPC_PEERING",
      addressType: "INTERNAL",
      network:
        "projects/samra-pay-production/global/networks/samra-production-vpc",
    },
    allGlobalAddresses: [],
    serviceConnections: [
      {
        reservedPeeringRanges: ["google-managed-services-samra-production-vpc"],
      },
    ],
    instance: {
      name: "samra-production-postgres",
      project: "samra-pay-production",
      region: "us-east4",
      state: "RUNNABLE",
      databaseVersion: "POSTGRES_16",
      ipAddresses: [{ ipAddress: "10.51.0.3", type: "PRIVATE" }],
      settings: {
        tier: "db-custom-1-3840",
        availabilityType: "ZONAL",
        dataDiskType: "PD_SSD",
        dataDiskSizeGb: "10",
        storageAutoResize: true,
        storageAutoResizeLimit: "100",
        deletionProtectionEnabled: true,
        ipConfiguration: {
          ipv4Enabled: false,
          privateNetwork:
            "projects/samra-pay-production/global/networks/samra-production-vpc",
        },
        backupConfiguration: {
          enabled: true,
          startTime: "06:00",
          location: "us",
          pointInTimeRecoveryEnabled: true,
          transactionLogRetentionDays: 7,
          backupRetentionSettings: { retainedBackups: 14 },
        },
      },
    },
    databases: [{ name: "samra_production" }],
    secretVersionCount: 0,
    cloudRunServiceCount: 0,
    cloudRunJobCount: 0,
  };
}

test("locks an approved, guarded private production data controller", () => {
  assert.deepEqual(validateComingSoonProductionDataFoundation(), {
    schemaVersion: 1,
    status: "validated-controller-prepared-not-applied",
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
    approvedMaximumMonthlyInfrastructureSpendUsd: 100,
    guardedMonthlyEstimateUsd: 81.92,
    estimateValidThrough: "2026-09-07",
    temporaryZonalPostureAccepted: true,
    liveCostDecisionRequired: false,
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
    (value) => (value.costGate.estimateApproved = false),
    (value) =>
      (value.costGate.approvedMaximumMonthlyInfrastructureSpendUsd = 101),
    (value) => (value.costGate.estimate.components.oneVcpuHourlyUsd = 0.055),
    (value) =>
      (value.availabilityDecision.temporaryZonalPostureAccepted = false),
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
  assert.equal(
    contract.costGate.approvedMaximumMonthlyInfrastructureSpendUsd,
    100,
  );
  assert.ok(
    contract.costGate.estimate.guardedMonthlyEstimateUsd <
      contract.costGate.approvedMaximumMonthlyInfrastructureSpendUsd,
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

test("keeps the local plan at zero cost and points to the guarded controller", async () => {
  const scriptPath =
    "deploy/gcp/plan-coming-soon-production-data-foundation.sh";
  const output = execFileSync("bash", [scriptPath, "--plan"], {
    encoding: "utf8",
  });
  assert.match(output, /PRODUCTION DATA FOUNDATION PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /Cloud state read: no/);
  assert.match(output, /db-custom-1-3840/);
  assert.match(output, /regional HA is required before transaction workloads/);
  assert.match(output, /maximum monthly infrastructure spend: USD 100/);
  assert.match(output, /guarded estimate with 20% contingency: USD 81\.92/);
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

test("enforces freshness and the exact USD 100 activation environment", () => {
  assert.deepEqual(
    validateProductionDataCostEstimateFreshness(
      contract,
      new Date("2026-08-31T12:00:00Z"),
    ),
    {
      asOf: "2026-08-31",
      validThrough: "2026-09-07",
      guardedMonthlyEstimateUsd: 81.92,
      approvedMaximumMonthlyInfrastructureSpendUsd: 100,
      headroomBelowMaximumUsd: 18.08,
    },
  );
  assert.throws(
    () =>
      validateProductionDataCostEstimateFreshness(
        contract,
        new Date("2026-09-08T00:00:00Z"),
      ),
    /expired on 2026-09-07/,
  );

  const environment = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-production",
    SAMRA_GCP_PROJECT_NUMBER: "382465561715",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
    SAMRA_GCP_DATA_CLASSIFICATION: "customer-pii",
    SAMRA_GCP_MONTHLY_BUDGET_USD: "25",
    SAMRA_GCP_MAX_MONTHLY_INFRASTRUCTURE_SPEND_USD: "100",
    SAMRA_GCP_GUARDED_MONTHLY_ESTIMATE_USD: "81.92",
  };
  assert.equal(
    validateProductionDataActivationEnvironment(environment).operator,
    "me@davidhaile.com",
  );
  for (const [key, value] of [
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-staging"],
    ["SAMRA_GCP_PROJECT_NUMBER", "1"],
    ["SAMRA_GCP_ORGANIZATION_ID", "1"],
    ["SAMRA_GCP_REGION", "us-west1"],
    ["SAMRA_GCP_OPERATOR_ACCOUNT", "external@example.com"],
    ["SAMRA_GCP_EXPECTED_SHA", "abc123"],
    ["SAMRA_GCP_DATA_CLASSIFICATION", "synthetic"],
    ["SAMRA_GCP_MONTHLY_BUDGET_USD", "100"],
    ["SAMRA_GCP_MAX_MONTHLY_INFRASTRUCTURE_SPEND_USD", "101"],
    ["SAMRA_GCP_GUARDED_MONTHLY_ESTIMATE_USD", "100.01"],
  ]) {
    assert.throws(() =>
      validateProductionDataActivationEnvironment({
        ...environment,
        [key]: value,
      }),
    );
  }
});

test("accepts only the exact private production SQL shape", () => {
  assert.ok(
    Object.values(
      validateObservedProductionDataSqlInstance(readyObservation().instance),
    ).every(Boolean),
  );
  for (const mutate of [
    (value) =>
      value.ipAddresses.push({ type: "PRIMARY", ipAddress: "34.1.2.3" }),
    (value) => (value.settings.ipConfiguration.ipv4Enabled = true),
    (value) => (value.settings.tier = "db-custom-2-7680"),
    (value) => (value.settings.availabilityType = "REGIONAL"),
    (value) => (value.settings.deletionProtectionEnabled = false),
    (value) =>
      (value.settings.ipConfiguration.privateNetwork =
        "projects/samra-pay-production/global/networks/wrong"),
  ]) {
    const observed = structuredClone(readyObservation().instance);
    mutate(observed);
    assert.throws(
      () => validateObservedProductionDataSqlInstance(observed),
      /Production Cloud SQL drift detected/,
    );
  }
});

test("classifies exact, missing, and drifted live data foundation state", () => {
  assert.deepEqual(
    classifyObservedProductionDataFoundation(readyObservation()),
    {
      schemaVersion: 1,
      status: "ready",
      projectId: "samra-pay-production",
      projectNumber: "382465561715",
      region: "us-east4",
      network: "samra-production-vpc",
      subnet: "samra-production-us-east4",
      privateServicesAccess: "google-managed-services-samra-production-vpc",
      instance: "samra-production-postgres",
      database: "samra_production",
      missingCount: 0,
      missing: {
        network: [],
        subnet: [],
        privateServicesAccess: [],
        serviceConnection: [],
        instance: [],
        database: [],
      },
      secretVersionCount: 0,
      cloudRunServiceCount: 0,
      cloudRunJobCount: 0,
      cloudMutation: false,
    },
  );

  const absent = readyObservation();
  absent.network = null;
  absent.subnet = null;
  absent.privateServicesAccess = null;
  absent.serviceConnections = [];
  absent.instance = null;
  absent.databases = [];
  const missing = classifyObservedProductionDataFoundation(absent);
  assert.equal(missing.status, "missing-exact-state");
  assert.equal(missing.missingCount, 6);
  assert.throws(
    () =>
      classifyObservedProductionDataFoundation(absent, contract, {
        requireReady: true,
      }),
    /not fully applied/,
  );

  const drifted = readyObservation();
  drifted.secretVersionCount = 1;
  assert.throws(
    () => classifyObservedProductionDataFoundation(drifted),
    /secret versions exist/,
  );
});

test("keeps review, exact authorization, apply order, and post-audit fail closed", async () => {
  const activationPath =
    "deploy/gcp/activate-coming-soon-production-data-foundation.sh";
  const auditPath =
    "deploy/gcp/audit-coming-soon-production-data-foundation.sh";
  const inspectorPath =
    "deploy/gcp/inspect-coming-soon-production-data-foundation.mjs";
  const activation = await readFile(activationPath, "utf8");
  const audit = await readFile(auditPath, "utf8");
  const inspector = await readFile(inspectorPath, "utf8");
  const output = execFileSync("bash", [activationPath, "--plan"], {
    encoding: "utf8",
  });
  assert.match(output, /ACTIVATION PLAN PASS/);
  assert.match(
    output,
    /USD 100 is the apply-time monthly infrastructure hard stop/,
  );
  assert.match(output, /guarded estimate with 20% contingency: USD 81\.92/);
  assert.match(
    output,
    /No credential,\nsecret version, migration, customer row/s,
  );

  const review = activation.indexOf(
    "READ-ONLY COMING-SOON PRODUCTION DATA FOUNDATION REVIEW PASS",
  );
  const authorization = activation.indexOf(
    '[[ "${SAMRA_GCP_PRODUCTION_DATA_FOUNDATION_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  const ordered = [
    'gcloud compute networks create "${NETWORK}"',
    'gcloud compute networks subnets create "${SUBNET}"',
    'gcloud compute addresses create "${PSA_RANGE}"',
    "gcloud services vpc-peerings connect",
    'gcloud sql instances create "${INSTANCE}"',
    'gcloud sql databases create "${DATABASE}"',
  ].map((needle) => activation.indexOf(needle));
  assert.ok(review >= 0 && authorization > review);
  assert.ok(ordered.every((index) => index > authorization));
  assert.deepEqual(
    [...ordered].sort((left, right) => left - right),
    ordered,
  );
  for (const control of [
    "AUTHORIZED_COMING_SOON_PRODUCTION_DATA_FOUNDATION",
    "--tier=db-custom-1-3840",
    "--availability-type=zonal",
    "--storage-auto-increase-limit=100",
    "--no-assign-ip",
    "--data-api-access=DISALLOW_DATA_API",
    "--retained-backups-count=14",
    "--enable-point-in-time-recovery",
    "--deletion-protection",
    "--require-ready",
    "audit-coming-soon-production-data-foundation.sh",
  ]) {
    assert.ok(activation.includes(control), control);
  }
  assert.doesNotMatch(
    activation,
    /secrets versions add|sql users create|run deploy|run jobs create|dns record-sets|allow-unauthenticated|auth0|persona|crossmint/iu,
  );
  assert.doesNotMatch(
    audit,
    /networks create|subnets create|addresses create|vpc-peerings connect|sql instances create|sql databases create|secrets versions add|run deploy|dns record-sets/iu,
  );
  assert.match(audit, /AUDIT COMPLETE — NO CLOUD, CUSTOMER DATA/);
  assert.doesNotMatch(
    inspector,
    /networks create|subnets create|addresses create|vpc-peerings connect|sql instances create|sql databases create|secrets versions add|run deploy|dns record-sets/iu,
  );
  execFileSync("bash", ["-n", activationPath]);
  execFileSync("bash", ["-n", auditPath]);
});
