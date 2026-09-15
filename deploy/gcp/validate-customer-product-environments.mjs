import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EXACT_ENVIRONMENTS = Object.freeze({
  dev: Object.freeze({
    projectId: "samra-pay-dev",
    purpose: "bounded shared integration",
    dataClass: "synthetic-only",
    providerClass: "fake-only",
    apiAudience: "https://api.samrapay.com/development",
  }),
  test: Object.freeze({
    projectId: "samra-pay-test",
    purpose: "stable human acceptance",
    dataClass: "synthetic-only",
    providerClass: "fake-only",
    apiAudience: "https://api.samrapay.com/test",
  }),
  staging: Object.freeze({
    projectId: "samra-pay-staging",
    purpose: "production-like release and sandbox-provider rehearsal",
    dataClass: "synthetic-only",
    providerClass: "sandbox-only-after-separate-activation",
    apiAudience: "https://api.staging.samrapay.com",
  }),
  production: Object.freeze({
    projectId: "samra-pay-production",
    purpose: "separately approved invited-customer service",
    dataClass: "customer-data-after-release-approval",
    providerClass: "production-only-after-separate-provider-approval",
    apiAudience: "https://api.samrapay.com",
  }),
});

const EXACT_SEQUENCE = Object.freeze([
  "local",
  "dev-integration",
  "test-uat",
  "staging-rehearsal",
  "production-zero-traffic",
  "invited-identity-wallet-alpha",
  "limited-money-movement-pilot",
  "wider-production",
]);

const ENVIRONMENT_BY_RELEASE_STAGE = Object.freeze({
  local: "local",
  "dev-integration": "dev",
  "test-uat": "test",
  "staging-rehearsal": "staging",
  "production-zero-traffic": "production",
  "invited-identity-wallet-alpha": "production",
  "limited-money-movement-pilot": "production",
  "wider-production": "production",
});

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  );
}

