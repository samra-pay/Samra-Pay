import { describe, expect, it } from "vitest";

import { parseCsv, validateQaseContract } from "./validate-qase-contract";

const report = {
  id: "process-restart",
  source: "source.test.ts",
  report: "process.xml",
  uploadStepId: "qase-upload-process",
  requiredForCompletion: true,
} as const;

const csv = [
  "id,title,tags,suite_id,suite_parent_id,suite",
  ",,,26,,12 Portable Client Smoke",
  ",,,27,26,12.01 Web",
  '101,"Portable case","portable-client,manual,smoke",27,26,"12.01 Web"',
].join("\n");

const governance = {
  project: "SAMP",
  repositorySnapshot: { cases: 1, suites: 2 },
  portableClientSuites: [
    { id: 26, title: "12 Portable Client Smoke", parentId: null },
    { id: 27, title: "12.01 Web", parentId: 26 },
  ],
  environments: [{ title: "GitHub CI", slug: "github-ci-postgres" }],
  plans: [{ id: 1, title: "P0", caseCount: 1 }],
  manualCatalogs: [
    {
      path: "catalog.csv",
      caseCount: 1,
      targetPlan: "P0",
      qaseCaseRange: "SAMP-101 through SAMP-101",
      status: "imported",
      tags: ["portable-client", "manual", "smoke"],
    },
  ],
  automatedReports: [report],
} as const;

const workflow = [
  "environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}",
  "test-results/process.xml",
  "id: qase-upload-process",
  "qase-upload-process.outcome == 'success'",
].join("\n");

describe("parseCsv", () => {
  it("preserves commas and newlines inside quoted Qase fields", () => {
    expect(parseCsv('title,steps\n"A, B","one\ntwo"')).toEqual([
      ["title", "steps"],
      ["A, B", "one\ntwo"],
    ]);
  });
});

describe("validateQaseContract", () => {
  it("accepts a complete report, environment, and manual catalog contract", () => {
    expect(() =>
      validateQaseContract(
        governance,
        workflow,
        "process.xml github-ci-postgres",
        (path) => (path === "catalog.csv" ? csv : "source"),
      ),
    ).not.toThrow();
  });

  it("rejects completion that can close before a required upload succeeds", () => {
    expect(() =>
      validateQaseContract(
        governance,
        workflow.replace("qase-upload-process.outcome == 'success'", ""),
        "process.xml github-ci-postgres",
        (path) => (path === "catalog.csv" ? csv : "source"),
      ),
    ).toThrow(/completion does not require qase-upload-process/);
  });
});
