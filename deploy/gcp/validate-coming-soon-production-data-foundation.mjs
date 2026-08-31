import { isIP } from "node:net";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
} from "./validate-coming-soon-launch.mjs";
import {
  readComingSoonProductionFoundation,
  validateComingSoonProductionFoundation,
} from "./validate-coming-soon-production-foundation.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ceilMoney(value) {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

function ipv4ToNumber(address) {
  assert(isIP(address) === 4, `Invalid IPv4 address: ${address}`);
  return address
    .split(".")
    .reduce((value, octet) => value * 256 + Number(octet), 0);
}

function parseCidr(cidr) {
  const [address, prefixText, extra] = String(cidr).split("/");
  const prefix = Number(prefixText);
  assert(
    extra === undefined &&
      Number.isInteger(prefix) &&
      prefix >= 8 &&
      prefix <= 30,
    `Invalid bounded IPv4 CIDR: ${cidr}`,
  );
  const start = ipv4ToNumber(address);
  const blockSize = 2 ** (32 - prefix);
  assert(start % blockSize === 0, `CIDR is not network-aligned: ${cidr}`);
  return { start, end: start + blockSize - 1, prefix };
}

export function readComingSoonProductionDataFoundation() {
  return JSON.parse(
    readFileSync(
      new URL("./coming-soon-production-data-foundation.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateComingSoonProductionDataFoundation(
  contract = readComingSoonProductionDataFoundation(),
  foundation = readComingSoonProductionFoundation(),
  launch = readComingSoonLaunch(),
) {
  const validatedFoundation = validateComingSoonProductionFoundation(
    foundation,
    launch,
  );
  const validatedLaunch = validateComingSoonLaunch(launch);
  assert(
    contract.schemaVersion === 1 &&
      contract.status === "applied-verified" &&
      contract.phase === "coming-soon-production-data-foundation" &&
      contract.decisionStatus === "data-foundation-applied-verified" &&
      contract.applyAuthorized === false &&
      contract.cloudStateReadByPlan === false,
    "The production data foundation must remain applied, verified, and closed to standing apply authorization",
  );
  assert(
    contract.linkedLaunchContract === "deploy/gcp/coming-soon-launch.json" &&
      contract.linkedFoundationContract ===
        "deploy/gcp/coming-soon-production-foundation.json" &&
      validatedFoundation.status === "validated-applied-verified" &&
      validatedLaunch.deploymentAuthorized === false &&
      validatedLaunch.dnsAuthorized === false,
    "The data plan requires the verified production foundation and review-only launch",
  );

  const evidence = contract.prerequisiteEvidence;
  assert(
    evidence.status === "foundation-applied-verified" &&
      evidence.sourceSha === foundation.activationEvidence.sourceSha &&
      evidence.apiCount === foundation.samraManagedApis.length &&
      evidence.serviceAccountCount ===
        Object.keys(foundation.serviceAccounts).length &&
      evidence.secretMetadataCount === foundation.secretMetadata.length &&
      evidence.secretVersionCount === 0,
    "The production foundation prerequisite evidence drifted",
  );

  const activationEvidence = contract.activationEvidence;
  assert(
    activationEvidence.status === "passed-independent-post-audit" &&
      activationEvidence.sourceSha ===
        "7977afc1a550521fefe1ae6df9acb787f75b1ed4" &&
      activationEvidence.appliedOn === "2026-08-31" &&
      activationEvidence.operator === "me@davidhaile.com" &&
      activationEvidence.observedState === "ready" &&
      activationEvidence.networkCount === 1 &&
      activationEvidence.subnetCount === 1 &&
      activationEvidence.privateServicesAccessCount === 1 &&
      activationEvidence.serviceConnectionCount === 1 &&
      activationEvidence.instanceCount === 1 &&
      activationEvidence.databaseCount === 1 &&
      activationEvidence.secretVersionCount === 0 &&
      activationEvidence.cloudRunServiceCount === 0 &&
      activationEvidence.cloudRunJobCount === 0 &&
      activationEvidence.cloudSqlCreateOperationId ===
        "dd0e1c32-0518-4468-ad9d-beb70000002c" &&
      activationEvidence.cloudSqlCreateOperationStatus === "DONE" &&
      activationEvidence.cloudSqlCreateOperationCompletedAt ===
        "2026-08-31T20:47:25.294Z" &&
      activationEvidence.postAuditCompletedAt === "2026-08-31T20:50:09Z" &&
      activationEvidence.guardedMonthlyEstimateUsd === 81.92 &&
      activationEvidence.approvedMaximumMonthlyInfrastructureSpendUsd === 100 &&
      activationEvidence.applyLogSha256 ===
        "f5f488b460d3d7833840471c3a0aff7217972a2bea616ee98b4f1885e19269f4" &&
      activationEvidence.cloudChangesLimitedToDataFoundation === true &&
      activationEvidence.cloudOrDnsChangesMadeByPostAudit === false,
    "The production data foundation activation evidence drifted",
  );

  const boundary = contract.productionBoundary;
  assert(
    boundary.projectId === foundation.productionBoundary.projectId &&
      boundary.projectNumber === foundation.productionBoundary.projectNumber &&
      boundary.organizationId ===
        foundation.productionBoundary.organizationId &&
      boundary.region === foundation.productionBoundary.region &&
      boundary.dataClassification ===
        foundation.productionBoundary.dataClassification &&
      boundary.mustNotEqualProjectId === "samra-pay-staging" &&
      boundary.projectId !== boundary.mustNotEqualProjectId,
    "The production data boundary drifted",
  );

  const network = contract.network;
  assert(
    network.name === "samra-production-vpc" &&
      network.subnetMode === "custom" &&
      network.routingMode === "REGIONAL" &&
      network.subnet.name === "samra-production-us-east4" &&
      network.subnet.privateGoogleAccess === true &&
      network.privateServicesAccess.rangeName ===
        "google-managed-services-samra-production-vpc" &&
      network.privateServicesAccess.purpose === "VPC_PEERING" &&
      network.privateServicesAccess.service ===
        "servicenetworking.googleapis.com",
    "The private production network boundary drifted",
  );
  const subnet = parseCidr(network.subnet.cidr);
  const privateServicesAccess = parseCidr(
    `${network.privateServicesAccess.address}/${network.privateServicesAccess.prefixLength}`,
  );
  assert(
    subnet.prefix === 24 &&
      privateServicesAccess.prefix === 24 &&
      !(
        subnet.start <= privateServicesAccess.end &&
        privateServicesAccess.start <= subnet.end
      ),
    "The production subnet and Private Services Access ranges must be distinct /24 ranges",
  );

  const database = contract.database;
  assert(
    database.name === "samra-production-postgres" &&
      database.databaseVersion === "POSTGRES_16" &&
      database.edition === "ENTERPRISE" &&
      database.tier === "db-custom-1-3840" &&
      database.availabilityType === "ZONAL" &&
      database.launchProfile === "coming-soon-dedicated-zonal" &&
      database.financialWorkloadAllowed === false &&
      database.regionalHaUpgradeRequiredBeforeFinancialWorkloads === true,
    "The dedicated coming-soon database profile drifted",
  );
  assert(
    database.diskType === "PD_SSD" &&
      database.diskSizeGb === 10 &&
      database.storageAutoResize === true &&
      database.storageAutoResizeLimitGb === 100 &&
      database.ipv4Enabled === false &&
      database.dataApiAccess === "DISALLOW_DATA_API" &&
      database.privateIpRequired === true &&
      database.deletionProtection === true,
    "Production storage, private access, or deletion protection drifted",
  );
  const backup = database.backup;
  assert(
    backup.enabled === true &&
      /^([01][0-9]|2[0-3]):[0-5][0-9]$/u.test(backup.startTimeUtc) &&
      backup.location === "us" &&
      backup.retainedBackups === 14 &&
      backup.pointInTimeRecoveryEnabled === true &&
      backup.transactionLogRetentionDays === 7 &&
      database.applicationDatabase.name === "samra_production" &&
      database.applicationDatabase.emptyAtCreation === true,
    "The production backup, recovery, or empty-database boundary drifted",
  );

  const cost = contract.costGate;
  const estimate = cost.estimate;
  const components = estimate.components;
  const calculatedBaseline = ceilMoney(
    components.oneVcpuHourlyUsd * estimate.hoursPerMonth +
      components.memoryGib *
        components.memoryGibHourlyUsd *
        estimate.hoursPerMonth +
      components.ssdStorageGib *
        components.ssdStorageGibHourlyUsd *
        estimate.hoursPerMonth +
      components.estimatedBackupGib *
        components.backupGibHourlyUsd *
        estimate.hoursPerMonth,
  );
  const calculatedContingency = ceilMoney(
    calculatedBaseline * (estimate.contingencyPercent / 100),
  );
  const calculatedGuardedEstimate = ceilMoney(
    calculatedBaseline + calculatedContingency,
  );
  assert(
    cost.monthlyBudgetAlertUsd ===
      foundation.productionBoundary.monthlyBudgetUsd &&
      cost.budgetIsSpendingCap === false &&
      cost.localPlanExecutionCostUsd === 0 &&
      cost.liveGoogleCloudEstimateRequiredBeforeApply === true &&
      cost.estimateApproved === true &&
      cost.approvedBy === "David Haile" &&
      cost.approvedOn === "2026-08-31" &&
      cost.approvedMaximumMonthlyInfrastructureSpendUsd === 100 &&
      cost.budgetCompatibilityClaim === false,
    "The production data cost approval drifted",
  );
  assert(
    estimate.currency === "USD" &&
      estimate.region === boundary.region &&
      estimate.asOf === "2026-08-31" &&
      estimate.validThrough === "2026-09-07" &&
      estimate.hoursPerMonth === 730 &&
      components.oneVcpuHourlyUsd === 0.054 &&
      components.memoryGib === 3.75 &&
      components.memoryGibHourlyUsd === 0.009 &&
      components.ssdStorageGib === database.diskSizeGb &&
      components.ssdStorageGibHourlyUsd === 0.000465753 &&
      components.estimatedBackupGib === database.diskSizeGb &&
      components.backupGibHourlyUsd === 0.000109589 &&
      estimate.baselineMonthlyUsd === calculatedBaseline &&
      estimate.contingencyPercent === 20 &&
      estimate.contingencyMonthlyUsd === calculatedContingency &&
      estimate.guardedMonthlyEstimateUsd === calculatedGuardedEstimate &&
      estimate.guardedMonthlyEstimateUsd <
        cost.approvedMaximumMonthlyInfrastructureSpendUsd &&
      estimate.headroomBelowMaximumUsd ===
        ceilMoney(
          cost.approvedMaximumMonthlyInfrastructureSpendUsd -
            estimate.guardedMonthlyEstimateUsd,
        ) &&
      estimate.excludes.length === 4 &&
      JSON.stringify(estimate.sources) ===
        JSON.stringify([
          "https://cloud.google.com/sql/pricing",
          "https://cloud.google.com/sql/docs/postgres/machine-series-overview",
        ]),
    "The production data estimate or USD 100 hard stop drifted",
  );
  const availability = contract.availabilityDecision;
  assert(
    availability.temporaryZonalPostureAccepted === true &&
      availability.acceptedBy === "David Haile" &&
      availability.acceptedOn === "2026-08-31" &&
      availability.scope === "coming-soon foundation only" &&
      availability.regionalHaRequiredBeforeFinancialWorkloads === true,
    "The temporary zonal availability decision drifted",
  );
  const customerData = contract.customerDataGate;
  assert(
    customerData.customerDataCreationAuthorized === false &&
      customerData.waitlistRetentionDays === null &&
      customerData.retentionApproval === "pending" &&
      customerData.deletionProcedureApproved === false &&
      customerData.accessOwnerApproved === false &&
      customerData.privacyNoticeApproved === false,
    "Customer data and retention must remain unauthorized",
  );

  const plan = contract.plan;
  assert(
    plan.mode === "guarded-review-recovery-controller" &&
      plan.hasReviewMode === true &&
      plan.hasApplyMode === true &&
      plan.recoveryMustReverifyFoundation === true &&
      plan.recoveryMustBeResumableAndRejectDrift === true &&
      plan.recoveryCreatesOrReusesOnly.length === 5 &&
      plan.doesNotCreate.length === 6 &&
      plan.doesNotCreate.some((value) => /customer data/u.test(value)) &&
      plan.doesNotCreate.some((value) => /Cloud Run/u.test(value)) &&
      plan.doesNotCreate.some((value) => /Squarespace DNS/u.test(value)),
    "The guarded plan or apply boundary drifted",
  );
  const activation = contract.activation;
  assert(
    activation.controller ===
      "deploy/gcp/activate-coming-soon-production-data-foundation.sh" &&
      activation.inspector ===
        "deploy/gcp/inspect-coming-soon-production-data-foundation.mjs" &&
      activation.postAudit ===
        "deploy/gcp/audit-coming-soon-production-data-foundation.sh" &&
      activation.authorizationEnvironment ===
        "SAMRA_GCP_PRODUCTION_DATA_FOUNDATION_APPLY" &&
      activation.authorizationValue ===
        "AUTHORIZED_COMING_SOON_PRODUCTION_DATA_FOUNDATION" &&
      activation.reviewBeforeApply === true &&
      activation.postAuditRequired === true &&
      activation.resumable === true &&
      activation.automaticApply === false &&
      activation.githubWorkflowAuthorized === false,
    "The production data activation controller boundary drifted",
  );
  assert(
    contract.rollback.automaticDestructiveRollback === false &&
      /resume only/u.test(contract.rollback.partialApplyRecovery) &&
      contract.rollback.destructiveRemovalRequiresSeparateApproval === true &&
      contract.rollback.customerDataExists === false,
    "The production data rollback boundary drifted",
  );
  assert(
    JSON.stringify(contract.blockedOn) ===
      JSON.stringify([
        "retention, deletion, access ownership, and privacy approval before customer data",
        "separately reviewed database-credential, migration, deployment, public-traffic, and DNS authorizations",
      ]),
    "The production data decision gates drifted",
  );

  const source = JSON.stringify(contract);
  assert(
    !/postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|api[_-]?key|password|versions\/latest/iu.test(
      source,
    ),
    "The production data plan contains a credential or unpinned secret",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated-applied-verified",
    phase: contract.phase,
    boundaryStatus: contract.decisionStatus,
    projectId: boundary.projectId,
    region: boundary.region,
    network: network.name,
    subnetCidr: network.subnet.cidr,
    privateServicesAccessCidr: `${network.privateServicesAccess.address}/${network.privateServicesAccess.prefixLength}`,
    instance: database.name,
    databaseVersion: database.databaseVersion,
    tier: database.tier,
    availabilityType: database.availabilityType,
    database: database.applicationDatabase.name,
    monthlyBudgetAlertUsd: cost.monthlyBudgetAlertUsd,
    approvedMaximumMonthlyInfrastructureSpendUsd:
      cost.approvedMaximumMonthlyInfrastructureSpendUsd,
    guardedMonthlyEstimateUsd: estimate.guardedMonthlyEstimateUsd,
    estimateValidThrough: estimate.validThrough,
    temporaryZonalPostureAccepted: true,
    activationEvidenceStatus: activationEvidence.status,
    activationSourceSha: activationEvidence.sourceSha,
    observedState: activationEvidence.observedState,
    liveCostDecisionRequired: false,
    customerDataAuthorized: false,
    cloudStateRead: false,
    cloudMutationAuthorized: false,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
}

export function validateProductionDataCostEstimateFreshness(
  contract = readComingSoonProductionDataFoundation(),
  now = new Date(),
) {
  validateComingSoonProductionDataFoundation(contract);
  const estimate = contract.costGate.estimate;
  const currentDate = now.toISOString().slice(0, 10);
  assert(
    currentDate >= estimate.asOf && currentDate <= estimate.validThrough,
    `The reviewed production data estimate expired on ${estimate.validThrough}`,
  );
  return Object.freeze({
    asOf: estimate.asOf,
    validThrough: estimate.validThrough,
    guardedMonthlyEstimateUsd: estimate.guardedMonthlyEstimateUsd,
    approvedMaximumMonthlyInfrastructureSpendUsd:
      contract.costGate.approvedMaximumMonthlyInfrastructureSpendUsd,
    headroomBelowMaximumUsd: estimate.headroomBelowMaximumUsd,
  });
}

export function validateProductionDataActivationEnvironment(
  environment = process.env,
  contract = readComingSoonProductionDataFoundation(),
) {
  const validated = validateComingSoonProductionDataFoundation(contract);
  const expected = {
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    organizationId: "614833350075",
    region: "us-east4",
    operator: "me@davidhaile.com",
    dataClassification: "customer-pii",
    monthlyBudgetAlertUsd: "25",
    maximumMonthlyInfrastructureSpendUsd: "100",
    guardedMonthlyEstimateUsd: "81.92",
  };
  assert(
    environment.SAMRA_GCP_PROJECT_ID === expected.projectId &&
      environment.SAMRA_GCP_PROJECT_NUMBER === expected.projectNumber &&
      environment.SAMRA_GCP_ORGANIZATION_ID === expected.organizationId &&
      environment.SAMRA_GCP_REGION === expected.region &&
      environment.SAMRA_GCP_OPERATOR_ACCOUNT === expected.operator &&
      environment.SAMRA_GCP_DATA_CLASSIFICATION ===
        expected.dataClassification &&
      environment.SAMRA_GCP_MONTHLY_BUDGET_USD ===
        expected.monthlyBudgetAlertUsd &&
      environment.SAMRA_GCP_MAX_MONTHLY_INFRASTRUCTURE_SPEND_USD ===
        expected.maximumMonthlyInfrastructureSpendUsd &&
      environment.SAMRA_GCP_GUARDED_MONTHLY_ESTIMATE_USD ===
        expected.guardedMonthlyEstimateUsd &&
      /^[0-9a-f]{40}$/u.test(environment.SAMRA_GCP_EXPECTED_SHA ?? "") &&
      validated.guardedMonthlyEstimateUsd <
        validated.approvedMaximumMonthlyInfrastructureSpendUsd,
    "The production data activation environment or USD 100 hard stop drifted",
  );
  return Object.freeze({
    ...expected,
    expectedSha: environment.SAMRA_GCP_EXPECTED_SHA,
  });
}

export function validateObservedProductionDataSqlInstance(
  observed,
  contract = readComingSoonProductionDataFoundation(),
) {
  validateComingSoonProductionDataFoundation(contract);
  const desired = contract.database;
  const settings = observed.settings ?? {};
  const ip = settings.ipConfiguration ?? {};
  const backup = settings.backupConfiguration ?? {};
  const retention = backup.backupRetentionSettings ?? {};
  const expectedNetwork = `projects/${contract.productionBoundary.projectId}/global/networks/${contract.network.name}`;
  const observedNetwork = ip.privateNetwork?.replace(/^\/(?=projects\/)/u, "");
  const publicAddresses = (observed.ipAddresses ?? []).filter(
    (entry) => entry.type === "PRIMARY",
  );
  const checks = {
    name: observed.name === desired.name,
    project: observed.project === contract.productionBoundary.projectId,
    region: observed.region === contract.productionBoundary.region,
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
    privateNetwork: observedNetwork === expectedNetwork,
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
  assert(
    failed.length === 0,
    `Production Cloud SQL drift detected: ${failed.join(", ")}`,
  );
  return Object.freeze(checks);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateComingSoonProductionDataFoundation()));
  } catch (error) {
    console.error(
      `Production data foundation plan rejected: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
