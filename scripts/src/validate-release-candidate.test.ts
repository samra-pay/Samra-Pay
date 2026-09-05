import { describe, expect, it } from "vitest";
import { validateReleaseCandidateContract } from "./validate-release-candidate";
import type { ReleaseEvidenceContract } from "./release-evidence";

const reports = Array.from({ length: 16 }, (_, index) => ({
  report: `governed-${index}.xml`,
}));
const runtimeImageEvidence = [
  "api",
  "customer-web",
  "operations-web",
  "design-system",
  "migrations",
].flatMap((id) =>
  ["identity", "vulnerabilities", "secrets"].map(
    (kind) =>
      `artifacts/release-candidate/security/runtime-images/${id}-${kind}.json`,
  ),
);
const requiredEvidenceFiles = [
  ...reports.map(({ report }) => `artifacts/api-server/test-results/${report}`),
  ...[
    "weekly-concurrency-soak.xml",
    "weekly-randomized-ledger.xml",
    "weekly-fault-injection.xml",
    "weekly-migration-compatibility.xml",
    "weekly-backup-restore.xml",
    "weekly-backup-restore.json",
    "ledger-performance-characterization.xml",
    "ledger-performance-characterization.json",
  ].map((report) => `artifacts/api-server/test-results/${report}`),
  "artifacts/release-candidate/release-candidate-identity.json",
  "artifacts/release-candidate/release-gates.xml",
  "artifacts/release-candidate/qase-run.json",
  "artifacts/release-candidate/security/semgrep.json",
  "artifacts/release-candidate/security/trivy-vulnerabilities.json",
  "artifacts/release-candidate/security/trivy-secrets-misconfiguration.json",
  "artifacts/release-candidate/security/trivy-license-policy.json",
  "artifacts/release-candidate/security/sbom.cdx.json",
  ...runtimeImageEvidence,
];
const requiredGates = [
  "identity",
  "security",
  "quality",
  "commercial",
  "migrations",
  "postgres_persistence",
  "postgres_http",
  "resilience",
  "recovery",
  "performance",
].map((id) => ({ id, title: id, includeInQase: !id.startsWith("qase") }));
const contract: ReleaseEvidenceContract = {
  version: 2,
  qaseReporting: "optional",
  workflow: ".github/workflows/release-candidate.yml",
  manifest: "artifacts/release-candidate/release-evidence-manifest.json",
  manifestHash: "artifacts/release-candidate/release-evidence-manifest.sha256",
  retentionDays: 365,
  qaseEnvironment: "github-ci-postgres",
  requiredGates,
  requiredEvidenceFiles,
  boundaries: ["synthetic only"],
};
const qaseGatePayload = requiredGates
  .filter(({ includeInQase }) => includeInQase)
  .map(({ id }) => `"${id}":"\${{ steps.${id}.outcome }}"`)
  .join(",");
const manifestGatePayload = requiredGates
  .map(({ id }) => `"${id}":"\${{ steps.${id}.outcome }}"`)
  .join(",");
