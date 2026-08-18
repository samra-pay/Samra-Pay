import { describe, expect, it } from "vitest";
import { validateReleaseCandidateContract } from "./validate-release-candidate";
import type { ReleaseEvidenceContract } from "./release-evidence";

const reports = Array.from({ length: 16 }, (_, index) => ({
  report: `governed-${index}.xml`,
}));
const requiredEvidenceFiles = [
  ...reports.map(({ report }) => `artifacts/api-server/test-results/${report}`),
  ...[
    "weekly-concurrency-soak.xml",
    "weekly-randomized-ledger.xml",
    "weekly-fault-injection.xml",
    "weekly-migration-compatibility.xml",
    "ledger-performance-characterization.xml",
    "ledger-performance-characterization.json",
  ].map((report) => `artifacts/api-server/test-results/${report}`),
  "artifacts/release-candidate/release-candidate-identity.json",
  "artifacts/release-candidate/release-gates.xml",
  "artifacts/release-candidate/qase-run.json",
];
const requiredGates = [
  "identity",
  "quality",
  "commercial",
  "migrations",
  "postgres_persistence",
  "postgres_http",
  "resilience",
  "performance",
  "qase_create",
  "qase_upload",
  "qase_complete",
].map((id) => ({ id, title: id, includeInQase: !id.startsWith("qase") }));
const contract: ReleaseEvidenceContract = {
  version: 1,
  workflow: ".github/workflows/release-candidate.yml",
  manifest: "artifacts/release-candidate/release-evidence-manifest.json",
  manifestHash: "artifacts/release-candidate/release-evidence-manifest.sha256",
  retentionDays: 365,
  qaseEnvironment: "github-ci-postgres",
  requiredGates,
  requiredEvidenceFiles,
  boundaries: ["synthetic only"],
};
const workflow = [
  "on:",
  "  workflow_dispatch:",
  "    inputs:",
  "      candidate_sha:",
  "        required: true",
  "cancel-in-progress: false",
  "timeout-minutes: 90",
  "image: postgres:16",
  "persist-credentials: false",
  "fetch-depth: 0",
  "ref: ${{ inputs.candidate_sha }}",
  "git show-ref --verify refs/remotes/origin/main",
  "release-evidence -- identity",
  "release-evidence -- gate-junit",
  "release-evidence -- manifest",
  "release-evidence -- verify --require-passing",
  "uses: actions/upload-artifact@v4",
  "retention-days: 365",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  ...requiredGates.map(({ id }) => `id: ${id}`),
  ...requiredEvidenceFiles,
  "name: Preserve immutable release evidence",
  "name: Enforce release stop conditions",
].join("\n");

describe("validateReleaseCandidateContract", () => {
  it("accepts an exact-SHA, fail-closed, retained evidence workflow", () => {
    expect(() =>
      validateReleaseCandidateContract(contract, workflow, {
        automatedReports: reports,
      }),
    ).not.toThrow();
  });

  it("rejects a floating candidate checkout", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace("ref: ${{ inputs.candidate_sha }}", "ref: main"),
        { automatedReports: reports },
      ),
    ).toThrow(/ref:/);
  });

  it("rejects evidence enforcement before artifact preservation", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace(
          "name: Preserve immutable release evidence\nname: Enforce release stop conditions",
          "name: Enforce release stop conditions\nname: Preserve immutable release evidence",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/preserved before stop conditions/);
  });
});
