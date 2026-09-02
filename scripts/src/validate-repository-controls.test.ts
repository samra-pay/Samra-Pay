import { describe, expect, it } from "vitest";

import { validateRepositoryControls } from "./validate-repository-controls";

const contract = {
  version: 1,
  protectedBranch: "main",
  requiredChecks: [
    {
      workflow: ".github/workflows/ci.yml",
      job: "required-ci",
      name: "Required CI",
      aggregateStep: "Require every merge-blocking CI gate to pass",
      dependencies: ["quality", "database"],
    },
    {
      workflow: ".github/workflows/security.yml",
      job: "required-security",
      name: "Required security",
      aggregateStep: "Require every security control to pass",
      dependencies: ["scan"],
    },
  ],
  requiredRepositorySettings: {
    requirePullRequest: true,
    requireUpToDateBranch: true,
    requireMergeQueue: true,
    blockForcePushes: true,
    blockDeletions: true,
  },
  boundary:
    "This contract validates code. GitHub must independently enforce the ruleset.",
} as const;

function workflow(
  job: string,
  name: string,
  aggregateStep: string,
  dependencies: readonly string[],
) {
  return [
    "on:",
    "  pull_request:",
    "    branches:",
    "      - main",
    "  merge_group:",
    "  push:",
    "    branches:",
    "      - main",
    "concurrency:",
    "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    "jobs:",
    ...dependencies.map((dependency) => `  ${dependency}:`),
    `  ${job}:`,
    `    name: ${name}`,
    "    if: always()",
    "    needs:",
    ...dependencies.map((dependency) => `      - ${dependency}`),
    "    runs-on: ubuntu-latest",
    "    steps:",
    `      - name: ${aggregateStep}`,
    "        env:",
    ...dependencies.map(
      (dependency) =>
        `          ${dependency.toUpperCase()}_RESULT: \${{ needs.${dependency}.result }}`,
    ),
    "        run: |",
    ...dependencies.map(
      (dependency) =>
        `          test "\${${dependency.toUpperCase()}_RESULT}" = success`,
    ),
  ].join("\n");
}

const workflows = {
  ".github/workflows/ci.yml": workflow(
    "required-ci",
    "Required CI",
    "Require every merge-blocking CI gate to pass",
    ["quality", "database"],
  ),
  ".github/workflows/security.yml": workflow(
    "required-security",
    "Required security",
    "Require every security control to pass",
    ["scan"],
  ),
};

describe("repository controls", () => {
  it("accepts unconditional fail-closed checks for pull requests, merge queue, and main", () => {
    expect(() => validateRepositoryControls(contract, workflows)).not.toThrow();
  });

  it("rejects cancellation of main-branch evidence", () => {
    expect(() =>
      validateRepositoryControls(contract, {
        ...workflows,
        ".github/workflows/ci.yml": workflows[
          ".github/workflows/ci.yml"
        ].replace(
          "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
          "cancel-in-progress: true",
        ),
      }),
    ).toThrow(/cancel merge-group or main-branch evidence/u);
  });

  it("rejects trigger and cancellation decoys outside their top-level sections", () => {
    const weakened = workflows[".github/workflows/ci.yml"]
      .replace("  merge_group:\n", "")
      .replace(
        "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
        "  cancel-in-progress: true",
      )
      .concat(
        "\n  decoy:\n    merge_group:\n    cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      );
    expect(() =>
      validateRepositoryControls(contract, {
        ...workflows,
        ".github/workflows/ci.yml": weakened,
      }),
    ).toThrow(/trigger merge_group|cancel merge-group/u);
  });

  it("rejects an aggregate check that omits a dependency result", () => {
    expect(() =>
      validateRepositoryControls(contract, {
        ...workflows,
        ".github/workflows/ci.yml": workflows[
          ".github/workflows/ci.yml"
        ].replace(
          'test "${DATABASE_RESULT}" = success',
          'test "${QUALITY_RESULT}" = success',
        ),
      }),
    ).toThrow(/success predicate for database/u);
  });

  it("rejects a required aggregate that continues on error", () => {
    expect(() =>
      validateRepositoryControls(contract, {
        ...workflows,
        ".github/workflows/security.yml": workflows[
          ".github/workflows/security.yml"
        ].replace(
          "    if: always()",
          "    if: always()\n    continue-on-error: true",
        ),
      }),
    ).toThrow(/must not continue on error/u);
  });

  it("rejects a skipped aggregate even when a nested step says always", () => {
    expect(() =>
      validateRepositoryControls(contract, {
        ...workflows,
        ".github/workflows/ci.yml": workflows[
          ".github/workflows/ci.yml"
        ].replace("    if: always()", "    if: false\n        if: always()"),
      }),
    ).toThrow(/job-level if: always/u);
  });

  it("rejects a condition that skips the aggregate enforcement step", () => {
    expect(() =>
      validateRepositoryControls(contract, {
        ...workflows,
        ".github/workflows/security.yml": workflows[
          ".github/workflows/security.yml"
        ].replace("        env:", "        if: false\n        env:"),
      }),
    ).toThrow(/must not be conditionally skipped/u);
  });
});
