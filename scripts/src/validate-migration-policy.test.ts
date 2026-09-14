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

  it("locks wallet evidence and preserves only the deployed synthetic rollback contract", () => {
    const migration =
      readMigrationInputs().migrations["0021_customer_wallet_control_setup"];
    expect(migration).toBeDefined();
    const sql = migration!;
    const preflightIndex = sql.indexOf("DO $$");
    const triggerIndex = sql.indexOf(
      'CREATE TRIGGER "customer_wallets_controlled_mutation"',
    );
    const walletGuardIndex = sql.indexOf(
      'CREATE OR REPLACE FUNCTION "samra_core"."guard_customer_wallet_mutation"',
    );
    const walletGuard = sql.slice(walletGuardIndex, triggerIndex);

    expect(sql.indexOf("LOCK TABLE")).toBe(0);
    expect(preflightIndex).toBeGreaterThan(0);
    expect(triggerIndex).toBeGreaterThan(preflightIndex);
    const preflightLock = sql.slice(0, preflightIndex);
    for (const table of [
      "customer_wallets",
      "customer_onboardings",
      "customer_consents",
      "customer_wallet_provider_mappings",
    ]) {
      expect(preflightLock).toContain(`"samra_core"."${table}"`);
    }
    expect(preflightLock).toContain("IN SHARE MODE;");
    expect(sql).toContain("IF TG_OP = 'INSERT' THEN");
    expect(sql).toContain("NEW.\"state\" <> 'created'");
    expect(sql).toContain("'alpha-non-production-v2'");
    expect(sql).toContain("'alpha-wallet-non-production-v2'");
    expect(sql).toContain("'sandbox-customer-wallet-v2'");
    expect(walletGuard).toContain("836f76bd368e9d81c633d7483e48b907c42ef775");
    expect(walletGuard).toContain("'alpha-non-production-v1'");
    expect(walletGuard).toContain("'alpha-wallet-non-production-v1'");
    expect(walletGuard).toContain("NEW.\"environment\" <> 'synthetic'");
    expect(walletGuard).toContain("OLD.\"environment\" <> 'synthetic'");
    expect(walletGuard).not.toContain("'sandbox-customer-wallet-v1'");
    expect(sql).toContain(
      "customer wallet creation requires an approved onboarding consent bundle",
    );
    expect(sql).toContain(
      "wallet capability transitions require an approved wallet disclosure",
    );
    expect(sql).toContain(
      'BEFORE INSERT OR UPDATE OR DELETE ON "samra_core"."customer_wallets"',
    );
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
