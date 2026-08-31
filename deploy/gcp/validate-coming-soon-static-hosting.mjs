import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
} from "./validate-coming-soon-launch.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  assert(value.length > 0, `${name} is required`);
  return value;
}

export function readComingSoonStaticHosting() {
  return JSON.parse(
    readFileSync(
      new URL("./coming-soon-static-hosting.json", import.meta.url),
      "utf8",
    ),
  );
}

export function readFirebaseHostingConfig() {
  return JSON.parse(
    readFileSync(new URL("../../firebase.json", import.meta.url), "utf8"),
  );
}

export function validateComingSoonStaticHosting(
  contract = readComingSoonStaticHosting(),
  launch = readComingSoonLaunch(),
  firebase = readFirebaseHostingConfig(),
) {
  const validatedLaunch = validateComingSoonLaunch(launch);
  const override = launch.staticInformationalOverride;

  assert(
    contract.schemaVersion === 1 &&
      contract.status === "approved-not-applied" &&
      contract.phase === "coming-soon-static-informational-launch" &&
      contract.decision.approvedOn === "2026-08-31" &&
      contract.decision.scope === "public static informational website" &&
      contract.decision.emailCollectionDeferred === true &&
      contract.decision.standingApplyAuthorization === false,
    "The static launch decision drifted",
  );
  assert(
    contract.linkedLaunchContract === "deploy/gcp/coming-soon-launch.json" &&
      validatedLaunch.deploymentAuthorized === false &&
      validatedLaunch.dnsAuthorized === false &&
      override.decisionStatus === "approved-for-exact-sha-release" &&
      override.linkedContract ===
        "deploy/gcp/coming-soon-static-hosting.json" &&
      override.hostingProvider === "firebase-hosting" &&
      override.publicInformationOnly === true &&
      override.emailCollection === false &&
      override.apiDeployment === false &&
      override.databaseUse === false &&
      override.vendorActivation === false &&
      override.supersedesInteractiveLaunch === false,
    "The static override must not authorize the interactive launch",
  );

  const source = contract.source;
  assert(
    source.repository === "haileleuld87/Samra-Pay" &&
      source.snapshotVersion === 13 &&
      /^[0-9a-f]{40}$/u.test(source.snapshotCommit) &&
      source.releaseSource === "FULL_GIT_SHA" &&
      source.buildCommand ===
        "pnpm --filter @workspace/samra-pay run build" &&
      source.buildDirectory === "artifacts/samra-pay/dist/public" &&
      source.hostingConfig === "firebase.json",
    "The exact-source static build boundary drifted",
  );

  const boundary = contract.productionBoundary;
  assert(
    boundary.projectId === "samra-pay-production" &&
      boundary.projectNumber === "382465561715" &&
      boundary.organizationId === "614833350075" &&
      boundary.operator === "me@davidhaile.com" &&
      boundary.region === "us-east4" &&
      boundary.dataClassification === "public-informational" &&
      boundary.existingInfrastructureGuardedEstimateUsd === 81.92 &&
      boundary.monthlyInfrastructureHardStopUsd === 100 &&
      boundary.remainingGuardedHeadroomUsd === 18.08,
    "The production identity or USD 100 cost boundary drifted",
  );

  const hosting = contract.hosting;
  assert(
    hosting.provider === "firebase-hosting" &&
      hosting.siteId === "samra-pay-production" &&
      hosting.defaultUrl === "https://samra-pay-production.web.app" &&
      hosting.cdn === true &&
      hosting.automaticTls === true &&
      hosting.singlePageApplication === true &&
      hosting.projectAliasFileAllowed === false &&
      hosting.deployOnly === "hosting",
    "The bounded Firebase Hosting target drifted",
  );

  const publicBoundary = contract.publicBoundary;
  assert(
    publicBoundary.informationalOnly === true &&
      publicBoundary.formsAllowed === false &&
      publicBoundary.emailCollectionAllowed === false &&
      publicBoundary.apiRoutes.length === 0 &&
      publicBoundary.databaseAccess === false &&
      publicBoundary.secrets.length === 0 &&
      publicBoundary.analytics === false &&
      publicBoundary.advertisingPixels === false &&
      publicBoundary.customerAuthentication === false &&
      publicBoundary.kyc === false &&
      publicBoundary.wallet === false &&
      publicBoundary.moneyMovement === false &&
      publicBoundary.vendorActivation === false,
    "The static public surface gained data collection or an application dependency",
  );

  const effects = contract.providerManagedEffects;
  assert(
    effects.firebaseProjectLinkageAllowed === true &&
      effects.providerManagedApiAndServiceAgentCreationAllowed === true &&
      effects.firebaseAuthenticationAllowed === false &&
      effects.firestoreDatabaseAllowed === false &&
      effects.realtimeDatabaseAllowed === false &&
      effects.cloudStorageBucketAllowed === false &&
      effects.firebaseAppRegistrationAllowed === false,
    "Firebase linkage must not activate data or identity products",
  );

  const cost = contract.cost;
  assert(
    cost.currency === "USD" &&
      cost.expectedIncrementalMonthlyCostUsd === 0 &&
      cost.noCostStorageGib === 10 &&
      cost.noCostMonthlyTransferGib === 10 &&
      cost.storageAboveNoCostUsdPerGib === 0.026 &&
      cost.transferAboveNoCostUsdPerGib === 0.15 &&
      cost.usageDependent === true &&
      cost.spendingCap === false &&
      cost.hardStopRequiresReassessmentAtTotalMonthlyEstimateUsd === 100,
    "The static hosting cost guard drifted",
  );

  const domain = contract.domain;
  assert(
    domain.dnsOwner === "Squarespace" &&
      domain.apex === "samrapay.com" &&
      domain.canonicalDomain === "www.samrapay.com" &&
      domain.apexBehavior === "redirect-to-canonical" &&
      domain.preserveDnsRecordTypes.includes("MX") &&
      domain.preserveDnsRecordTypes.includes("DMARC") &&
      domain.preserveUnrelatedRecords === true &&
      domain.decisionApproved === true &&
      domain.standingDnsAuthorization === false,
    "The Squarespace DNS preservation boundary drifted",
  );

  assert(
    contract.release.activationEnvironment ===
      "SAMRA_GCP_STATIC_HOSTING_APPLY" &&
      contract.release.activationSentinel ===
        "AUTHORIZED_COMING_SOON_STATIC_HOSTING" &&
      contract.release.exactShaRequired === true &&
      contract.release.cleanWorkingTreeRequired === true &&
      contract.release.reviewBeforeApply === true &&
      contract.release.postAuditRequired === true &&
      contract.release.recordPriorReleaseRequired === true,
    "The exact-SHA release gate drifted",
  );

  const hostingConfig = firebase.hosting;
  const headerMap = new Map(
    hostingConfig.headers
      .flatMap((rule) => rule.headers)
      .map((header) => [header.key, header.value]),
  );
  assert(
    hostingConfig.public === source.buildDirectory &&
      hostingConfig.trailingSlash === false &&
      hostingConfig.rewrites.length === 1 &&
      hostingConfig.rewrites[0].source === "**" &&
      hostingConfig.rewrites[0].destination === "/index.html" &&
      headerMap.get("Content-Security-Policy") ===
        contract.security.contentSecurityPolicy &&
      headerMap.get("Referrer-Policy") === contract.security.referrerPolicy &&
      headerMap.get("X-Content-Type-Options") ===
        contract.security.xContentTypeOptions &&
      headerMap.get("X-Frame-Options") === contract.security.xFrameOptions &&
      headerMap.get("Permissions-Policy") ===
        contract.security.permissionsPolicy &&
      headerMap.get("Strict-Transport-Security") === contract.security.hsts &&
      !headerMap.get("Strict-Transport-Security").includes("includeSubDomains"),
    "firebase.json does not enforce the reviewed static hosting boundary",
  );

  const serialized = JSON.stringify({ contract, firebase });
  assert(
    !/postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|api[_-]?key|password|versions\/latest/iu.test(
      serialized,
    ),
    "Static hosting configuration contains a credential or database URL",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated-approved-not-applied",
    phase: contract.phase,
    projectId: boundary.projectId,
    projectNumber: boundary.projectNumber,
    siteId: hosting.siteId,
    defaultUrl: hosting.defaultUrl,
    canonicalDomain: domain.canonicalDomain,
    informationalOnly: true,
    emailCollectionAllowed: false,
    publicApiRouteCount: 0,
    databaseAccess: false,
    expectedIncrementalMonthlyCostUsd: 0,
    existingInfrastructureGuardedEstimateUsd:
      boundary.existingInfrastructureGuardedEstimateUsd,
    monthlyInfrastructureHardStopUsd:
      boundary.monthlyInfrastructureHardStopUsd,
    applyAuthorized: false,
    standingDnsAuthorization: false,
  });
}

