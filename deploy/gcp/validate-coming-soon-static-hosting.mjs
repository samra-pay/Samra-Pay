import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
} from "./validate-coming-soon-launch.mjs";

const HTML_CACHE_CONTROL = "no-cache,no-store,must-revalidate";
const IMMUTABLE_CACHE_CONTROL = "public,max-age=31536000,immutable";
const ROUTED_HTML_REGEX = "^/[^.]*$";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function required(environment, name) {
  const value = String(environment[name] ?? "").trim();
  assert(value.length > 0, `${name} is required`);
  return value;
}

function singleRule(rules, predicate) {
  const matches = rules.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
}

function hasExactHeaders(rule, expected) {
  if (!rule || rule.headers?.length !== Object.keys(expected).length)
    return false;
  return Object.entries(expected).every(
    ([key, value]) =>
      rule.headers.filter(
        (header) => header.key === key && header.value === value,
      ).length === 1,
  );
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

export function readPublicAnalyticsConfig() {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../artifacts/samra-pay/src/content/public-analytics.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

export function validateComingSoonStaticHosting(
  contract = readComingSoonStaticHosting(),
  launch = readComingSoonLaunch(),
  firebase = readFirebaseHostingConfig(),
  analytics = readPublicAnalyticsConfig(),
) {
  const validatedLaunch = validateComingSoonLaunch(launch);
  const override = launch.staticInformationalOverride;
  assert(
    validatedLaunch.deploymentAuthorized === false &&
      override.decisionStatus === "superseded-by-controlled-waitlist-pr" &&
      override.approvedOn === "2026-09-04" &&
      override.linkedContract ===
        "deploy/gcp/coming-soon-static-hosting.json" &&
      override.hostingProvider === "firebase-hosting" &&
      override.publicInformationOnly === true &&
      override.emailCollection === true &&
      override.apiDeployment === true &&
      override.databaseUse === false &&
      override.vendorActivation === "resend-contacts-only" &&
      override.automaticEmailSending === false &&
      override.deploymentAuthorized === false &&
      override.supersedesInteractiveLaunch === false,
    "The lean waitlist override drifted or authorized deployment",
  );

  assert(
    contract.schemaVersion === 2 &&
      contract.status === "approved-for-pr-not-applied" &&
      contract.phase === "controlled-public-email-waitlist" &&
      contract.decision.approvedOn === "2026-09-04" &&
      contract.decision.approvedBy === "David Haile" &&
      contract.decision.scope ===
        "public website email waitlist backed only by Resend Contacts" &&
      contract.decision.standingApplyAuthorization === false &&
      contract.priorStaticRelease.sourceSha ===
        "32c550321802c4747fa53871fb7b51c7977e9959" &&
      contract.priorStaticRelease.status === "applied-and-live-verified" &&
      contract.priorStaticRelease.emailCollection === false,
    "The approved waitlist decision or prior release record drifted",
  );

  const amendment = contract.waitlistAmendment;
  assert(
    amendment.status === "approved-for-pr-not-deployment" &&
      amendment.purpose === "product and availability updates before launch" &&
      amendment.emailOnly === true &&
      amendment.consentVersion === "public-waitlist-2026-09-04" &&
      amendment.provider === "resend-contacts" &&
      amendment.segmentName === "Samra Pay Pre-Launch Waitlist" &&
      amendment.topicName === "Product and launch updates" &&
      amendment.topicDefaultSubscription === "opt_out" &&
      amendment.topicVisibility === "public" &&
      amendment.segmentAndTopicIdsCommitted === false &&
      amendment.automaticEmailSending === false &&
      amendment.releaseApprovalRequired === true,
    "The email-only waitlist amendment drifted",
  );

  const source = contract.source;
  assert(
    source.repository === "haileleuld87/Samra-Pay" &&
      source.releaseSource === "FULL_GIT_SHA" &&
      source.buildCommand === "pnpm --filter @workspace/samra-pay run build" &&
      source.buildDirectory === "artifacts/samra-pay/dist/public" &&
      source.hostingConfig === "firebase.json" &&
      source.serviceContext === "lib/launch-updates" &&
      source.serviceDockerfile === "lib/launch-updates/Dockerfile.waitlist" &&
      source.serviceBuildConfig ===
        "lib/launch-updates/cloudbuild.waitlist.yaml",
    "The reviewed release source boundary drifted",
  );

  const boundary = contract.productionBoundary;
  assert(
    boundary.projectId === "samra-pay-production" &&
      boundary.projectNumber === "382465561715" &&
      boundary.organizationId === "614833350075" &&
      boundary.operator === "me@davidhaile.com" &&
      boundary.region === "us-east4" &&
      boundary.dataClassification === "email-marketing-contact" &&
      boundary.existingInfrastructureGuardedEstimateUsd === 81.92 &&
      boundary.monthlyInfrastructureHardStopUsd === 100,
    "The production identity, data classification, or cost guard drifted",
  );

  const hosting = contract.hosting;
  const service = contract.waitlistService;
  assert(
    hosting.provider === "firebase-hosting" &&
      hosting.siteId === "samra-pay-production" &&
      hosting.defaultUrl === "https://samra-pay-production.web.app" &&
      hosting.canonicalDomain === "www.samrapay.com" &&
      hosting.apiRewrite === "/api/v1/waitlist/subscriptions" &&
      hosting.serviceId === "samra-launch-updates" &&
      hosting.region === "us-east4" &&
      hosting.pinTag === true &&
      service.platform === "cloud-run" &&
      service.serviceId === hosting.serviceId &&
      service.runtimeServiceAccount ===
        "samra-launch-updates@samra-pay-production.iam.gserviceaccount.com" &&
      service.imageRepository ===
        "us-east4-docker.pkg.dev/samra-pay-production/samra-production/samra-launch-updates" &&
      service.imageDigestRequiredForReview === true &&
      service.ingress === "all" &&
      service.unauthenticated === true &&
      service.minInstances === 0 &&
      service.maxInstances === 1 &&
      service.concurrency === 2 &&
      service.timeoutSeconds === 10 &&
      service.cpu === "1" &&
      service.memory === "256Mi" &&
      service.secretId === "samra-production-resend-api-key" &&
      service.secretVersion === "1" &&
      service.secretEnvironmentName === "RESEND_API_KEY" &&
      service.segmentIdEnvironmentName === "SAMRA_RESEND_SEGMENT_ID" &&
      service.topicIdEnvironmentName === "SAMRA_RESEND_TOPIC_ID" &&
      JSON.stringify(service.allowedOrigins) ===
        JSON.stringify([
          "https://www.samrapay.com",
          "https://samra-pay-production.web.app",
        ]) &&
      JSON.stringify(service.publicRoutes) ===
        JSON.stringify([
          "POST /api/v1/waitlist/subscriptions",
          "GET /healthz",
        ]) &&
      service.databaseAccess === false &&
      service.vpcAccess === false &&
      service.rawEmailLogsAllowed === false &&
      service.resubscribeUnsubscribedContact === false &&
      service.providerMinimumIntervalMs === 550 &&
      JSON.stringify(service.providerOperations) ===
        JSON.stringify([
          "get contact by email",
          "create contact",
          "add subscribed contact to segment",
          "opt subscribed contact into topic",
        ]),
    "The bounded Cloud Run waitlist service drifted",
  );

  const publicBoundary = contract.publicBoundary;
  assert(
    publicBoundary.formsAllowed === true &&
      publicBoundary.formsPurpose === "controlled-pre-launch-email-waitlist" &&
      publicBoundary.emailCollectionAllowed === true &&
      JSON.stringify(publicBoundary.apiRoutes) ===
        JSON.stringify(["POST /api/v1/waitlist/subscriptions"]) &&
      JSON.stringify(publicBoundary.collectedFields) ===
        JSON.stringify(["email"]) &&
      publicBoundary.databaseAccess === false &&
      publicBoundary.customerAuthentication === false &&
      publicBoundary.kyc === false &&
      publicBoundary.wallet === false &&
      publicBoundary.moneyMovement === false &&
      publicBoundary.financialVendorActivation === false &&
      publicBoundary.emailProviderActivation === "resend-contacts-only" &&
      publicBoundary.automaticCampaignSending === false,
    "The public surface expanded beyond an email-only waitlist",
  );

  const analyticsContract = contract.analyticsAmendment;
  assert(
    analyticsContract.scope ===
      "consent-gated public website GA4; no advertising" &&
      analyticsContract.configuration ===
        "artifacts/samra-pay/src/content/public-analytics.json" &&
      analyticsContract.basicConsentMode === true &&
      analyticsContract.productionCanonicalOriginOnly === true &&
      analyticsContract.advertisingFeatures === false &&
      analyticsContract.enhancedMeasurement === false &&
      analyticsContract.eventRetentionMonths === 2 &&
      analytics.measurementId === "G-T4THKMM4Y5" &&
      analytics.origin === "https://www.samrapay.com" &&
      analytics.consentDays === 180 &&
      analytics.cookieDays === 60 &&
      analytics.cookiePrefix === "samra_public",
    "The independent consent-gated analytics boundary drifted",
  );

  const rewrites = firebase.hosting.rewrites;
  assert(
    firebase.hosting.public === source.buildDirectory &&
      firebase.hosting.trailingSlash === false &&
      rewrites.length === 2 &&
      rewrites[0].source === hosting.apiRewrite &&
      rewrites[0].run?.serviceId === hosting.serviceId &&
      rewrites[0].run?.region === hosting.region &&
      rewrites[0].run?.pinTag === true &&
      rewrites[1].source === "**" &&
      rewrites[1].destination === "/index.html",
    "firebase.json does not route only the reviewed waitlist endpoint",
  );

  const headerRules = firebase.hosting.headers;
  const globalSecurityRule = singleRule(
    headerRules,
    (rule) => rule.source === "**",
  );
  const exactCacheRule = (sourceName, value) =>
    hasExactHeaders(
      singleRule(headerRules, (rule) => rule.source === sourceName),
      { "Cache-Control": value },
    );
  assert(
    headerRules.length === 6 &&
      exactCacheRule("/assets/**", IMMUTABLE_CACHE_CONTROL) &&
      exactCacheRule("/icons/**", IMMUTABLE_CACHE_CONTROL) &&
      exactCacheRule("/og-preview-*.png", IMMUTABLE_CACHE_CONTROL) &&
      exactCacheRule("/index.html", HTML_CACHE_CONTROL) &&
      hasExactHeaders(
        singleRule(headerRules, (rule) => rule.regex === ROUTED_HTML_REGEX),
        { "Cache-Control": HTML_CACHE_CONTROL },
      ) &&
      hasExactHeaders(globalSecurityRule, {
        "Content-Security-Policy": contract.security.contentSecurityPolicy,
        "Referrer-Policy": contract.security.referrerPolicy,
        "X-Content-Type-Options": contract.security.xContentTypeOptions,
        "X-Frame-Options": contract.security.xFrameOptions,
        "Permissions-Policy": contract.security.permissionsPolicy,
        "Strict-Transport-Security": contract.security.hsts,
      }) &&
      contract.security.contentSecurityPolicy.includes("connect-src 'self'") &&
      !contract.security.contentSecurityPolicy.includes("unsafe-"),
    "firebase.json does not enforce the reviewed cache and security boundary",
  );

  assert(
    contract.cost.currency === "USD" &&
      contract.cost.expectedIncrementalMonthlyCostUsd === 0 &&
      contract.cost.usageDependent === true &&
      contract.cost.spendingCap === false &&
      contract.cost.hardStopRequiresReassessmentAtTotalMonthlyEstimateUsd ===
        100 &&
      contract.domain.dnsOwner === "Squarespace" &&
      contract.domain.canonicalDomain === "www.samrapay.com" &&
      contract.domain.preserveDnsRecordTypes.includes("MX") &&
      contract.domain.preserveDnsRecordTypes.includes("DMARC") &&
      contract.domain.preserveUnrelatedRecords === true &&
      contract.domain.dnsChangeAuthorized === false,
    "The cost or DNS preservation boundary drifted",
  );

  assert(
    contract.release.activationEnvironment ===
      "SAMRA_GCP_PUBLIC_WAITLIST_APPLY" &&
      contract.release.activationSentinel ===
        "AUTHORIZED_PUBLIC_WAITLIST_RELEASE" &&
      contract.release.exactShaRequired === true &&
      contract.release.cleanWorkingTreeRequired === true &&
      contract.release.reviewBeforeApply === true &&
      contract.release.segmentAndTopicIdsRequiredAtRuntime === true &&
      contract.release.postAuditRequired === true &&
      contract.release.recordPriorReleaseRequired === true &&
      contract.excluded.includes("Samra database storage") &&
      contract.excluded.includes("automatic welcome email") &&
      contract.excluded.includes("financial APIs") &&
      contract.excluded.includes("Squarespace DNS changes"),
    "The release gate or exclusions drifted",
  );

  const serialized = JSON.stringify({ contract, firebase });
  assert(
    !/\bre_[A-Za-z0-9_-]{10,}\b|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|postgres(?:ql)?:\/\//iu.test(
      serialized,
    ),
    "Waitlist configuration contains credential material or a database URL",
  );

  return Object.freeze({
    schemaVersion: 2,
    status: "validated-approved-for-pr-not-applied",
    phase: contract.phase,
    projectId: boundary.projectId,
    projectNumber: boundary.projectNumber,
    siteId: hosting.siteId,
    serviceId: service.serviceId,
    canonicalDomain: hosting.canonicalDomain,
    emailCollectionAllowed: true,
    publicApiRouteCount: 1,
    databaseAccess: false,
    automaticEmailSending: false,
    analytics: "consent-gated-ga4",
    expectedIncrementalMonthlyCostUsd: 0,
    existingInfrastructureGuardedEstimateUsd:
      boundary.existingInfrastructureGuardedEstimateUsd,
    monthlyInfrastructureHardStopUsd: boundary.monthlyInfrastructureHardStopUsd,
    applyAuthorized: false,
    dnsChangeAuthorized: false,
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
    segmentId: required(environment, "SAMRA_RESEND_SEGMENT_ID"),
    topicId: required(environment, "SAMRA_RESEND_TOPIC_ID"),
  };
  assert(
    result.projectId === contract.productionBoundary.projectId &&
      result.projectNumber === contract.productionBoundary.projectNumber &&
      result.organizationId === contract.productionBoundary.organizationId &&
      result.operator === contract.productionBoundary.operator &&
      /^[0-9a-f]{40}$/u.test(result.expectedSha) &&
      UUID.test(result.segmentId) &&
      UUID.test(result.topicId) &&
      result.segmentId !== result.topicId,
    "The production identity, SHA, segment, or topic input is invalid",
  );
  if (options.requireApplyAuthorization === true) {
    assert(
      environment.SAMRA_GCP_PUBLIC_WAITLIST_APPLY ===
        contract.release.activationSentinel,
      "Public waitlist deployment is not authorized",
    );
  } else {
    assert(
      !environment.SAMRA_GCP_PUBLIC_WAITLIST_APPLY,
      "Apply authorization is not accepted during review",
    );
  }
  return Object.freeze(result);
}

function run() {
  process.stdout.write(
    `${JSON.stringify(validateComingSoonStaticHosting())}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
