import { isIP } from "node:net";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NAME = /^[a-z][a-z0-9-]{2,62}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const ORGANIZATION_ID = /^[0-9]+$/;
const REGION = /^[a-z]+-[a-z]+[0-9]$/;

export function readStagingDatabase() {
  return JSON.parse(
    readFileSync(new URL("./staging-database.json", import.meta.url), "utf8"),
  );
}

function ipv4ToNumber(address) {
  if (isIP(address) !== 4) throw new Error(`Invalid IPv4 address: ${address}`);
  return address
    .split(".")
    .reduce((value, octet) => value * 256 + Number(octet), 0);
}

function parseCidr(cidr) {
  const [address, prefixText, extra] = cidr.split("/");
  const prefix = Number(prefixText);
  if (
    extra !== undefined ||
    !Number.isInteger(prefix) ||
    prefix < 8 ||
    prefix > 30
  ) {
    throw new Error(`Invalid bounded IPv4 CIDR: ${cidr}`);
  }
  const value = ipv4ToNumber(address);
  const blockSize = 2 ** (32 - prefix);
  if (value % blockSize !== 0)
    throw new Error(`CIDR is not network-aligned: ${cidr}`);
  return { start: value, end: value + blockSize - 1, prefix };
}

function assertNonOverlapping(left, right) {
  const a = parseCidr(left);
  const b = parseCidr(right);
  if (a.start <= b.end && b.start <= a.end) {
    throw new Error(`Network ranges overlap: ${left} and ${right}`);
  }
}

export function validateStagingDatabase(contract = readStagingDatabase()) {
  if (contract.schemaVersion !== 1)
    throw new Error("Unsupported staging database schema");
  if (
    contract.status !== "review-only" ||
    contract.environment !== "staging" ||
    contract.dataClassification !== "synthetic-only" ||
    contract.deploymentAuthorized !== false
  ) {
    throw new Error(
      "Database contract must remain review-only synthetic staging",
    );
  }

  const { project, network, instance, apply } = contract;
  if (!PROJECT_ID.test(project.id) || project.id !== "samra-pay-staging") {
    throw new Error("A dedicated staging project is required");
  }
  if (
    !ORGANIZATION_ID.test(project.organizationId) ||
    project.organizationId !== "614833350075" ||
    !REGION.test(project.region) ||
    project.region !== "us-east4"
  ) {
    throw new Error("Reviewed organization and region are required");
  }
  for (const name of [
    network.name,
    network.subnet.name,
    network.privateServicesAccess.rangeName,
  ]) {
    if (!NAME.test(name))
      throw new Error(`Invalid Google Cloud resource name: ${name}`);
  }
  if (
    network.subnetMode !== "custom" ||
    network.routingMode !== "REGIONAL" ||
    network.subnet.privateGoogleAccess !== true
  ) {
    throw new Error(
      "The database network must be custom, regional, and private-Google enabled",
    );
  }
  const subnet = parseCidr(network.subnet.cidr);
  const psa = network.privateServicesAccess;
  const psaCidr = `${psa.address}/${psa.prefixLength}`;
  const allocation = parseCidr(psaCidr);
  if (subnet.prefix !== 24 || allocation.prefix !== 24) {
    throw new Error("Both bounded staging network ranges must be /24");
  }
  assertNonOverlapping(network.subnet.cidr, psaCidr);
  if (
    psa.purpose !== "VPC_PEERING" ||
    psa.service !== "servicenetworking.googleapis.com"
  ) {
    throw new Error(
      "Private Services Access must use the Google service networking boundary",
    );
  }

  if (
    instance.name !== "samra-staging-postgres" ||
    instance.databaseVersion !== "POSTGRES_16" ||
    instance.edition !== "ENTERPRISE" ||
    instance.tier !== "db-g1-small" ||
    instance.availabilityType !== "ZONAL"
  ) {
    throw new Error("The cost-bounded PostgreSQL 16 staging shape changed");
  }
  if (
    instance.diskType !== "PD_SSD" ||
    instance.diskSizeGb !== 10 ||
    instance.storageAutoResize !== true ||
    instance.storageAutoResizeLimitGb !== 50
  ) {
    throw new Error("Storage must remain SSD, bounded, and auto-resizing");
  }
  if (
    instance.ipv4Enabled !== false ||
    instance.dataApiAccess !== "DISALLOW_DATA_API" ||
    instance.privateIpRequired !== true ||
    instance.deletionProtection !== true
  ) {
    throw new Error(
      "Public IP is forbidden and deletion protection is required",
    );
  }
  const backup = instance.backup;
  if (
    backup.enabled !== true ||
    !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(backup.startTimeUtc) ||
    backup.location !== "us" ||
    backup.retainedBackups !== 7 ||
    backup.pointInTimeRecoveryEnabled !== true ||
    backup.transactionLogRetentionDays !== 7
  ) {
    throw new Error(
      "Seven-day backups and point-in-time recovery are mandatory",
    );
  }
  if (
    instance.database.name !== "samra_staging" ||
    instance.database.emptyAtCreation !== true
  ) {
    throw new Error("Only the empty staging database may be created");
  }
  if (
    apply.authorizationSentinel !== "AUTHORIZED_STAGING_DATABASE" ||
    apply.resumableOnlyWhenExistingResourcesMatch !== true ||
    apply.liveCostEstimateRequiredBeforeApply !== true ||
    apply.budgetAlertIsNotASpendingCap !== true
  ) {
    throw new Error(
      "Apply authorization, cost review, and drift-stop controls are required",
    );
  }

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated",
    projectId: project.id,
    organizationId: project.organizationId,
    region: project.region,
    network: network.name,
    subnetCidr: network.subnet.cidr,
    privateServicesAccessCidr: psaCidr,
    instance: instance.name,
    databaseVersion: instance.databaseVersion,
    tier: instance.tier,
    database: instance.database.name,
  });
}

