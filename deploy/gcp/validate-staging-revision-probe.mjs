import { readFileSync } from "node:fs";

export const STAGING_REVISION_PROBE_CHECKS = Object.freeze([
  "serviceAuthentication",
  "deployedRevisionNetworkPath",
]);

const STATUS = "workflow-implemented-execution-not-authorized";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function readStagingRevisionProbeContract() {
  return JSON.parse(
    readFileSync(
      new URL("./staging-revision-probe.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateStagingRevisionProbeContract(
  contract = readStagingRevisionProbeContract(),
) {
  assert(
    contract.schemaVersion === 1 &&
      contract.status === STATUS &&
      contract.environment === "staging" &&
      contract.dataClassification === "synthetic-only" &&
      contract.sourceRepository === "haileleuld87/Samra-Pay" &&
      contract.service === "samra-api",
    "Staging revision-probe identity drifted",
  );
  assert(
    JSON.stringify(contract.probeRunner) ===
      JSON.stringify({
        source: "artifacts/api-server/src/staging-revision-probe.ts",
        bundle: "artifacts/api-server/dist/staging-revision-probe.mjs",
        containerCommand: ["node", "./dist/staging-revision-probe.mjs"],
        dedicatedRuntimeIdentity:
          "samra-revision-probe-staging@samra-pay-staging.iam.gserviceaccount.com",
        identityTokenAudience: "base service URL",
        recordsIdentityToken: false,
        implemented: true,
        executionAuthorized: false,
      }),
    "Staging revision-probe runner drifted",
  );
  assert(
    JSON.stringify(contract.workflow) ===
      JSON.stringify({
        name: "Staging verification probe",
        path: ".github/workflows/staging-verification-probe.yml",
        protectedEnvironment: "staging-verification",
        allowedRef: "refs/heads/main",
        allowedEvent: "workflow_dispatch",
        automaticTriggers: false,
        implemented: true,
        executionAuthorized: false,
      }),
    "Staging revision-probe workflow drifted",
  );
  assert(
    JSON.stringify(contract.googleCloud) ===
      JSON.stringify({
        projectId: "samra-pay-staging",
        projectNumber: "934122615631",
        region: "us-east4",
        workloadIdentityPoolId: "samra-revision-probe-staging",
        workloadIdentityProviderId: "samra-pay-revision-probe-main",
        controllerServiceAccount:
          "samra-github-probe-staging@samra-pay-staging.iam.gserviceaccount.com",
        runtimeServiceAccount:
          "samra-revision-probe-staging@samra-pay-staging.iam.gserviceaccount.com",
        network: "samra-staging-vpc",
        subnet: "samra-staging-us-east4",
        jobName: "samra-staging-revision-probe",
        logBucket: "_Default",
        logLocation: "global",
        logView: "samra-staging-revision-probe",
      }),
    "Staging revision-probe Google Cloud boundary drifted",
  );
  assert(
    JSON.stringify(contract.job) ===
      JSON.stringify({
        temporary: true,
        mustBeAbsentBeforeAndAfter: true,
        tasks: 1,
        parallelism: 1,
        maxRetries: 0,
        timeout: "5m",
        vpcEgress: "all-traffic",
        privateGoogleAccessRequired: true,
        secretAccess: false,
        resultFromRestrictedLogView: true,
      }),
    "Staging revision-probe job boundary drifted",
  );
  assert(
    JSON.stringify(contract.federation) ===
      JSON.stringify({
        activation: "deploy/gcp/activate-staging-revision-probe-federation.sh",
        audit: "deploy/gcp/audit-staging-revision-probe-federation.sh",
        isolatedPoolRequired: true,
        mainOnly: true,
        workflowDispatchOnly: true,
        protectedEnvironmentClaimRequired: true,
        storedGoogleCredential: false,
        runtimeProjectIam: false,
        runtimeSecretAccess: false,
        runtimeServiceInvokerOnly: "samra-api",
      }),
    "Staging revision-probe federation boundary drifted",
  );
  assert(
    JSON.stringify(contract.temporaryRouting) ===
      JSON.stringify({
        candidateTrafficPercentBefore: 0,
        candidateTrafficPercentDuring: 0,
        candidateTrafficPercentAfter: 0,
        exactRevisionTagRequired: true,
        defaultServiceUrlInitiallyDisabled: true,
        defaultServiceUrlTemporarilyEnabled: true,
        defaultServiceUrlFinallyDisabled: true,
        ingressMustRemain: "internal-and-cloud-load-balancing",
        publicIamMustRemainAbsent: true,
        runtimeTemplateMayChange: false,
        fullBoundaryRestorationRequired: true,
      }),
    "Staging revision-probe temporary-routing boundary drifted",
  );
  assert(
    JSON.stringify(contract.checks) ===
      JSON.stringify(STAGING_REVISION_PROBE_CHECKS),
    "Staging revision-probe checks drifted",
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
      }) &&
      JSON.stringify(contract.outputEvidence) ===
        JSON.stringify({
          junit: "artifacts/staging-release/staging-revision-probe.junit.xml",
          manifest: "artifacts/staging-release/staging-verification-probe.json",
          manifestHash:
            "artifacts/staging-release/staging-verification-probe.sha256",
          finalManifest: "artifacts/staging-release/staging-verification.json",
          finalManifestHash:
            "artifacts/staging-release/staging-verification.sha256",
          retentionDays: 365,
        }),
    "Staging revision-probe evidence paths drifted",
  );
  assert(
    JSON.stringify(contract.qase) ===
      JSON.stringify({
        project: "SAMP",
        environment: "google-cloud-staging",
        oneCombinedRunRequired: false,
        imageAndProbeJUnitRequired: true,
        reporting: "optional",
      }),
    "Staging revision-probe Qase boundary drifted",
  );
  assert(
    contract.promotionEligibleOnlyAfterCombinedEvidence === true &&
      contract.workflowImplemented === true &&
      contract.automaticTriggers === false &&
      contract.trafficPercentageMutationAuthorized === false &&
      contract.temporaryRevisionTagAuthorized === false &&
      contract.temporaryServiceUrlAuthorized === false &&
      contract.publicAccessMutationAuthorized === false &&
      contract.runtimeTemplateMutationAuthorized === false &&
      contract.vendorActivationAuthorized === false &&
      contract.productionAuthorized === false,
    "Staging revision probe exceeded dormant authority",
  );
  for (const prohibited of [
    "claiming exact-image database tests traversed the deployed HTTP revision",
    "traffic percentage mutation",
    "public IAM mutation",
    "ingress mutation",
    "runtime template mutation",
    "persistent revision tag",
    "persistent default service URL",
    "shared runtime identity",
    "identity token in evidence",
    "secret access",
    "vendor activation",
    "production resource",
    "real customer data",
    "Replit change",
  ]) {
    assert(
      contract.prohibited.includes(prohibited),
      `Missing revision-probe prohibition: ${prohibited}`,
    );
  }
  assert(
    !/postgres(?:ql)?:\/\/|worf\.replit|12345678|client_secret|api[_-]?key|private[_-]?key|authorization:|bearer\s+/i.test(
      JSON.stringify(contract),
    ),
    "Staging revision-probe contract contains a credential or endpoint",
  );
  return Object.freeze({
    schemaVersion: 1,
    status: "validated",
    environment: "staging",
    service: "samra-api",
    checkCount: STAGING_REVISION_PROBE_CHECKS.length,
    runnerImplemented: true,
    workflowImplemented: true,
    executionAuthorized: false,
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateStagingRevisionProbeContract())}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
