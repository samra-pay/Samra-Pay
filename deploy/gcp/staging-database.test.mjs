import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readStagingDatabase,
  validateDatabaseEnvironment,
  validateObservedSqlInstance,
  validateStagingDatabase,
} from "./validate-staging-database.mjs";

const contract = readStagingDatabase();
const source = JSON.stringify(contract);
const provision = await readFile(
  "deploy/gcp/provision-staging-database.sh",
  "utf8",
);
const audit = await readFile("deploy/gcp/audit-staging-database.sh", "utf8");

const observed = {
  name: "samra-staging-postgres",
  project: "samra-pay-staging",
  region: "us-east4",
  state: "RUNNABLE",
  databaseVersion: "POSTGRES_16",
  ipAddresses: [{ ipAddress: "10.41.0.3", type: "PRIVATE" }],
  settings: {
    tier: "db-g1-small",
    availabilityType: "ZONAL",
    dataDiskType: "PD_SSD",
    dataDiskSizeGb: "10",
    storageAutoResize: true,
    storageAutoResizeLimit: "50",
    deletionProtectionEnabled: true,
    ipConfiguration: {
      ipv4Enabled: false,
      privateNetwork:
        "projects/samra-pay-staging/global/networks/samra-staging-vpc",
    },
    backupConfiguration: {
      enabled: true,
      startTime: "07:00",
      location: "us",
      pointInTimeRecoveryEnabled: true,
      transactionLogRetentionDays: 7,
      backupRetentionSettings: { retainedBackups: 7 },
    },
  },
};

test("locks the bounded private PostgreSQL 16 staging contract", () => {
  assert.deepEqual(validateStagingDatabase(contract), {
    schemaVersion: 1,
    status: "validated",
    projectId: "samra-pay-staging",
    organizationId: "614833350075",
    region: "us-east4",
    network: "samra-staging-vpc",
    subnetCidr: "10.40.0.0/24",
    privateServicesAccessCidr: "10.41.0.0/24",
    instance: "samra-staging-postgres",
    databaseVersion: "POSTGRES_16",
    tier: "db-g1-small",
    database: "samra_staging",
  });
  assert.equal(
    validateDatabaseEnvironment({
      SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
      SAMRA_GCP_ORGANIZATION_ID: "614833350075",
      SAMRA_GCP_REGION: "us-east4",
      SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
    }).operator,
    "operator@davidhaile.com",
  );
});

test("rejects identity, public access, resilience, and network drift", () => {
  for (const [path, value] of [
    ["project.id", "samra-pay-production"],
    ["project.region", "us-west1"],
    ["network.subnet.cidr", "10.41.0.0/24"],
    ["instance.databaseVersion", "POSTGRES_18"],
    ["instance.ipv4Enabled", true],
    ["instance.deletionProtection", false],
    ["instance.backup.pointInTimeRecoveryEnabled", false],
  ]) {
    const candidate = structuredClone(contract);
    const keys = path.split(".");
    let target = candidate;
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys.at(-1)] = value;
    assert.throws(() => validateStagingDatabase(candidate), path);
  }
});

test("accepts only an exact runnable private Cloud SQL observation", () => {
  const checks = validateObservedSqlInstance(observed, contract);
  assert.ok(Object.values(checks).every(Boolean));

  const legacyNetworkPath = structuredClone(observed);
  legacyNetworkPath.settings.ipConfiguration.privateNetwork =
    `/${legacyNetworkPath.settings.ipConfiguration.privateNetwork}`;
  assert.ok(
    Object.values(validateObservedSqlInstance(legacyNetworkPath, contract)).every(
      Boolean,
    ),
  );

  for (const mutate of [
    (copy) => copy.ipAddresses.push({ type: "PRIMARY", ipAddress: "34.1.2.3" }),
    (copy) => (copy.settings.ipConfiguration.ipv4Enabled = true),
    (copy) =>
      (copy.settings.backupConfiguration.pointInTimeRecoveryEnabled = false),
    (copy) => (copy.settings.deletionProtectionEnabled = false),
    (copy) => (copy.settings.tier = "db-custom-2-7680"),
    (copy) =>
      (copy.settings.ipConfiguration.privateNetwork =
        "projects/samra-pay-staging/global/networks/not-samra-staging-vpc"),
    (copy) =>
      (copy.settings.ipConfiguration.privateNetwork =
        "//projects/samra-pay-staging/global/networks/samra-staging-vpc"),
  ]) {
    const copy = structuredClone(observed);
    mutate(copy);
    assert.throws(() => validateObservedSqlInstance(copy, contract), /drift/);
  }
});

test("keeps plan, live review, and apply as separate gates", () => {
  assert.match(provision, /MODE="\$\{1:---plan\}"/);
  assert.match(provision, /--plan\|--review\|--apply/);
  assert.match(provision, /AUTHORIZED_STAGING_DATABASE/);
  assert.match(provision, /REVIEW COMPLETE — NO CLOUD CHANGES/);
  assert.match(provision, /Plan only\. No Google Cloud resource was changed/);
  const capability = provision.indexOf("SQL_CREATE_HELP=");
  const firstMutation = provision.indexOf(
    'gcloud compute networks create "${NETWORK}"',
  );
  assert.ok(capability >= 0 && firstMutation > capability);
  assert.equal(contract.apply.liveCostEstimateRequiredBeforeApply, true);
  assert.equal(contract.apply.budgetAlertIsNotASpendingCap, true);
});

test("creates private networking before a protected database and nothing beyond it", () => {
  const ordered = [
    'gcloud compute networks create "${NETWORK}"',
    'gcloud compute networks subnets create "${SUBNET}"',
    'gcloud compute addresses create "${PSA_RANGE}"',
    "gcloud services vpc-peerings connect",
    'gcloud sql instances create "${INSTANCE}"',
    'gcloud sql databases create "${DATABASE}"',
  ].map((needle) => provision.indexOf(needle));
  assert.ok(ordered.every((index) => index >= 0));
  assert.deepEqual(
    [...ordered].sort((a, b) => a - b),
    ordered,
  );

  for (const control of [
    "--database-version=POSTGRES_16",
    "--edition=enterprise",
    "--tier=db-g1-small",
    "--availability-type=zonal",
    "--no-assign-ip",
    "--data-api-access=DISALLOW_DATA_API",
    "--backup",
    "--enable-point-in-time-recovery",
    "--retained-backups-count=7",
    "--retained-transaction-log-days=7",
    "--deletion-protection",
  ])
    assert.ok(provision.includes(control), control);

  assert.doesNotMatch(
    provision,
    /gcloud secrets versions add|gcloud sql users create|--root-password|--authorized-networks|gcloud run deploy|gcloud run jobs create|drizzle(?:-kit)? (?:push|migrate)|pnpm .*migrate|worf\.replit/i,
  );
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\/|password/i);
  assert.ok(contract.apply.doesNotCreate.includes("customer data"));
});

test("independent audit proves private IP, database, resilience, and phase boundaries", () => {
  for (const evidence of [
    "validateObservedSqlInstance",
    "private services allocation drift",
    "staging database is missing",
    "database secret version was created outside this phase",
    "Cloud Run changed before its approved phase",
    "STAGING DATABASE AUDIT PASS",
  ])
    assert.ok(audit.includes(evidence), evidence);
  assert.match(audit, /Secret versions: 0/);
  assert.match(audit, /Cloud Run services\/jobs: 0\/0/);
});