export function validateDatabaseEnvironment(
  input,
  contract = readStagingDatabase(),
) {
  const validated = validateStagingDatabase(contract);
  const required = {
    SAMRA_GCP_PROJECT_ID: validated.projectId,
    SAMRA_GCP_ORGANIZATION_ID: validated.organizationId,
    SAMRA_GCP_REGION: validated.region,
  };
  for (const [key, expected] of Object.entries(required)) {
    if (input[key]?.trim() !== expected)
      throw new Error(`${key} must exactly match ${expected}`);
  }
  const operator = input.SAMRA_GCP_OPERATOR_ACCOUNT?.trim();
  if (!operator || !/^[^@\s]+@davidhaile\.com$/.test(operator)) {
    throw new Error(
      "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
    );
  }
  return Object.freeze({ ...validated, operator });
}

export function validateObservedSqlInstance(
  observed,
  contract = readStagingDatabase(),
) {
  validateStagingDatabase(contract);
  const desired = contract.instance;
  const settings = observed.settings ?? {};
  const ip = settings.ipConfiguration ?? {};
  const backup = settings.backupConfiguration ?? {};
  const retention = backup.backupRetentionSettings ?? {};
  const expectedNetwork = `/projects/${contract.project.id}/global/networks/${contract.network.name}`;
  const publicAddresses = (observed.ipAddresses ?? []).filter(
    (entry) => entry.type === "PRIMARY",
  );
  const checks = {
    name: observed.name === desired.name,
    project: observed.project === contract.project.id,
    region: observed.region === contract.project.region,
    state: observed.state === "RUNNABLE",
    databaseVersion: observed.databaseVersion === desired.databaseVersion,
    tier: settings.tier === desired.tier,
    availabilityType: settings.availabilityType === desired.availabilityType,
    diskType: settings.dataDiskType === desired.diskType,
    diskSize: Number(settings.dataDiskSizeGb) === desired.diskSizeGb,
    autoResize: settings.storageAutoResize === desired.storageAutoResize,
    autoResizeLimit:
      Number(settings.storageAutoResizeLimit) ===
      desired.storageAutoResizeLimitGb,
    privateNetwork: ip.privateNetwork === expectedNetwork,
    publicIpDisabled: ip.ipv4Enabled === false && publicAddresses.length === 0,
    dataApiAccessDisabled:
      (settings.dataApiAccess ?? observed.dataApiAccess) !== "ALLOW_DATA_API",
    backupEnabled: backup.enabled === true,
    backupStart: backup.startTime === desired.backup.startTimeUtc,
    backupLocation: backup.location === desired.backup.location,
    retainedBackups:
      Number(retention.retainedBackups) === desired.backup.retainedBackups,
    pointInTimeRecovery: backup.pointInTimeRecoveryEnabled === true,
    transactionLogRetention:
      Number(backup.transactionLogRetentionDays) ===
      desired.backup.transactionLogRetentionDays,
    deletionProtection: settings.deletionProtectionEnabled === true,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0)
    throw new Error(`Cloud SQL drift detected: ${failed.join(", ")}`);
  return Object.freeze(checks);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateDatabaseEnvironment(process.env)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Staging database rejected: ${message}`);
    process.exitCode = 1;
  }
}
