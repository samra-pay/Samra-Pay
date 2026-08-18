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
  "pnpm run test:testing-cadence",
  "pnpm run test:gcp-platform",
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
  "  schedule:",
  '    - cron: "43 7 * * 6"',
  "jobs:",
  "  resilience:",
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
      workflow: ".github/workflows/ci.yml",
      trigger: "workflow_dispatch",
      maximumMinutes: 30,
      requiredJobs: ["linux-quality"],
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
  stopConditions: ["one", "two", "three", "four", "five", "six"],
  boundaries: ["one", "two", "three", "four"],
};

const workflows = {
  ".github/workflows/ci.yml": workflow,
  ".github/workflows/ledger-performance.yml": performanceWorkflow,
  ".github/workflows/backend-resilience.yml": resilienceWorkflow,
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
});
