import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export function validateTestEvidence(
  read = (path) => readFileSync(resolve(root, path), "utf8"),
  workflows = readdirSync(resolve(root, ".github/workflows")).filter((p) =>
    /\.ya?ml$/.test(p),
  ),
) {
  const inventory = JSON.parse(read("docs/testing/test-evidence.json"));
  if (
    inventory.version !== 1 ||
    inventory.authority !== "GitHub" ||
    !inventory.automatedReports.length
  ) {
    throw new Error("GitHub test evidence inventory is required");
  }
  for (const file of workflows) {
    if (
      /qase-tms\/|secrets\.QASE_|api\.qase\.io|report_to_qase:|inputs\.qase_/i.test(
        read(`.github/workflows/${file}`),
      )
    ) {
      throw new Error(
        `Qase is retired: outbound reporting or dispatch input in ${file}`,
      );
    }
  }
  const ci = read(".github/workflows/ci.yml");
  const reports = new Set();
  for (const { source, report } of inventory.automatedReports) {
    read(source);
    if (reports.has(report) || !ci.includes(`test-results/${report}`)) {
      throw new Error(
        `Missing or duplicate retained JUnit evidence: ${report}`,
      );
    }
    reports.add(report);
  }
  const legacy = read(inventory.legacyManualCatalog);
  const migrated = read("docs/testing/scenarios/portable-client.md");
  const ids = [...legacy.matchAll(/^(\d+),CLIENT-/gm)].map((m) => m[1]);
  if (
    ids.length !== inventory.legacyCaseCount ||
    ids.some((id) => !migrated.includes(`SAMP-${id}`))
  ) {
    throw new Error(
      "Preserve and migrate every existing portable-client scenario",
    );
  }
  for (const path of [
    "docs/testing/user-testing.md",
    ".github/ISSUE_TEMPLATE/test-session.yml",
    ".github/ISSUE_TEMPLATE/test-failure.yml",
  ])
    read(path);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  validateTestEvidence();
  console.log("GitHub test evidence valid; Qase network reporting retired.");
}
