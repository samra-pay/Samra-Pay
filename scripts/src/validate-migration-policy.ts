#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATION_DIRECTORY = path.join(WORKSPACE_ROOT, "lib/db/drizzle");
const JOURNAL_PATH = path.join(MIGRATION_DIRECTORY, "meta/_journal.json");
const POLICY_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/migration-policy.json",
);
const IMMUTABLE_BASELINE = "0016_marketing_waitlist";

const prohibitedPatterns = {
  "drop-table": /\bdrop\s+table\b/iu,
  "drop-column": /\bdrop\s+column\b/iu,
  "drop-type": /\bdrop\s+type\b/iu,
  "truncate-table": /\btruncate(?:\s+table)?\b/iu,
  "rename-table-or-column": /\brename\s+(?:table|column|to)\b/iu,
  "alter-column-type": /\balter\s+column\b[\s\S]*?\btype\b/iu,
  "unbounded-delete": /\bdelete\s+from\b/iu,
} as const;

type ProhibitedOperation = keyof typeof prohibitedPatterns;

type MigrationPolicy = Readonly<{
  version: number;
  baselineThrough: string;
  prohibitedOperations: readonly ProhibitedOperation[];
  waivers: readonly Readonly<{
    migration: string;
    operations: readonly ProhibitedOperation[];
    reason: string;
    approvedBy: string;
    approvedAt: string;
    approvalReference: string;
    rollbackPlan: string;
  }>[];
}>;

type Journal = Readonly<{
  entries: readonly Readonly<{ idx: number; tag: string }>[];
}>;