export function readCustomerProductEnvironments() {
  return readJson("./customer-product-environments.json");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateCustomerProductEnvironments(
  contract = readCustomerProductEnvironments(),
  references = {},
) {
  const nativeEnvironments =
    references.nativeEnvironments ??
    readJson("../../artifacts/samra-pay-mobile/native-environments.json");
  const devTest =
    references.devTest ?? readJson("./dev-test-environments.json");
  const staging =
    references.staging ?? readJson("./staging-runtime-contract.json");
  const production =
    references.production ??
    readJson("./coming-soon-production-foundation.json");

  assert(contract.schemaVersion === 1, "Unsupported environment contract");
  assert(
    contract.status === "prepared-not-release-authorized",
    "Environment contract must not authorize a release",
  );
  assert(
    JSON.stringify(contract.environmentOrder) ===
      JSON.stringify(["local", "dev", "test", "staging", "production"]),
    "Environment order drifted",
  );
  assert(
    contract.publicSurface.marketingOrigin === "https://www.samrapay.com" &&
      contract.publicSurface.customerApplicationOrigin ===
        "https://app.samrapay.com" &&
      contract.publicSurface.productionApiAudience ===
        "https://api.samrapay.com" &&
      contract.publicSurface.marketingRemainsIndependent === true &&
      contract.publicSurface.marketingReplacementAuthorized === false,
    "Public marketing and customer product surfaces must remain separate",
  );

  assert(
    JSON.stringify(Object.keys(contract.cloudEnvironments)) ===
      JSON.stringify(Object.keys(EXACT_ENVIRONMENTS)),
    "Cloud environment set drifted",
  );
  const projectIds = [];
  for (const [name, exact] of Object.entries(EXACT_ENVIRONMENTS)) {
    const environment = contract.cloudEnvironments[name];
    const native = nativeEnvironments[name];
    assert(
      environment.projectId === exact.projectId &&
        environment.purpose === exact.purpose &&
        environment.dataClass === exact.dataClass &&
        environment.providerClass === exact.providerClass &&
        environment.apiAudience === exact.apiAudience,
      `${name} environment boundary drifted`,
    );
    assert(
      native?.applicationId === environment.mobileApplicationId &&
        native?.customScheme === environment.mobileCallbackScheme &&
        native?.apiAudience === environment.apiAudience,
      `${name} mobile identity drifted`,
    );
    if (name === "production") {
      assert(
        native.customerWebOrigin ===
          contract.publicSurface.customerApplicationOrigin,
        "Production mobile API origin drifted",
      );
    }
    projectIds.push(environment.projectId);
  }
  assert(
    new Set(projectIds).size === projectIds.length,
    "Every cloud environment requires a distinct Google Cloud project",
  );

  for (const name of ["dev", "test"]) {
    const environment = contract.cloudEnvironments[name];
    const runtime = devTest.environments[name];
    assert(
      runtime.projectId === environment.projectId &&
        runtime.data === "synthetic-only" &&
        runtime.api.runtimeEnvironment.AUTH0_AUDIENCE ===
          environment.apiAudience &&
        runtime.web.runtimeEnvironment.SAMRA_PUBLIC_ENVIRONMENT === name &&
        runtime.web.runtimeEnvironment.SAMRA_PUBLIC_AUTH0_AUDIENCE ===
          environment.apiAudience,
      `${name} deployed-runtime contract drifted`,
    );
  }

  const stagingApi = staging.services["samra-api"];
  assert(
    staging.environment === "staging" &&
      staging.dataClassification === "synthetic-only" &&
      staging.deploymentAuthorized === false &&
      stagingApi.environment.SAMRA_RELEASE_PROFILE === "alpha-release-1" &&
      stagingApi.environment.SAMRA_DEPLOYMENT_ENVIRONMENT === "staging" &&
      stagingApi.environment.GOOGLE_CLOUD_PROJECT === "samra-pay-staging" &&
      stagingApi.environment.SAMRA_RUN_WORKER === "false" &&
      stagingApi.environment.SAMRA_CUSTOMER_WALLET_PROVIDER_MODE === "fake",
    "Staging must remain synthetic, onboarding-only and unauthorized",
  );
  assert(
    production.productionBoundary.projectId === "samra-pay-production" &&
      production.productionBoundary.canonicalHost === "www" &&
      production.applyAuthorized === false,
    "Production foundation or marketing boundary drifted",
  );

  assert(
    JSON.stringify(contract.releaseSequence.map(({ id }) => id)) ===
      JSON.stringify(EXACT_SEQUENCE),
    "Release sequence drifted",
  );
  assert(
    contract.releaseSequence.every(
      ({ id, environment }) => ENVIRONMENT_BY_RELEASE_STAGE[id] === environment,
    ),
    "Release stage environment drifted",
  );
  const productionRelease = contract.productionCustomerRelease;
  assert(
    productionRelease.mobileCodeTargetPrepared === true &&
      productionRelease.customerDnsChangeAuthorized === false &&
      productionRelease.customerTrafficAuthorized === false &&
      productionRelease.liveIdentityProviderActivationAuthorized === false &&
      productionRelease.liveWalletProviderActivationAuthorized === false &&
      productionRelease.realMoneyAuthorized === false &&
      productionRelease.alphaInviteLimit === 100,
    "Production activation must remain explicitly unauthorized",
  );
  assert(
    JSON.stringify(productionRelease.alphaCapabilities) ===
      JSON.stringify(["login", "identity-verification", "wallet-creation"]) &&
      ["funding", "fx-execution", "transfers", "payouts", "cards"].every(
        (capability) =>
          productionRelease.alphaExcludedCapabilities.includes(capability),
      ),
    "Alpha capability boundary drifted",
  );

  const isolation = contract.isolationRules;
  assert(
    isolation.oneSourceCandidateAcrossPromotion === true &&
      Object.entries(isolation)
        .filter(([key]) => key !== "oneSourceCandidateAcrossPromotion")
        .every(([, value]) => value === false),
    "Environment isolation rules drifted",
  );
  assert(
    !/CLIENT_SECRET|API_KEY|PASSWORD|versions\/latest/i.test(
      JSON.stringify(contract),
    ),
    "Environment contract contains secret material or an unpinned reference",
  );

  return Object.freeze({
    schemaVersion: contract.schemaVersion,
    status: "validated",
    cloudEnvironmentCount: projectIds.length,
    releaseStageCount: EXACT_SEQUENCE.length,
    productionReleaseAuthorized: false,
    realMoneyAuthorized: false,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateCustomerProductEnvironments()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Customer product environments rejected: ${message}`);
    process.exitCode = 1;
  }
}
