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
  "      postgres-persistence:",
  "      postgres-http:",
  "      postgres-resilience:",
  "      postgres-performance:",
  "image: postgres:16",
  "persist-credentials: false",
  "fetch-depth: 0",
  "ref: ${{ inputs.candidate_sha }}",
  "git show-ref --verify refs/remotes/origin/main",
  "release-evidence -- identity",
  "release-evidence -- gate-junit",
  "pnpm run test:experience-budgets",
  "id: qase_payload",
  "if: steps.qase_payload.outcome == 'success' && !cancelled()",
  "release-evidence -- manifest",
  "release-evidence -- verify --require-passing",
  "uses: actions/upload-artifact@v4",
  "retention-days: 365",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  ...requiredGates.map(({ id }) => `id: ${id}`),
  ...requiredEvidenceFiles,
  "      - name: Apply migrations and prove repeatable seed",
  "        env:",
  "          TEST_DATABASE_URL: postgresql://p:p@127.0.0.1:5432/p",
  "        run: |",
  "          pnpm --filter @workspace/db run test:migrate",
  "          pnpm --filter @workspace/db run test:seed",
  "          pnpm --filter @workspace/db run test:seed",
  "      - name: Run PostgreSQL persistence and ledger release suite",
  "        env:",
  "          TEST_DATABASE_URL: postgresql://p:p@127.0.0.1:5432/p",
  "        run: pnpm --filter @workspace/api-server run test:postgres:junit",
  "      - name: Run HTTP, daily journey, and process-restart release suite",
  "        env:",
  "          TEST_DATABASE_URL: postgresql://h:h@127.0.0.1:5433/h",
  "        run: |",
  "          pnpm --filter @workspace/db run test:migrate",
  "          pnpm --filter @workspace/db run test:seed",
  "          pnpm --filter @workspace/api-server run build",
  "      - name: Run weekly backend resilience release suite",
  "        env:",
  "          TEST_DATABASE_URL: postgresql://r:r@127.0.0.1:5434/r",
  "        run: |",
  "          pnpm --filter @workspace/db run test:migrate",
  "          pnpm --filter @workspace/db run test:seed",
  "          pnpm --filter @workspace/api-server run test:weekly-concurrency:junit",
  "      - name: Run million-posting materialized balance gate",
  "        env:",
  "          TEST_DATABASE_URL: postgresql://f:f@127.0.0.1:5435/f",
  "        run: |",
  "          pnpm --filter @workspace/db run test:migrate",
  "          pnpm --filter @workspace/db run test:seed",
  "          pnpm --filter @workspace/api-server run test:ledger-performance:junit",
  "name: Complete Qase release-candidate run",
  "if: steps.qase_create.outputs.id != '' && !cancelled()",
  "name: Record Qase release identity",
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

  it("rejects orphaned Qase runs when result upload fails", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace(
          "if: steps.qase_create.outputs.id != '' && !cancelled()\nname: Record Qase release identity",
          "if: steps.qase_upload.outcome == 'success' && !cancelled()\nname: Record Qase release identity",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/close every created Qase run/);
  });

  it("rejects a database shared across release suites", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace(
          "postgresql://h:h@127.0.0.1:5433/h",
          "postgresql://p:p@127.0.0.1:5432/p",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/must use isolated database URLs/);
  });

  it("rejects an isolated suite that runs before its database is prepared", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace(
          "          pnpm --filter @workspace/db run test:seed\n          pnpm --filter @workspace/api-server run build",
          "          pnpm --filter @workspace/api-server run build",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/migrated and seeded before its suite/);
  });

  it("rejects a release workflow that omits experience budgets", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace("pnpm run test:experience-budgets", ""),
        { automatedReports: reports },
      ),
    ).toThrow(/test:experience-budgets/);
  });
});
