#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const GOVERNANCE_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/qase-governance.json",
);
const WORKFLOW_PATH = path.join(WORKSPACE_ROOT, ".github/workflows/ci.yml");
const DOC_PATH = path.join(WORKSPACE_ROOT, "docs/testing/qase-ci.md");

type AutomatedReport = Readonly<{
  id: string;
  source: string;
  report: string;
  uploadStepId: string;
  requiredForCompletion: boolean;
}>;

type ManualCatalog = Readonly<{
  path: string;
  caseCount: number;
  targetPlan: string;
  qaseCaseRange: string;
  status: "imported";
  tags: readonly string[];
}>;

type Governance = Readonly<{
  project: string;
  repositorySnapshot: Readonly<{ cases: number; suites: number }>;
  portableClientSuites: readonly Readonly<{
    id: number;
    title: string;
    parentId: number | null;
  }>[];
  environments: readonly Readonly<{ title: string; slug: string }>[];
  plans: readonly Readonly<{
    id: number;
    title: string;
    caseCount: number;
  }>[];
  manualCatalogs: readonly ManualCatalog[];
  automatedReports: readonly AutomatedReport[];
}>;

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV ends inside a quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function assertUnique(values: readonly string[], label: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicates: ${duplicates.join(", ")}`);
  }
}

export function validateQaseContract(
  governance: Governance,
  workflow: string,
  documentation: string,
  readFile: (relativePath: string) => string = (relativePath) =>
    fs.readFileSync(path.join(WORKSPACE_ROOT, relativePath), "utf8"),
): void {
  if (governance.project !== "SAMP") {
    throw new Error("Qase project code must remain SAMP.");
  }
  if (
    governance.repositorySnapshot.cases < 1 ||
    governance.repositorySnapshot.suites < 1
  ) {
    throw new Error("The Qase repository snapshot cannot be empty.");
  }

  assertUnique(
    governance.portableClientSuites.map(({ id }) => String(id)),
    "Portable suite IDs",
  );
  assertUnique(
    governance.portableClientSuites.map(({ title }) => title),
    "Portable suite titles",
  );
  const portableRoot = governance.portableClientSuites.find(
    ({ parentId }) => parentId === null,
  );
  if (
    !portableRoot ||
    portableRoot.title !== "12 Portable Client Smoke" ||
    governance.portableClientSuites.some(
      ({ id, parentId }) =>
        id !== portableRoot.id && parentId !== portableRoot.id,
    )
  ) {
    throw new Error("Portable client suites must share one governed root.");
  }

  assertUnique(
    governance.environments.map(({ slug }) => slug),
    "Environment slugs",
  );
  if (
    !governance.environments.some(({ slug }) => slug === "github-ci-postgres")
  ) {
    throw new Error("The disposable PostgreSQL CI environment is required.");
  }

  assertUnique(
    governance.plans.map(({ id }) => String(id)),
    "Plan IDs",
  );
  assertUnique(
    governance.plans.map(({ title }) => title),
    "Plan titles",
  );
  if (governance.plans.some(({ caseCount }) => caseCount <= 0)) {
    throw new Error("Every release plan must contain at least one case.");
  }

  assertUnique(
    governance.automatedReports.map(({ id }) => id),
    "Automated report IDs",
  );
  assertUnique(
    governance.automatedReports.map(({ report }) => report),
    "JUnit report names",
  );
  assertUnique(
    governance.automatedReports.map(({ uploadStepId }) => uploadStepId),
    "Qase upload step IDs",
  );

  for (const report of governance.automatedReports) {
    readFile(report.source);
    const reportPath = `test-results/${report.report}`;
    if (!workflow.includes(reportPath)) {
      throw new Error(`Workflow does not validate/upload ${reportPath}.`);
    }
    if (!workflow.includes(`id: ${report.uploadStepId}`)) {
      throw new Error(
        `Workflow is missing upload step ${report.uploadStepId}.`,
      );
    }
    if (
      report.requiredForCompletion &&
      !workflow.includes(`${report.uploadStepId}.outcome == 'success'`)
    ) {
      throw new Error(
        `Qase completion does not require ${report.uploadStepId} to succeed.`,
      );
    }
    if (!documentation.includes(report.report)) {
      throw new Error(`Qase documentation is missing ${report.report}.`);
    }
  }

  if (!workflow.includes("environment: ${{ env.QASE_TESTOPS_ENVIRONMENT }}")) {
    throw new Error("Qase automated runs must be assigned to an environment.");
  }
  if (!documentation.includes("github-ci-postgres")) {
    throw new Error("Qase documentation must name the CI environment slug.");
  }

  for (const catalog of governance.manualCatalogs) {
    if (catalog.status !== "imported") {
      throw new Error(`${catalog.path} must record its live import status.`);
    }
    if (!governance.plans.some(({ title }) => title === catalog.targetPlan)) {
      throw new Error(`${catalog.path} target plan is not governed.`);
    }
    const rows = parseCsv(readFile(catalog.path));
    const headers = rows[0] ?? [];
    const idIndex = headers.indexOf("id");
    const titleIndex = headers.indexOf("title");
    const tagsIndex = headers.indexOf("tags");
    const suiteIdIndex = headers.indexOf("suite_id");
    const suiteParentIdIndex = headers.indexOf("suite_parent_id");
    const suiteIndex = headers.indexOf("suite");
    if (
      idIndex < 0 ||
      titleIndex < 0 ||
      tagsIndex < 0 ||
      suiteIdIndex < 0 ||
      suiteParentIdIndex < 0 ||
      suiteIndex < 0
    ) {
      throw new Error(`${catalog.path} is not a Qase CSV export/import file.`);
    }

    const suiteRows = rows.slice(1).filter((row) => !row[titleIndex]);
    const governedSuites = governance.portableClientSuites.map(
      ({ id, title, parentId }) => ({
        id: String(id),
        title,
        parentId: parentId === null ? "" : String(parentId),
      }),
    );
    const catalogSuites = suiteRows.map((row) => ({
      id: row[suiteIdIndex] ?? "",
      title: row[suiteIndex] ?? "",
      parentId: row[suiteParentIdIndex] ?? "",
    }));
    if (JSON.stringify(catalogSuites) !== JSON.stringify(governedSuites)) {
      throw new Error(
        `${catalog.path} suite IDs do not match Qase governance.`,
      );
    }

    const caseRows = rows.slice(1).filter((row) => row[titleIndex]);
    if (caseRows.length !== catalog.caseCount) {
      throw new Error(
        `${catalog.path} has ${caseRows.length} cases; expected ${catalog.caseCount}.`,
      );
    }
    assertUnique(
      caseRows.map((row) => row[titleIndex]!),
      `${catalog.path} case titles`,
    );
    assertUnique(
      caseRows.map((row) => row[idIndex]!),
      `${catalog.path} Qase case IDs`,
    );
    const caseIds = caseRows.map((row) => Number(row[idIndex]));
    if (
      caseIds.some((id) => !Number.isSafeInteger(id)) ||
      catalog.qaseCaseRange !==
        `SAMP-${Math.min(...caseIds)} through SAMP-${Math.max(...caseIds)}`
    ) {
      throw new Error(`${catalog.path} Qase case range is stale.`);
    }
    const governedSuiteIds = new Set(
      governance.portableClientSuites
        .filter(({ parentId }) => parentId !== null)
        .map(({ id }) => String(id)),
    );
    for (const row of caseRows) {
      const tags = new Set((row[tagsIndex] ?? "").split(","));
      for (const requiredTag of catalog.tags) {
        if (!tags.has(requiredTag)) {
          throw new Error(
            `${row[titleIndex]} is missing required tag ${requiredTag}.`,
          );
        }
      }
      if (!(row[suiteIndex] ?? "").startsWith("12.")) {
        throw new Error(`${row[titleIndex]} is outside the portable suite.`);
      }
      if (
        !governedSuiteIds.has(row[suiteIdIndex] ?? "") ||
        row[suiteParentIdIndex] !== String(portableRoot.id)
      ) {
        throw new Error(`${row[titleIndex]} has stale Qase suite IDs.`);
      }
    }
  }
}

function main(): void {
  const governance = JSON.parse(
    fs.readFileSync(GOVERNANCE_PATH, "utf8"),
  ) as Governance;
  validateQaseContract(
    governance,
    fs.readFileSync(WORKFLOW_PATH, "utf8"),
    fs.readFileSync(DOC_PATH, "utf8"),
  );
  console.log(
    `Qase contract valid: ${governance.automatedReports.length} automated reports, ${governance.manualCatalogs.reduce((total, catalog) => total + catalog.caseCount, 0)} manual portable-client cases.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
