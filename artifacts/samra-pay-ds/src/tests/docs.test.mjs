/**
 * Documentation integrity tests.
 * Tests that required doc files exist and contain no broken component .md links.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const docsDir = join(root, "docs");

// Required doc files
const requiredDocs = [
  "docs/current-state-audit.md",
  "docs/financial-ui-truth.md",
  "docs/accessibility.md",
  "docs/content-and-voice.md",
  "docs/semantic-tokens.md",
  "docs/asset-rights.md",
  "docs/AGENTS.md",
  "docs/references/native-component-inventory.md",
  "docs/references/component-inventory.md",
];

for (const docPath of requiredDocs) {
  test(`Required doc exists: ${docPath}`, () => {
    const fullPath = join(root, docPath);
    assert.ok(existsSync(fullPath), `Missing required doc: ${docPath}`);
  });
}

test("CHANGELOG.md exists at root", () => {
  assert.ok(existsSync(join(root, "CHANGELOG.md")), "CHANGELOG.md must exist at package root");
});

// Check for broken .md component references
// The old pattern was `components/button.md` etc. which don't exist.
const brokenPatterns = [
  /components\/button\.md/,
  /components\/badge\.md/,
  /components\/card\.md/,
  /components\/input\.md/,
  /components\/avatar\.md/,
  /components\/accordion\.md/,
  /components\/alert\.md/,
];

function getAllDocFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllDocFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("No active doc files contain broken 'components/*.md' references", () => {
  const docFiles = getAllDocFiles(docsDir);
  const violations = [];

  // Exclude the audit/history files which document these broken references as historical fact
  const excludedFiles = [
    "docs/current-state-audit.md",
  ];

  for (const docFile of docFiles) {
    const relPath = docFile.replace(root + "/", "");
    // Skip excluded files — they document historical broken links as part of the audit record
    if (excludedFiles.some((excluded) => relPath === excluded)) continue;
    const content = readFileSync(docFile, "utf8");
    for (const pattern of brokenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relPath} contains broken reference matching ${pattern}`);
      }
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `Broken component .md references found:\n${violations.join("\n")}`,
  );
});

test("docs/AGENTS.md is non-empty", () => {
  const content = readFileSync(join(root, "docs/AGENTS.md"), "utf8");
  assert.ok(content.length > 100, "AGENTS.md must have substantial content");
});

test("docs/financial-ui-truth.md contains mandatory rules section", () => {
  const content = readFileSync(join(root, "docs/financial-ui-truth.md"), "utf8");
  assert.ok(
    content.includes("Mandatory") || content.includes("mandatory"),
    "financial-ui-truth.md must contain mandatory rules",
  );
});

test("docs/accessibility.md mentions WCAG", () => {
  const content = readFileSync(join(root, "docs/accessibility.md"), "utf8");
  assert.ok(content.includes("WCAG"), "accessibility.md must reference WCAG standards");
});

test("docs/content-and-voice.md contains prohibited copy section", () => {
  const content = readFileSync(join(root, "docs/content-and-voice.md"), "utf8");
  assert.ok(
    content.includes("Prohibited") || content.includes("prohibited"),
    "content-and-voice.md must contain prohibited copy patterns",
  );
});

test("docs/references/native-component-inventory.md lists StatusBadge", () => {
  const content = readFileSync(join(root, "docs/references/native-component-inventory.md"), "utf8");
  assert.ok(content.includes("StatusBadge"), "native-component-inventory.md must list StatusBadge");
});
