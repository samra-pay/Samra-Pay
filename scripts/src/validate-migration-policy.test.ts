import { describe, expect, it } from "vitest";

import {
  readMigrationInputs,
  validateMigrationPolicy,
} from "./validate-migration-policy";

const basePolicy = {
  version: 1,
  baselineThrough: "0016_marketing_waitlist",
  prohibitedOperations: [
    "drop-table",
    "drop-column",
    "drop-type",
    "truncate-table",
    "rename-table-or-column",
    "alter-column-type",
    "unbounded-delete",
  ],
  waivers: [],
} as const;

describe("forward-only migration policy", () => {
  it("accepts the checked-in migration journal and SQL files", () => {
    const inputs = readMigrationInputs();
    expect(() =>
      validateMigrationPolicy(inputs.policy, inputs.journal, inputs.migrations),
    ).not.toThrow();
  });

  it("rejects an unapproved destructive migration", () => {
    expect(() =>
      validateMigrationPolicy(
        basePolicy,
        {
          entries: [
            { idx: 0, tag: "0016_marketing_waitlist" },
            { idx: 1, tag: "0017_remove_money" },
          ],
        },
        {
          "0016_marketing_waitlist": "CREATE TABLE balances (id text);",
          "0017_remove_money": "DROP TABLE balances;",
        },
      ),
    ).toThrow(/drop-table/u);
  });

  it("requires complete written approval and rollback evidence for a waiver", () => {
    expect(() =>
      validateMigrationPolicy(
        {
          ...basePolicy,
          waivers: [
            {
              migration: "0017_remove_money",
              operations: ["drop-table"],
              reason: "Approved replacement",
              approvedBy: "TBD",
              approvedAt: "2026-09-02",
              approvalReference: "SEC-123",
              rollbackPlan: "Restore the isolated pre-migration snapshot.",
            },
          ],
        },
        {
          entries: [
            { idx: 0, tag: "0016_marketing_waitlist" },
            { idx: 1, tag: "0017_remove_money" },
          ],
        },
        {
          "0016_marketing_waitlist": "CREATE TABLE balances (id text);",
          "0017_remove_money": "DROP TABLE balances;",
        },
      ),
    ).toThrow(/incomplete written approval evidence/u);
  });

  it("does not let a later bounded delete hide an earlier unbounded delete", () => {
    expect(() =>
      validateMigrationPolicy(
        basePolicy,
        {
          entries: [
            { idx: 0, tag: "0016_marketing_waitlist" },
            { idx: 1, tag: "0017_delete_rows" },
          ],
        },
        {
          "0016_marketing_waitlist": "CREATE TABLE balances (id text);",
          "0017_delete_rows":
            "DELETE FROM balances; DELETE FROM transfers WHERE id = 'synthetic';",
        },
      ),
    ).toThrow(/unbounded-delete/u);
  });

  it("does not treat WHERE inside comments or literals as a delete bound", () => {
    for (const sql of [
      "DELETE FROM balances /* WHERE legacy_id = 1 */;",
      "DELETE FROM balances -- WHERE legacy_id = 1\n;",
      "DELETE FROM balances RETURNING 'WHERE id = 1';",
      "DELETE FROM balances RETURNING $$WHERE id = 1$$;",
    ]) {
      expect(() =>
        validateMigrationPolicy(
          basePolicy,
          {
            entries: [
              { idx: 0, tag: "0016_marketing_waitlist" },
              { idx: 1, tag: "0017_delete_rows" },
            ],
          },
          {
            "0016_marketing_waitlist": "CREATE TABLE balances (id text);",
            "0017_delete_rows": sql,
          },
        ),
      ).toThrow(/unbounded-delete/u);
    }
  });

  it("rejects moving the immutable baseline forward in the same change", () => {
    expect(() =>
      validateMigrationPolicy(
        { ...basePolicy, baselineThrough: "0017_remove_money" },
        { entries: [{ idx: 0, tag: "0017_remove_money" }] },
        { "0017_remove_money": "DROP TABLE balances;" },
      ),
    ).toThrow(/baseline is immutable/u);
  });
});