export function validateStaticHostingEnvironment(
  environment = process.env,
  options = {},
  contract = readComingSoonStaticHosting(),
) {
  validateComingSoonStaticHosting(contract);
  const result = {
    projectId: required(environment, "SAMRA_GCP_PROJECT_ID"),
    projectNumber: required(environment, "SAMRA_GCP_PROJECT_NUMBER"),
    organizationId: required(environment, "SAMRA_GCP_ORGANIZATION_ID"),
    operator: required(environment, "SAMRA_GCP_OPERATOR_ACCOUNT"),
    expectedSha: required(environment, "SAMRA_GCP_EXPECTED_SHA"),
  };
  assert(
    result.projectId === contract.productionBoundary.projectId &&
      result.projectNumber === contract.productionBoundary.projectNumber &&
      result.organizationId === contract.productionBoundary.organizationId &&
      result.operator === contract.productionBoundary.operator &&
      /^[0-9a-f]{40}$/u.test(result.expectedSha),
    "The static hosting activation environment does not match the reviewed production boundary",
  );
  if (options.requireApplyAuthorization === true) {
    assert(
      required(environment, contract.release.activationEnvironment) ===
        contract.release.activationSentinel,
      "The exact static hosting activation sentinel is required",
    );
  }
  return Object.freeze(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateComingSoonStaticHosting())}\n`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
