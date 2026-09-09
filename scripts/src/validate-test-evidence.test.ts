import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only repository validation module intentionally has no declaration file.
import { validateTestEvidence } from "./validate-test-evidence.mjs";
const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
describe("GitHub evidence retirement boundary", () => {
  it("keeps every current report and imported manual scenario", () => {
    expect(() => validateTestEvidence()).not.toThrow();
  });
  it.each([
    "uses: qase-tms/gh-actions/report@abc",
    "${{ secrets.QASE_API_TOKEN }}",
    "https://api.qase.io/v1/run",
    "report_to_qase:",
    "${{ inputs.qase_report }}",
  ])("rejects reintroduced remote integration: %s", (unsafe) => {
    expect(() =>
      validateTestEvidence(
        (path: string) =>
          path === ".github/workflows/ci.yml"
            ? `${read(path)}\n${unsafe}`
            : read(path),
        ["ci.yml"],
      ),
    ).toThrow(/Qase is retired/);
  });
  it("rejects lost JUnit coverage", () => {
    expect(() =>
      validateTestEvidence(
        (path: string) =>
          path === ".github/workflows/ci.yml"
            ? read(path).replaceAll(
                "test-results/postgres-persistence.xml",
                "omitted.xml",
              )
            : read(path),
        ["ci.yml"],
      ),
    ).toThrow(/retained JUnit/);
  });
  it("rejects loss of imported scenarios", () => {
    expect(() =>
      validateTestEvidence(
        (path: string) =>
          path === "docs/testing/scenarios/portable-client.md"
            ? read(path).replaceAll("SAMP-101", "omitted")
            : read(path),
        ["ci.yml"],
      ),
    ).toThrow(/every existing/);
  });
});
