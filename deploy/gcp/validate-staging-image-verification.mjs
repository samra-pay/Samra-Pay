import { readFileSync } from "node:fs";

export const STAGING_IMAGE_VERIFICATION_CHECKS = Object.freeze([
  "readiness",
  "restart",
  "ledger",
  "reconciliation",
  "audit",
  "failureVisibility",
]);

export const STAGING_IMAGE_VERIFICATION_EXCLUSIONS = Object.freeze([
  "serviceAuthentication",
  "deployedRevisionNetworkPath",
]);

const STATUS = "runner-implemented-execution-not-authorized";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readStagingImageVerificationContract() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-image-verification.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateStagingImageVerificationContract(
  contract = readStagingImageVerificationContract(),
) {
  assert(
    contract.schemaVersion === 1 &&
      contract.status === STATUS &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only" &&
      contract.sourceRepository === "haileleuld87/Samra-Pay" &&
      contract.service === "samra-api",
    "Staging image verification identity drifted",
  );
  assert(
    JSON.stringify(contract.imageRunner) ===
      JSON.stringify({
        source: "artifacts/api-server/test/daily-synthetic-journeys.test.ts",
        bundle: "artifacts/api-server/dist/staging-verification.mjs",
        containerCommand: [
          "node",
          "--test",
          "--test-reporter=junit",
          "./dist/staging-verification.mjs",
        ],
        testCount: 9,
        uniqueSyntheticRunIdRequired: true,
        pinnedDatabaseSecretVersionRequired: true,
        dedicatedRuntimeIdentity:
          "samra-verifier-staging@samra-pay-staging.iam.gserviceaccount.com",
        implemented: true,
        executionAuthorized: false,
      }),
    "Staging image runner boundary drifted",
  );
  assert(
    JSON.stringify(contract.inputEvidence) ===
      JSON.stringify({
        zeroTrafficDeploymentManifest:
          "artifacts/staging-release/staging-zero-traffic-deployment.json",
        zeroTrafficDeploymentManifestHash:
          "artifacts/staging-release/staging-zero-traffic-deployment.sha256",
      }) &&
      JSON.stringify(contract.outputEvidence) ===
        JSON.stringify({
          manifest: "artifacts/staging-release/staging-image-verification.json",
          manifestHash:
            "artifacts/staging-release/staging-image-verification.sha256",
          retentionDays: 365,
        }),
    "Staging image verification evidence paths drifted",
  );
  assert(
    JSON.stringify(contract.imageChecks) ===
      JSON.stringify(STAGING_IMAGE_VERIFICATION_CHECKS) &&
      JSON.stringify(contract.excludedPromotionChecks) ===
        JSON.stringify(STAGING_IMAGE_VERIFICATION_EXCLUSIONS),
    "Staging image verification check boundary drifted",
  );
  assert(
    JSON.stringify(contract.revisionAttestation) ===
      JSON.stringify({
        readyRequired: true,
        exactImageDigestRequired: true,
        privateIngressRequired: true,
        defaultServiceUrlDisabledRequired: true,
        publicIamAbsentRequired: true,
      }),
    "Staging image revision attestation drifted",
  );
  assert(
    contract.promotionEligible === false &&
      contract.workflowImplemented === false &&
      contract.automaticTriggers === false &&
      contract.trafficMutationAuthorized === false &&
      contract.publicAccessMutationAuthorized === false &&
      contract.runtimeMutationAuthorized === false &&
      contract.vendorActivationAuthorized === false &&
      contract.productionAuthorized === false,
    "Staging image verification exceeded non-promotable authority",
  );
  for (const prohibited of [
    "claiming image execution proves the deployed revision network path",
    "claiming image execution proves service authentication",
    "promotion eligibility from partial verification evidence",
    "floating image tag",
    "latest secret version",
    "shared runtime identity",
    "traffic mutation",
    "public IAM mutation",
    "runtime configuration mutation",
    "vendor activation",
    "production resource",
    "real customer data",
    "secret value in evidence",
    "Replit change",
  ]) {
    assert(
      contract.prohibited.includes(prohibited),
      `Missing image-verification prohibition: ${prohibited}`,
    );
  }
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+/i.test(
      JSON.stringify(contract),
    ),
    "Staging image verification contract contains a credential or endpoint",
  );
  return Object.freeze({
    schemaVersion: 1,
    status: "validated",
    environment: "staging",
    service: "samra-api",
    testCount: 9,
    imageCheckCount: STAGING_IMAGE_VERIFICATION_CHECKS.length,
    runnerImplemented: true,
    workflowImplemented: false,
    executionAuthorized: false,
    promotionEligible: false,
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateStagingImageVerificationContract())}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
