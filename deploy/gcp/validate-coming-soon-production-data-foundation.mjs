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
      contract.status === "decision-required-not-applied" &&
      contract.phase === "coming-soon-production-data-foundation" &&
      contract.applyAuthorized === false &&
      contract.cloudStateReadByPlan === false,
    "The production data foundation must remain decision-gated and unapplied",
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
  assert(
    cost.monthlyBudgetAlertUsd ===
      foundation.productionBoundary.monthlyBudgetUsd &&
      cost.budgetIsSpendingCap === false &&
      cost.localPlanExecutionCostUsd === 0 &&
      cost.liveGoogleCloudEstimateRequiredBeforeApply === true &&
      cost.estimateApproved === false &&
      cost.approvedMaximumMonthlyInfrastructureSpendUsd === null &&
      cost.budgetCompatibilityClaim === false,
    "The live cost decision must remain unresolved before apply",
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
    plan.mode === "local-only" &&
      plan.hasReviewMode === false &&
      plan.hasApplyMode === false &&
      plan.futureApplyMustBeSeparateController === true &&
      plan.futureApplyMustReverifyFoundation === true &&
      plan.futureApplyMustBeResumableAndRejectDrift === true &&
      plan.futureApplyProposalCreatesOnly.length === 5 &&
      plan.doesNotCreate.length === 6 &&
      plan.doesNotCreate.some((value) => /customer data/u.test(value)) &&
      plan.doesNotCreate.some((value) => /Cloud Run/u.test(value)) &&
      plan.doesNotCreate.some((value) => /Squarespace DNS/u.test(value)),
    "The local-only plan or future apply boundary drifted",
  );
  assert(
    contract.blockedOn.length === 4 &&
      contract.blockedOn.some((value) => /maximum monthly/u.test(value)) &&
      contract.blockedOn.some((value) => /zonal/u.test(value)) &&
      contract.blockedOn.some((value) =>
        /authorized production data/u.test(value),
      ) &&
      contract.blockedOn.some((value) => /privacy/u.test(value)),
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
    status: "validated-decision-required-not-applied",
    phase: contract.phase,
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
    liveCostDecisionRequired: true,
    customerDataAuthorized: false,
    cloudStateRead: false,
    cloudMutationAuthorized: false,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
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