const workflow = [
  "on:",
  "  workflow_dispatch:",
  "    inputs:",
  "      candidate_sha:",
  "        required: true",
  "      report_to_qase:",
  "        type: boolean",
  "        default: false",
  "        required: false",
  "cancel-in-progress: false",
  "  runtime-image-security:",
  "    name: Release runtime image security (${{ matrix.id }})",
  "      fail-fast: false",
  "Build exact-SHA runtime image from pinned inputs",
  "docker image inspect",
  "Gate fixed critical runtime vulnerabilities",
  "Gate high and critical runtime secrets",
  "severity: HIGH,CRITICAL",
  "timeout-minutes: 120",
  "      postgres-persistence:",
  "      postgres-http:",
  "      postgres-resilience:",
  "      postgres-performance:",
  "      postgres-recovery:",
  "image: postgres:16",
  "persist-credentials: false",
  "fetch-depth: 0",
  "ref: ${{ inputs.candidate_sha }}",
  "git show-ref --verify refs/remotes/origin/main",
  "release-evidence -- identity",
  "pnpm run test:action-pins",
  "pnpm run test:repository-controls",
  "pnpm run test:migration-policy",
  "semgrep/semgrep@sha256:65dcd4408adda7c183a6b4550cb1e9b19f7f627a6fbb7e0559bd466bedc44d7b",
  "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
  "pnpm run test:experience-budgets",
  "      - name: Download exact-SHA runtime image security evidence",
  "        uses: actions/download-artifact@0123456789abcdef0123456789abcdef01234567 # v8",
  "        with:",
  "          pattern: release-runtime-security-*-${{ inputs.candidate_sha }}",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  ...requiredGates.map(({ id }) => `id: ${id}`),
  "      - name: Aggregate exact-SHA security gate",
  "        env:",
  "          RUNTIME_IMAGES_RESULT: ${{ needs.runtime-image-security.result }}",
  "        run: |",
  '          test "${RUNTIME_IMAGES_RESULT}" = success',
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
  "      - name: Run synthetic logical backup and restore release rehearsal",
  "        env:",
  "          TEST_DATABASE_URL: postgresql://b:b@127.0.0.1:5436/b",
  "          SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION: I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES",
  "          SAMRA_RECOVERY_CANDIDATE_SHA: ${{ inputs.candidate_sha }}",
  "          SAMRA_POSTGRES_CLIENT_IMAGE: postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94",
  "          WEEKLY_BACKUP_RESTORE_RESULTS_PATH: test-results/weekly-backup-restore.json",
  "        run: |",
  "          pnpm --filter @workspace/db run test:migrate",
  "          pnpm --filter @workspace/db run test:seed",
  "          pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit",
  "      - name: Build stable Qase release gate payload",
  "        id: qase_payload",
  "        env:",
  `          RELEASE_GATE_RESULTS: {${qaseGatePayload}}`,
  "        run: release-evidence -- gate-junit",
  "      - name: Create Qase release-candidate run",
  "        id: qase_create",
  "        continue-on-error: true",
  "        if: inputs.report_to_qase && steps.qase_payload.outcome == 'success' && !cancelled()",
  "      - name: Upload release gates to Qase",
  "        id: qase_upload",
  "        continue-on-error: true",
  "      - name: Complete Qase release-candidate run",
  "        id: qase_complete",
  "        continue-on-error: true",
  "        if: steps.qase_create.outputs.id != '' && !cancelled()",
  "      - name: Record Qase release identity",
  "        if: always()",
  "        env:",
  "          QASE_REPORTING_ENABLED: ${{ inputs.report_to_qase }}",
  "          QASE_RUN_ID: ${{ steps.qase_create.outputs.id }}",
  '          QASE_REPORTING_RESULTS: {"qase_create":"${{ steps.qase_create.outcome }}","qase_upload":"${{ steps.qase_upload.outcome }}","qase_complete":"${{ steps.qase_complete.outcome }}"}',
  "        run: release-evidence -- qase-metadata",
  "      - name: Build content-addressed release evidence manifest",
  "        env:",
  `          RELEASE_GATE_RESULTS: {${manifestGatePayload}}`,
  "        run: release-evidence -- manifest",
  "      - name: Preserve immutable release evidence",
  "        uses: actions/upload-artifact@0123456789abcdef0123456789abcdef01234567 # v7",
  "        with:",
  "          path: |",
  `            ${contract.manifest}`,
  `            ${contract.manifestHash}`,
  ...requiredEvidenceFiles.map((file) => `            ${file}`),
  "          if-no-files-found: error",
  "          retention-days: 365",
  "      - name: Enforce release stop conditions",
  "        run: release-evidence -- verify --require-passing",
].join("\n");

function replaceInStep(
  source: string,
  stepName: string,
  search: string,
  replacement: string,
): string {
  const start = source.indexOf(`      - name: ${stepName}`);
  if (start < 0) throw new Error(`Missing fixture step ${stepName}`);
  const next = source.indexOf("\n      - name:", start + 1);
  const end = next < 0 ? source.length : next;
  const step = source.slice(start, end);
  const changed = step.replace(search, replacement);
  if (changed === step)
    throw new Error(`Fixture step ${stepName} was unchanged`);
  return `${source.slice(0, start)}${changed}${source.slice(end)}`;
}

