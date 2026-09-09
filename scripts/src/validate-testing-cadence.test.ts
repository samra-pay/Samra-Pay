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
  "  merge_group:",
  "  push:",
  "    branches:",
  "      - main",
  "  schedule:",
  '    - cron: "17 6 * * *"',
  "jobs:",
  "  linux-quality:",
  "  postgres-persistence:",
  "  postgres-http:",
  "  required-ci:",
  "    name: Required CI",
  "    if: always()",
  "    needs:",
  "      - linux-quality",
  "      - postgres-persistence",
  "      - postgres-http",
  "  commercial-daily:",
  "    if: github.event_name == 'schedule' || inputs.run_commercial == 'true'",
  "TEST_ENVIRONMENT: github-ci-postgres",
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
  "TEST_ENVIRONMENT: github-ci-postgres",
].join("\n");

const resilienceWorkflow = [
  "on:",
  "  pull_request:",
  "    paths:",
  '      - ".github/workflows/backend-resilience.yml"',
  '      - "lib/db/package.json"',
  '      - "lib/db/drizzle.config.ts"',
  '      - "lib/db/drizzle/**"',
  '      - "lib/db/src/schema/**"',
  '      - "lib/db/src/test-migrate.ts"',
  '      - "lib/db/src/test-seed.ts"',
  "  schedule:",
  '    - cron: "43 7 * * 6"',
  "jobs:",
  "  resilience:",
  "TEST_ENVIRONMENT: github-ci-postgres",
  "Validate weekly resilience JUnit payloads",
  "path: test-results",
].join("\n");

const releaseWorkflow = [
  "on:",
  "  workflow_dispatch:",
  "jobs:",
  "  release-assurance:",
  "TEST_ENVIRONMENT: github-ci-postgres",
].join("\n");

const policy: TestingCadencePolicy = {
  version: 1,
  authority: {
    merge: "GitHub Actions",
    traceability: "GitHub",
    financialTruth: "PostgreSQL API and Samra control ledger",
    manualEvidence: "GitHub synthetic runs",
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
      requiredJobs: ["required-ci"],
      testEnvironment: "github-ci-postgres",
    },
    {
      id: "main",
      workflow: ".github/workflows/ci.yml",
      trigger: "push:main",
      maximumMinutes: 20,
      requiredJobs: ["required-ci"],
      testEnvironment: "github-ci-postgres",
    },
    {
      id: "daily",
      workflow: ".github/workflows/ci.yml",
      trigger: "schedule",
      cron: "17 6 * * *",
      maximumMinutes: 30,
      requiredJobs: ["commercial-daily"],
      testEnvironment: "github-ci-postgres",
    },
    {
      id: "weekly-ledger",
      workflow: ".github/workflows/ledger-performance.yml",
      trigger: "schedule",
      cron: "17 6 * * 0",
      maximumMinutes: 45,
      requiredJobs: ["performance"],
      testEnvironment: "github-ci-postgres",
    },
    {
      id: "weekly-resilience",
      workflow: ".github/workflows/backend-resilience.yml",
      trigger: "schedule",
      cron: "43 7 * * 6",
      maximumMinutes: 45,
      requiredJobs: ["resilience"],
      testEnvironment: "github-ci-postgres",
    },
    {
      id: "release",
      workflow: ".github/workflows/release-candidate.yml",
      trigger: "workflow_dispatch",
      maximumMinutes: 90,
      requiredJobs: ["release-assurance"],
      testEnvironment: "github-ci-postgres",
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

  it("rejects missing test environment attribution", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/ledger-performance.yml":
            performanceWorkflow.replace(
              "TEST_ENVIRONMENT: github-ci-postgres",
              "",
            ),
        },
        documentation,
      ),
    ).toThrow(/weekly-ledger workflow is missing test environment attribution/);
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

  it("rejects missing weekly resilience evidence validation", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/backend-resilience.yml":
            resilienceWorkflow.replace(
              "Validate weekly resilience JUnit payloads",
              "",
            ),
        },
        documentation,
      ),
    ).toThrow(/missing evidence control/);
  });

  it("rejects weekly resilience triggers that omit migration inputs", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/backend-resilience.yml":
            resilienceWorkflow.replace('      - "lib/db/drizzle/**"', ""),
        },
        documentation,
      ),
    ).toThrow(
      /Weekly resilience PR trigger is missing migration dependency lib\/db\/drizzle\/\*\*/,
    );
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

  it("rejects legacy GitHub actions that still target Node 20", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/container-portability.yml":
            "uses: actions/download-artifact@v4",
        },
        documentation,
      ),
    ).toThrow(/legacy GitHub action actions\/download-artifact@v4/);
  });

  it("rejects a legacy pnpm setup action across non-cadence workflows", () => {
    expect(() =>
      validateTestingCadence(
        policy,
        {
          ...workflows,
          ".github/workflows/design-system-preview.yml":
            "uses: pnpm/action-setup@v4",
        },
        documentation,
      ),
    ).toThrow(/legacy GitHub action pnpm\/action-setup@v4/);
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
