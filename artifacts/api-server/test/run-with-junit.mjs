import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

export function normalizeNodeJunit(source, suiteName, rootSuiteName) {
  const cases =
    source.match(/<testcase\b[^>]*\/>|<testcase\b[\s\S]*?<\/testcase>/g) ?? [];
  if (cases.length === 0) {
    throw new Error("Node JUnit output contained no test cases.");
  }
  const failures = cases.filter((testCase) =>
    testCase.includes("<failure"),
  ).length;
  const skipped = cases.filter((testCase) =>
    testCase.includes("<skipped"),
  ).length;
  const escapedSuiteName = escapeXml(suiteName);
  const rootSuiteAttribute = rootSuiteName
    ? ` name="${escapeXml(rootSuiteName)}"`
    : "";

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<testsuites${rootSuiteAttribute} tests="${cases.length}" failures="${failures}" skipped="${skipped}">`,
    `\t<testsuite name="${escapedSuiteName}" tests="${cases.length}" failures="${failures}" skipped="${skipped}">`,
    ...cases.map((testCase) => `\t\t${testCase}`),
    "\t</testsuite>",
    "</testsuites>",
    "",
  ].join("\n");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function run() {
  const [outputPath, suiteName, testFile, rootSuiteName] =
    process.argv.slice(2);
  if (!outputPath || !suiteName || !testFile) {
    console.error(
      "Usage: node test/run-with-junit.mjs <output> <suite-name> <test-file>",
    );
    process.exitCode = 2;
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=junit",
      `--test-reporter-destination=${outputPath}`,
      testFile,
    ],
    {
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "inherit",
    },
  );

  try {
    const normalized = normalizeNodeJunit(
      readFileSync(outputPath, "utf8"),
      suiteName,
      rootSuiteName,
    );
    writeFileSync(outputPath, normalized, "utf8");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  process.exitCode = result.status ?? 1;
}

if (process.argv[1]?.endsWith("run-with-junit.mjs")) {
  run();
}
