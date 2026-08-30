import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateExperienceBudgets,
  resolveWorkspacePath,
  validateContract,
  type ExperienceBudgetContract,
} from "./validate-experience-budgets";

const temporaryDirectories: string[] = [];
const metadata = {
  candidateSha: "a".repeat(40),
  generatedAt: "2026-08-19T00:00:00.000Z",
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("experience artifact budgets", () => {
  it("anchors relative evidence paths to the workspace root", () => {
    expect(resolveWorkspacePath("tmp/report.json", "/workspace")).toBe(
      path.join("/workspace", "tmp/report.json"),
    );
    expect(resolveWorkspacePath("/absolute/report.json", "/workspace")).toBe(
      "/absolute/report.json",
    );
  });

  it("measures the single governed artifact in raw and gzip bytes", async () => {
    const root = await fixture("dist/entry-app.js", "Samra Pay ".repeat(50));
    const report = await evaluateExperienceBudgets(contract(), root, metadata);

    expect(report.status).toBe("passed");
    expect(report.results[0]).toMatchObject({
      id: "entry",
      matchedFiles: ["dist/entry-app.js"],
      bytes: 500,
      status: "passed",
    });
    expect(report.results[0]!.gzipBytes).toBeGreaterThan(0);
  });

  it("fails closed when an artifact is absent or ambiguous", async () => {
    const missingRoot = await fixture("dist/unrelated.js", "x");
    const missing = await evaluateExperienceBudgets(
      contract(),
      missingRoot,
      metadata,
    );
    expect(missing.status).toBe("failed");
    expect(missing.results[0]!.failures[0]).toMatch(/found 0/);

    const ambiguousRoot = await fixture("dist/entry-one.js", "one");
    await writeFixture(ambiguousRoot, "dist/entry-two.js", "two");
    const ambiguous = await evaluateExperienceBudgets(
      contract(),
      ambiguousRoot,
      metadata,
    );
    expect(ambiguous.status).toBe("failed");
    expect(ambiguous.results[0]!.failures[0]).toMatch(/found 2/);
  });

  it("passes only while forbidden artifacts remain absent", async () => {
    const root = await fixture("dist/public-entry.js", "public");
    const forbiddenContract: ExperienceBudgetContract = {
      version: 2,
      budgets: [
        {
          id: "legacy-auth",
          surface: "customer-web",
          directory: "dist",
          match: "^auth0-client-[a-z]+\\.js$",
          expectedMatches: 0,
        },
      ],
    };

    const absent = await evaluateExperienceBudgets(
      forbiddenContract,
      root,
      metadata,
    );
    expect(absent.results[0]).toMatchObject({
      status: "passed",
      expectedMatches: 0,
      matchedFiles: [],
      maximumBytes: null,
      maximumGzipBytes: null,
    });

    await writeFixture(root, "dist/auth0-client-legacy.js", "forbidden");
    const present = await evaluateExperienceBudgets(
      forbiddenContract,
      root,
      metadata,
    );
    expect(present.status).toBe("failed");
    expect(present.results[0]!.failures[0]).toMatch(/expected 0.*found 1/);
  });

  it("reports raw and compressed budget regressions independently", async () => {
    const root = await fixture("dist/entry-app.js", "0123456789".repeat(30));
    const report = await evaluateExperienceBudgets(
      contract({ maximumBytes: 10, maximumGzipBytes: 1 }),
      root,
      metadata,
    );

    expect(report.status).toBe("failed");
    expect(report.results[0]!.failures).toEqual([
      expect.stringMatching(/raw bytes/),
      expect.stringMatching(/gzip bytes/),
    ]);
  });

  it("rejects duplicate IDs, ambiguous contracts, and invalid limits", () => {
    const budget = contract().budgets[0]!;
    expect(() =>
      validateContract({ version: 2, budgets: [budget, budget] }),
    ).toThrow(/unique/);
    expect(() => validateContract(contract({ maximumBytes: 0 }))).toThrow(
      /positive maximumBytes/,
    );
    expect(() => validateContract(contract({ expectedMatches: 2 }))).toThrow(
      /zero or exactly one/,
    );
    expect(() =>
      validateContract(
        contract({
          expectedMatches: 0,
          maximumBytes: 100,
          maximumGzipBytes: 100,
        }),
      ),
    ).toThrow(/must not define size limits/);
  });

  it("rejects a directory that resolves outside the workspace", async () => {
    const root = await fixture("dist/entry-app.js", "content");
    await expect(
      evaluateExperienceBudgets(
        contract({ directory: "../outside" }),
        root,
        metadata,
      ),
    ).rejects.toThrow(/escapes workspace/);
  });
});

function contract(
  overrides: Partial<ExperienceBudgetContract["budgets"][number]> = {},
): ExperienceBudgetContract {
  return {
    version: 2,
    budgets: [
      {
        id: "entry",
        surface: "customer-web",
        directory: "dist",
        match: "^entry-[a-z]+\\.js$",
        expectedMatches: 1,
        maximumBytes: 1000,
        maximumGzipBytes: 1000,
        ...overrides,
      },
    ],
  };
}

async function fixture(relativePath: string, content: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "samra-budgets-"));
  temporaryDirectories.push(root);
  await writeFixture(root, relativePath, content);
  return root;
}

async function writeFixture(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}