function normalizedSqlStatements(sql: string): readonly string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  let state: "code" | "single" | "double" | "line" | "block" | "dollar" =
    "code";
  let blockDepth = 0;
  let dollarDelimiter = "";

  const mask = (character: string): void => {
    current += character === "\n" ? "\n" : " ";
  };

  while (index < sql.length) {
    const character = sql[index]!;
    const next = sql[index + 1];

    if (state === "line") {
      mask(character);
      index += 1;
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (character === "/" && next === "*") {
        mask(character);
        mask(next);
        blockDepth += 1;
        index += 2;
        continue;
      }
      if (character === "*" && next === "/") {
        mask(character);
        mask(next);
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = "code";
        continue;
      }
      mask(character);
      index += 1;
      continue;
    }
    if (state === "dollar") {
      if (sql.startsWith(dollarDelimiter, index)) {
        for (const delimiterCharacter of dollarDelimiter) {
          mask(delimiterCharacter);
        }
        index += dollarDelimiter.length;
        dollarDelimiter = "";
        state = "code";
      } else {
        mask(character);
        index += 1;
      }
      continue;
    }
    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      mask(character);
      if (character === "\\" && next !== undefined) {
        mask(next);
        index += 2;
        continue;
      }
      if (character === quote && next === quote) {
        mask(next);
        index += 2;
        continue;
      }
      index += 1;
      if (character === quote) state = "code";
      continue;
    }

    if (character === "-" && next === "-") {
      mask(character);
      mask(next);
      state = "line";
      index += 2;
      continue;
    }
    if (character === "/" && next === "*") {
      mask(character);
      mask(next);
      state = "block";
      blockDepth = 1;
      index += 2;
      continue;
    }
    if (character === "'") {
      mask(character);
      state = "single";
      index += 1;
      continue;
    }
    if (character === '"') {
      mask(character);
      state = "double";
      index += 1;
      continue;
    }
    if (character === "$") {
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(
        sql.slice(index),
      )?.[0];
      if (delimiter) {
        for (const delimiterCharacter of delimiter) mask(delimiterCharacter);
        dollarDelimiter = delimiter;
        state = "dollar";
        index += delimiter.length;
        continue;
      }
    }
    if (character === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }

  if (state !== "code" && state !== "line") {
    throw new Error(
      "Migration SQL contains an unterminated comment or literal.",
    );
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function validateMigrationPolicy(
  policy: MigrationPolicy,
  journal: Journal,
  migrations: Readonly<Record<string, string>>,
): void {
  if (policy.version !== 1) {
    throw new Error("Migration policy version must be 1.");
  }
  if (policy.baselineThrough !== IMMUTABLE_BASELINE) {
    throw new Error(
      `Migration baseline is immutable at ${IMMUTABLE_BASELINE}; got ${policy.baselineThrough}.`,
    );
  }

  const configuredOperations = new Set(policy.prohibitedOperations);
  const knownOperations = Object.keys(
    prohibitedPatterns,
  ) as ProhibitedOperation[];
  for (const operation of knownOperations) {
    if (!configuredOperations.has(operation)) {
      throw new Error(
        `Migration policy omits prohibited operation ${operation}.`,
      );
    }
  }

  const tags = journal.entries.map(({ tag }) => tag);
  if (new Set(tags).size !== tags.length) {
    throw new Error("Migration journal contains duplicate tags.");
  }
  for (const [position, entry] of journal.entries.entries()) {
    if (entry.idx !== position) {
      throw new Error(
        `Migration journal index ${entry.idx} is not sequential at position ${position}.`,
      );
    }
    if (!(entry.tag in migrations)) {
      throw new Error(`Migration journal entry ${entry.tag} has no SQL file.`);
    }
  }
  for (const tag of Object.keys(migrations)) {
    if (!tags.includes(tag)) {
      throw new Error(`Migration SQL file ${tag} is absent from the journal.`);
    }
  }

  const baselineIndex = tags.indexOf(policy.baselineThrough);
  if (baselineIndex === -1) {
    throw new Error(
      `Migration baseline ${policy.baselineThrough} is absent from the journal.`,
    );
  }

  const futureTags = new Set(tags.slice(baselineIndex + 1));
  for (const waiver of policy.waivers) {
    if (!futureTags.has(waiver.migration)) {
      throw new Error(
        `Migration waiver ${waiver.migration} does not target a post-baseline migration.`,
      );
    }
    for (const field of [
      waiver.reason,
      waiver.approvedBy,
      waiver.approvedAt,
      waiver.approvalReference,
      waiver.rollbackPlan,
    ]) {
      if (!field.trim() || /^(?:tbd|todo|pending)$/iu.test(field.trim())) {
        throw new Error(
          `Migration waiver ${waiver.migration} contains incomplete written approval evidence.`,
        );
      }
    }
  }

  for (const tag of futureTags) {
    const sql = migrations[tag]!;
    const statements = normalizedSqlStatements(sql);
    const detected = knownOperations.filter((operation) =>
      statements.some((statement) => {
        if (!prohibitedPatterns[operation].test(statement)) return false;
        return (
          operation !== "unbounded-delete" || !/\bwhere\b/iu.test(statement)
        );
      }),
    );
    if (detected.length === 0) continue;

    const waiver = policy.waivers.find(({ migration }) => migration === tag);
    const waived = new Set(waiver?.operations ?? []);
    const unapproved = detected.filter((operation) => !waived.has(operation));
    if (unapproved.length > 0) {
      throw new Error(
        `${tag} contains prohibited migration operations without written approval: ${unapproved.join(", ")}.`,
      );
    }
  }
}

export function readMigrationInputs(): Readonly<{
  policy: MigrationPolicy;
  journal: Journal;
  migrations: Readonly<Record<string, string>>;
}> {
  const migrationFiles = fs
    .readdirSync(MIGRATION_DIRECTORY)
    .filter((filename) => /^\d{4}_.+\.sql$/u.test(filename))
    .sort();
  return {
    policy: JSON.parse(fs.readFileSync(POLICY_PATH, "utf8")) as MigrationPolicy,
    journal: JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as Journal,
    migrations: Object.fromEntries(
      migrationFiles.map((filename) => [
        filename.replace(/\.sql$/u, ""),
        fs.readFileSync(path.join(MIGRATION_DIRECTORY, filename), "utf8"),
      ]),
    ),
  };
}

function main(): void {
  const inputs = readMigrationInputs();
  validateMigrationPolicy(inputs.policy, inputs.journal, inputs.migrations);
  process.stdout.write(
    `${JSON.stringify({ status: "passed", check: "migration-policy", migrationCount: Object.keys(inputs.migrations).length })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
