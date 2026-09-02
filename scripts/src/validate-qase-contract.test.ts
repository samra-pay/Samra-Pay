import { describe, expect, it } from "vitest";

import { parseCsv, validateQaseContract } from "./validate-qase-contract";

const report = {
  id: "process-restart",
  source: "source.test.ts",
  report: "process.xml",
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
  automatedReportUpload: {
    stepId: "qase-upload-acceptance",
    path: "test-results",
    format: "junit",
  },
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
  "- name: Upload automated acceptance results to Qase",
  "  id: qase-upload-acceptance",
  "  uses: qase-tms/gh-actions/report@0123456789abcdef0123456789abcdef01234567 # v1",
  "  with:",
  "    format: junit",
  "    path: test-results",
  "qase-upload-acceptance.outcome == 'success'",
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
        workflow.replace("qase-upload-acceptance.outcome == 'success'", ""),
        "process.xml github-ci-postgres",
        (path) => (path === "catalog.csv" ? csv : "source"),
      ),
    ).toThrow(/completion does not require qase-upload-acceptance/);
  });

  it("rejects separate Qase upload actions for individual reports", () => {
    expect(() =>
      validateQaseContract(
        governance,
        `${workflow}\nuses: qase-tms/gh-actions/report@89abcdef0123456789abcdef0123456789abcdef # v1`,
        "process.xml github-ci-postgres",
        (path) => (path === "catalog.csv" ? csv : "source"),
      ),
    ).toThrow(/one batch; found 2 report actions/);
  });

  it("rejects a single-file upload that can omit governed reports", () => {
    expect(() =>
      validateQaseContract(
        {
          ...governance,
          automatedReportUpload: {
            ...governance.automatedReportUpload,
            path: "test-results/process.xml",
          },
        },
        workflow,
        "process.xml github-ci-postgres",
        (path) => (path === "catalog.csv" ? csv : "source"),
      ),
    ).toThrow(/one JUnit directory upload from test-results/);
  });
});
