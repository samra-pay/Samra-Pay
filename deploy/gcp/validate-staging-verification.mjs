import { readFileSync } from "node:fs";
import {
  STAGING_TRAFFIC_SERVICES,
  STAGING_VERIFICATION_CHECKS,
} from "./validate-staging-traffic-control.mjs";

const CONTRACT_STATUS = "evidence-plane-implemented-execution-not-authorized";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readStagingVerificationContract() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-verification.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateStagingVerificationContract(
  contract = readStagingVerificationContract(),
) {
  assert(
    contract.schemaVersion === 1 &&
      contract.status === CONTRACT_STATUS &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only" &&
      contract.sourceRepository === "haileleuld87/Samra-Pay",
    "Staging verification must remain synthetic and non-authorized",
  );
  assert(
    JSON.stringify(contract.deployableServices) ===
      JSON.stringify(STAGING_TRAFFIC_SERVICES) &&
      JSON.stringify(contract.requiredChecks) ===
        JSON.stringify(STAGING_VERIFICATION_CHECKS),
    "Staging verification service or check scope drifted",
  );
  assert(
    JSON.stringify(contract.inputEvidence) ===
      JSON.stringify({
        zeroTrafficDeploymentManifest:
          "artifacts/staging-release/staging-zero-traffic-deployment.json",
        zeroTrafficDeploymentManifestHash:
          "artifacts/staging-release/staging-zero-traffic-deployment.sha256",
        imageVerificationManifest:
          "artifacts/staging-release/staging-image-verification.json",
        imageVerificationManifestHash:
          "artifacts/staging-release/staging-image-verification.sha256",
        probeManifest:
          "artifacts/staging-release/staging-verification-probe.json",
        probeManifestHash:
          "artifacts/staging-release/staging-verification-probe.sha256",
      }) &&
      JSON.stringify(contract.outputEvidence) ===
        JSON.stringify({
          manifest: "artifacts/staging-release/staging-verification.json",
          manifestHash: "artifacts/staging-release/staging-verification.sha256",
          retentionDays: 365,
        }),
    "Staging verification evidence paths drifted",
  );
  assert(
    contract.qase.project === "SAMP" &&
      contract.qase.environment === "google-cloud-staging" &&
      contract.qase.completedPassingRunRequired === true &&
      contract.qase.exactRunUrlRequired === true,
    "Staging verification Qase authority drifted",
  );
  assert(
    JSON.stringify(contract.imageVerificationFoundation) ===
      JSON.stringify({
        status: "workflow-implemented-execution-not-authorized",
        contract: "deploy/gcp/staging-image-verification.json",
        validator: "deploy/gcp/validate-staging-image-verification.mjs",
        recorder: "deploy/gcp/record-staging-image-verification.mjs",
        imageRunnerImplemented: true,
        workflowImplemented: true,
        executionAuthorized: false,
        promotionEligible: false,
        excludedPromotionChecks: [
          "serviceAuthentication",
          "deployedRevisionNetworkPath",
        ],
      }),
    "Staging image-verification foundation drifted",
  );
  assert(
    contract.probeAuthority.workflowName === "Staging verification probe" &&
      contract.probeAuthority.workflowPath ===
        ".github/workflows/staging-verification-probe.yml" &&
      contract.probeAuthority.contract ===
        "deploy/gcp/staging-revision-probe.json" &&
      contract.probeAuthority.validator ===
        "deploy/gcp/validate-staging-revision-probe.mjs" &&
      contract.probeAuthority.recorder ===
        "deploy/gcp/record-staging-revision-probe.mjs" &&
      contract.probeAuthority.controller ===
        "deploy/gcp/run-staging-revision-probe.sh" &&
      contract.probeAuthority.federationActivation ===
        "deploy/gcp/activate-staging-revision-probe-federation.sh" &&
      contract.probeAuthority.federationAudit ===
        "deploy/gcp/audit-staging-revision-probe-federation.sh" &&
      contract.probeAuthority.protectedEnvironment === "staging-verification" &&
      contract.probeAuthority.allowedRef === "refs/heads/main" &&
      contract.probeAuthority.allowedEvent === "workflow_dispatch" &&
      contract.probeAuthority.exactCandidateRevisionRequired === true &&
      JSON.stringify(contract.probeAuthority.deployedRevisionChecks) ===
        JSON.stringify([
          "serviceAuthentication",
          "deployedRevisionNetworkPath",
        ]) &&
      contract.probeAuthority.implemented === true &&
      contract.probeAuthority.authorized === false,
    "Staging verification probe authority drifted",
  );
  assert(
    contract.recorder.path === "deploy/gcp/record-staging-verification.mjs" &&
      contract.recorder.requiresHashedInputs === true &&
      contract.recorder.requiresExactCandidateBinding === true &&
      contract.recorder.recordsSecrets === false &&
      contract.recorder.recordsCustomerData === false &&
      contract.recorder.implemented === true,
    "Staging verification recorder boundary drifted",
  );
  assert(
    contract.automaticTriggers === false &&
      contract.trafficMutationAuthorized === false &&
      contract.temporaryRoutingMutationAuthorized === false &&
      contract.publicAccessMutationAuthorized === false &&
      contract.runtimeMutationAuthorized === false &&
      contract.vendorActivationAuthorized === false &&
      contract.productionAuthorized === false,
    "Staging verification exceeded evidence-only authority",
  );
  for (const prohibited of [
    "manual pass status without hashed image and probe evidence",
    "verification of a different commit, service, or revision",
    "claiming every check traversed the deployed HTTP revision",
    "partial combined required-check evidence",
    "non-passing or incomplete Qase staging run",
    "traffic percentage mutation",
    "persistent revision tag or service URL",
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
      `Missing verification prohibition: ${prohibited}`,
    );
  }
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:/i.test(
      JSON.stringify(contract),
    ),
    "Staging verification contract contains a credential or endpoint",
  );
  return Object.freeze({
    schemaVersion: 1,
    status: "validated",
    environment: "staging",
    serviceCount: STAGING_TRAFFIC_SERVICES.length,
    checkCount: STAGING_VERIFICATION_CHECKS.length,
    recorderImplemented: true,
    imageRunnerImplemented: true,
    probeImplemented: true,
    executionAuthorized: false,
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateStagingVerificationContract())}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
