import { describe, expect, it } from "vitest";

import {
  type TestingCadencePolicy,
  validateTestingCadence,
} from "./validate-testing-cadence";

const workflow = [
  "on:",
  "  workflow_dispatch:",
  "    inputs:",
  "      run_commercial:",
  '        default: "true"',
  "  pull_request:",
  "  push:",
  "    branches:",
  "      - main",
  "  schedule:",
  '    - cron: "17 6 * * *"',
  "jobs:",
  "  linux-quality:",
  "  postgres-persistence:",
  "  postgres-http:",
  "  commercial-daily:",
  "    if: github.event_name == 'schedule' || inputs.run_commercial == 'true'",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  "QASE_RUN_SOURCE: \"${{ github.event_name == 'pull_request' && format('PR #{0} ({1})', github.event.pull_request.number, github.head_ref) || github.ref_name }}\"",
  "pnpm run test:testing-cadence",
  "pnpm run test:release-contract",
  "pnpm run test:gcp-platform",
  "pnpm run test:experience-budgets",
  "customer-experience-budgets",
  "Samra Pay daily backend acceptance",
].join("\n");

const performanceWorkflow = [
  "on:",
  "  schedule:",
  '    - cron: "17 6 * * 0"',
  "jobs:",
  "  performance:",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
].join("\n");

const resilienceWorkflow = [
  "on:",
  "  pull_request:",
  "    paths:",
  '      - ".github/workflows/backend-resilience.yml"',
  "  schedule:",
  '    - cron: "43 7 * * 6"',
  "jobs:",
  "  resilience:",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  "id: qase-upload-resilience",
  "uses: qase-tms/gh-actions/report@v1",
  "path: test-results",
  "qase-upload-resilience.outcome == 'success'",
].join("\n");

const releaseWorkflow = [
  "on:",
  "  workflow_dispatch:",
  "jobs:",
  "  release-assurance:",
  "QASE_TESTOPS_ENVIRONMENT: github-ci-postgres",
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
].join("\n");

const policy: TestingCadencePolicy = {
  version: 1,
  authority: {
    merge: "GitHub Actions",
    traceability: "Qase",
    financialTruth: "PostgreSQL API and Samra control ledger",
    manualEvidence: "Qase synthetic runs",
  },
  riskTiers: [
    {
      id: "P0",
      meaning: "Financial truth",
      requiredCadences: ["pull-request", "main", "daily", "release"],
      manualOverrideAllowed: false,
    },
    {
      id: "P1",
      meaning: "Critical journey",
      requiredCadences: ["pull-request", "main", "daily", "release"],
      manualOverrideAllowed: false,
    },
    {
      id: "P2",
      meaning: "Secondary behavior",
      requiredCadences: ["release"],
      manualOverrideAllowed: true,
    },
  ],
  cadences: [
    {
      id: "pull-request",
      workflow: ".github/workflows/ci.yml",
      trigger: "pull_request",
      maximumMinutes: 20,
      requiredJobs: ["linux-quality"],
      qaseEnvironment: "github-ci-postgres",
    },
    {
      id: "main",
      workflow: ".github/workflows/ci.yml",
      trigger: "push:main",
      maximumMinutes: 20,
      requiredJobs: ["linux-quality"],
      qaseEnvironment: "github-ci-postgres",
    },
    {
      id: "daily",
      workflow: ".github/workflows/ci.yml",
      trigger: "schedule",
      cron: "17 6 * * *",
      maximumMinutes: 30,
      requiredJobs: ["commercial-daily"],
      qaseEnvironment: "github-ci-postgres",
    },
    {
      id: "weekly-ledger",
      workflow: ".github/workflows/ledger-performance.yml",
      trigger: "schedule",
      cron: "17 6 * * 0",
      maximumMinutes: 45,
      requiredJobs: ["performance"],
      qaseEnvironment: "github-ci-postgres",
    },
    {
      id: "weekly-resilience",
      workflow: ".github/workflows/backend-resilience.yml",
      trigger: "schedule",
      cron: "43 7 * * 6",
      maximumMinutes: 45,
      requiredJobs: ["resilience"],
      qaseEnvironment: "github-ci-postgres",
    },
    {
      id: "release",
      workflow: ".github/workflows/release-candidate.yml",
      trigger: "workflow_dispatch",
      maximumMinutes: 90,
      requiredJobs: ["release-assurance"],
      qaseEnvironment: "github-ci-postgres",
    },
  ],
  surfaces: [
    {
      id: "financial-core",
      risk: "P0",
      paths: ["lib/ledger/**"],
      cadences: [
        "pull-request",
        "main",
        "daily",
        "weekly-ledger",
        "weekly-resilience",
        "release",
      ],
    },
    {
      id: "customer-web",
      risk: "P1",
      paths: ["artifacts/samra-pay/**"],
      cadences: ["pull-request", "main", "daily", "release"],
    },
    {
      id: "secondary",
      risk: "P2",
      paths: ["artifacts/secondary/**"],
      cadences: ["release"],
    },
  ],
  stopConditions: [
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "A governed artifact exceeds its approved raw or gzip budget.",
  ],
  boundaries: ["one", "two", "three", "four"],
};

