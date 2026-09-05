import { RELEASE_RECOVERY_EVIDENCE } from "./verify-release-candidate-evidence.mjs";

const IMAGE_NAMES = Object.freeze([
  "samra-api",
  "samra-customer-web",
  "samra-operations-web",
  "samra-design-system-preview",
  "samra-migrations",
]);

export function imageSecurityGate(imageDigests) {
  return {
    status: "passed",
    scope: "exact-published-digests",
    scanner: {
      name: "Trivy",
      version: "0.70.0",
      setupAction:
        "aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514",
    },
    policies: {
      vulnerabilities: {
        scanner: "vuln",
        severities: ["CRITICAL"],
        ignoreUnfixed: true,
      },
      secrets: {
        scanner: "secret",
        severities: ["HIGH", "CRITICAL"],
        ignoreUnfixed: false,
      },
    },
    images: Object.fromEntries(
      IMAGE_NAMES.map((name, index) => [
        name,
        {
          imageDigest: imageDigests[name],
          vulnerabilities: {
            status: "passed",
            artifactName: imageDigests[name],
            reportPath: `artifacts/staging-release/security/${name}-vulnerabilities.json`,
            reportSha256: String(index + 1).repeat(64),
          },
          secrets: {
            status: "passed",
            artifactName: imageDigests[name],
            reportPath: `artifacts/staging-release/security/${name}-secrets.json`,
            reportSha256: ["6", "7", "8", "9", "a"][index].repeat(64),
          },
        },
      ]),
    ),
  };
}

export function releaseCandidateLineage(candidateSha, gitTreeSha) {
  const runId = "32600000001";
  const runAttempt = 1;
  return {
    releaseId: `rc-${candidateSha.slice(0, 12)}`,
    candidateSha,
    gitTreeSha,
    repository: "samra-pay/Samra-Pay",
    workflow: ".github/workflows/release-candidate.yml",
    workflowName: "Immutable release candidate",
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
    workflowRunUrl: `https://github.com/samra-pay/Samra-Pay/actions/runs/${runId}`,
    artifactName: `samra-rc-${candidateSha.slice(0, 12)}-run-${runId}-attempt-${runAttempt}`,
    evidenceManifestPath:
      "artifacts/release-candidate/release-evidence-manifest.json",
    evidenceManifestSha256: "8".repeat(64),
    overallStatus: "passed",
    requiredGatesPassed: true,
    recoveryEvidence: RELEASE_RECOVERY_EVIDENCE.map((path, index) => ({
      path,
      sha256: String(index + 6).repeat(64),
    })),
  };
}