describe("validateReleaseCandidateContract", () => {
  it("accepts an exact-SHA, fail-closed, retained evidence workflow", () => {
    expect(() =>
      validateReleaseCandidateContract(contract, workflow, {
        automatedReports: reports,
      }),
    ).not.toThrow();
  });

  it("rejects reporting policy drift or an engineering gate replaced by Qase", () => {
    for (const changed of [
      workflow.replace("default: false", "default: true"),
      workflow.replace("if: inputs.report_to_qase &&", "if:"),
      replaceInStep(
        workflow,
        "Record Qase release identity",
        "if: always()",
        "if: success()",
      ),
      replaceInStep(
        workflow,
        "Upload release gates to Qase",
        "continue-on-error: true",
        "continue-on-error: false",
      ),
      replaceInStep(
        workflow,
        "Record Qase release identity",
        '"qase_create":"${{ steps.qase_create.outcome }}"',
        '"qase_create":"success"',
      ),
    ]) {
      expect(() =>
        validateReleaseCandidateContract(contract, changed, {
          automatedReports: reports,
        }),
      ).toThrow();
    }
    expect(() =>
      validateReleaseCandidateContract(
        {
          ...contract,
          requiredGates: [
            { id: "qase_create", title: "Qase", includeInQase: true },
            ...requiredGates.slice(1),
          ],
        },
        workflow,
        { automatedReports: reports },
      ),
    ).toThrow(/all ten engineering gates/);
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
          "name: Preserve immutable release evidence",
          "name: Enforce release stop conditions early",
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
          "if: steps.qase_create.outputs.id != '' && !cancelled()\n      - name: Record Qase release identity",
          "if: steps.qase_upload.outcome == 'success' && !cancelled()\n      - name: Record Qase release identity",
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

  it("rejects a recovery rehearsal sharing another suite's database", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        workflow.replace(
          "postgresql://b:b@127.0.0.1:5436/b",
          "postgresql://r:r@127.0.0.1:5434/r",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/must use isolated database URLs/u);
  });

  it("rejects a recovery rehearsal without explicit destructive-test consent", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Run synthetic logical backup and restore release rehearsal",
          "SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION: I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES",
          "SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION: missing",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/explicit disposable-database confirmation/u);
  });

  it("rejects recovery evidence without exact candidate and client-tool identity", () => {
    for (const [before, after] of [
      [
        "SAMRA_RECOVERY_CANDIDATE_SHA: ${{ inputs.candidate_sha }}",
        "SAMRA_RECOVERY_CANDIDATE_SHA: ${{ github.sha }}",
      ],
      [
        "SAMRA_POSTGRES_CLIENT_IMAGE: postgres:16@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94",
        "SAMRA_POSTGRES_CLIENT_IMAGE: postgres:16",
      ],
    ]) {
      expect(() =>
        validateReleaseCandidateContract(
          contract,
          replaceInStep(
            workflow,
            "Run synthetic logical backup and restore release rehearsal",
            before,
            after,
          ),
          { automatedReports: reports },
        ),
      ).toThrow(/bind the candidate, pinned PostgreSQL client/u);
    }
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

  it("rejects a security result omitted from the immutable manifest", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Build content-addressed release evidence manifest",
          '"security":"${{ steps.security.outcome }}"',
          "",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/bind gate security into the immutable manifest/);
  });

  it("rejects security omitted only from the Qase gate payload", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Build stable Qase release gate payload",
          '"security":"${{ steps.security.outcome }}"',
          "",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/bind gate security into the Qase payload/);
  });

  it("rejects evidence declared elsewhere but omitted from upload", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Preserve immutable release evidence",
          "artifacts/release-candidate/security/runtime-images/api-identity.json",
          "",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/does not preserve.*api-identity/u);
  });

  it("rejects runtime image failures omitted from the security aggregate", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Aggregate exact-SHA security gate",
          'test "${RUNTIME_IMAGES_RESULT}" = success',
          "",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/every runtime image scan passes/u);
  });

  it("rejects an immutable manifest omitted from the final artifact", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Preserve immutable release evidence",
          `            ${contract.manifest}\n            ${contract.manifestHash}`,
          "",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/does not preserve.*release-evidence-manifest/u);
  });

  it("rejects a release upload that tolerates an empty evidence selection", () => {
    expect(() =>
      validateReleaseCandidateContract(
        contract,
        replaceInStep(
          workflow,
          "Preserve immutable release evidence",
          "if-no-files-found: error",
          "if-no-files-found: warn",
        ),
        { automatedReports: reports },
      ),
    ).toThrow(/reject a wholly empty evidence selection/u);
  });
});