const workflows = {
  ".github/workflows/ci.yml": workflow,
  ".github/workflows/ledger-performance.yml": performanceWorkflow,
  ".github/workflows/backend-resilience.yml": resilienceWorkflow,
  ".github/workflows/release-candidate.yml": releaseWorkflow,
};

const documentation = [
  "testing-cadence.json",
  "06:17 UTC",
  "github-ci-postgres",
  "Merge and release stop conditions",
  "Replit",
].join("\n");

describe("validateTestingCadence", () => {
  it("accepts a complete risk, cadence, workflow, and surface contract", () => {
    expect(() =>
      validateTestingCadence(policy, workflows, documentation),
    ).not.toThrow();
  });

  it("rejects a daily schedule that drifts from the governed off-hour minute", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ci.yml": workflow.replace(
            'cron: "17 6 * * *"',
            'cron: "0 6 * * *"',
          ),
        },
        documentation,
      ),
    ).toThrow(/daily workflow does not implement 17 6/);
  });

  it("rejects a P0 surface that omits daily evidence", () => {
    const unsafePolicy: TestingCadencePolicy = {
      ...policy,
      surfaces: policy.surfaces.map((surface) =>
        surface.id === "financial-core"
          ? {
              ...surface,
              cadences: surface.cadences.filter(
                (cadence) => cadence !== "daily",
              ),
            }
          : surface,
      ),
    };

    expect(() =>
      validateTestingCadence(unsafePolicy, workflows, documentation),
    ).toThrow(/financial-core does not satisfy P0 cadence daily/);
  });

  it("rejects missing Qase environment attribution", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ledger-performance.yml": performanceWorkflow
            .replace("QASE_TESTOPS_ENVIRONMENT: github-ci-postgres", "")
            .replace("environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}", ""),
        },
        documentation,
      ),
    ).toThrow(/weekly-ledger workflow is missing Qase environment attribution/);
  });

  it("rejects a release dispatch that silently omits the commercial gate", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ci.yml": workflow.replace(
            'default: "true"',
            'default: "false"',
          ),
        },
        documentation,
      ),
    ).toThrow(/Release dispatch must include the commercial gate by default/);
  });

  it("rejects CI that silently drops the experience budget gate", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ci.yml": workflow.replace(
            "pnpm run test:experience-budgets",
            "",
          ),
        },
        documentation,
      ),
    ).toThrow(/test:experience-budgets/);
  });

  it("rejects feature-branch push triggers that duplicate pull-request evidence", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ci.yml": workflow.replace(
            "      - main",
            '      - main\n      - "codex/**"',
          ),
        },
        documentation,
      ),
    ).toThrow(/feature-branch push triggers duplicate pull-request evidence/);
  });

  it("rejects an unquoted Qase source expression containing a YAML hash", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ci.yml": workflow.replace(
            'QASE_RUN_SOURCE: "${{',
            "QASE_RUN_SOURCE: ${{",
          ),
        },
        documentation,
      ),
    ).toThrow(/QASE_RUN_SOURCE expression must be fully quoted/);
  });

  it("rejects multiple weekly resilience Qase report actions", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/backend-resilience.yml": `${resilienceWorkflow}\nuses: qase-tms/gh-actions/report@v1`,
        },
        documentation,
      ),
    ).toThrow(/Weekly resilience must upload its Qase evidence in one batch/);
  });

  it("rejects broad weekly resilience triggers already covered by CI", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/backend-resilience.yml":
            resilienceWorkflow.replace(
              '      - ".github/workflows/backend-resilience.yml"',
              '      - ".github/workflows/backend-resilience.yml"\n      - "docs/testing/**"',
            ),
        },
        documentation,
      ),
    ).toThrow(/Weekly resilience PR trigger duplicates CI governance coverage/);
  });

  it("rejects policy that omits the experience budget stop condition", () => {
    expect(() =>
      validateTestingCadence(
        {
          ...policy,
          stopConditions: ["one", "two", "three", "four", "five", "six"],
        },
        workflows,
        documentation,
      ),
    ).toThrow(/experience budget regressions/);
  });
});
