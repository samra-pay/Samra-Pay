import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabase } from "@workspace/db";
import { runPersonaJourneys } from "./runtime";
import type { PersonaManifest } from "./contract";

const connectionString = process.env.SAMRA_PERSONA_LAB_TEST_DATABASE_URL;
const ownedRunId = process.env.SAMRA_PERSONA_LAB_RUN_ID;
const manifest: PersonaManifest = {
  schemaVersion: 1,
  personas: [
    {
      alias: "sender",
      displayName: "Synthetic Sender",
      openingBalanceMinor: "10000",
    },
    {
      alias: "limited",
      displayName: "Synthetic Limited",
      openingBalanceMinor: "50",
    },
  ],
};

test("runtime rejects an unowned database before changing process configuration", async () => {
  const marker = process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE;
  const previous = process.env.DATABASE_URL;
  try {
    delete process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE;
    await assert.rejects(
      runPersonaJourneys(manifest, {
        connectionString:
          "postgresql://fixture:fixture@127.0.0.1:65534/samra_test",
        runId: randomUUID(),
      }),
      { message: "PERSONA_DATABASE_OWNERSHIP_REQUIRED" },
    );
    assert.equal(process.env.DATABASE_URL, previous);
  } finally {
    if (marker === undefined)
      delete process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE;
    else process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE = marker;
  }
});

test("runtime requires a fresh container proof before changing process configuration", async () => {
  const marker = process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE;
  const container = process.env.SAMRA_PERSONA_LAB_CONTAINER_ID;
  const previous = process.env.DATABASE_URL;
  try {
    process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE = "true";
    delete process.env.SAMRA_PERSONA_LAB_CONTAINER_ID;
    await assert.rejects(
      runPersonaJourneys(manifest, {
        connectionString:
          "postgresql://fixture:fixture@127.0.0.1:65534/samra_test",
        runId: randomUUID(),
      }),
      { message: "PERSONA_CONTAINER_PROOF_REQUIRED" },
    );
    assert.equal(process.env.DATABASE_URL, previous);
  } finally {
    if (marker === undefined)
      delete process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE;
    else process.env.SAMRA_PERSONA_LAB_OWNED_DATABASE = marker;
    if (container === undefined)
      delete process.env.SAMRA_PERSONA_LAB_CONTAINER_ID;
    else process.env.SAMRA_PERSONA_LAB_CONTAINER_ID = container;
  }
});

test(
  "two artificial personas traverse the authorized API and durable financial lifecycle",
  {
    skip: connectionString
      ? false
      : "SAMRA_PERSONA_LAB_TEST_DATABASE_URL must name a pristine migrated database with its owning CLI proof",
    timeout: 60_000,
  },
  async () => {
    assert.ok(connectionString);
    assert.ok(ownedRunId);
    const previous = process.env.DATABASE_URL;
    const wrongProof = await runPersonaJourneys(manifest, {
      connectionString,
      runId: randomUUID(),
    });
    assert.equal(
      wrongProof.find(({ id }) => id === "environment")?.status,
      "failed",
    );
    assert.ok(
      wrongProof
        .filter(({ id }) => id !== "environment" && id !== "cleanup")
        .every(({ status }) => status === "blocked"),
    );
    assert.equal(
      wrongProof.find(({ id }) => id === "cleanup")?.status,
      "passed",
    );
    const verification = createDatabase({
      connectionString,
      poolConfig: { max: 1 },
    });
    try {
      const empty = await verification.pool.query(`SELECT
      (SELECT count(*)::int FROM samra_core.customers) AS customers,
      (SELECT count(*)::int FROM samra_core.alpha_invitations) AS invitations,
      (SELECT count(*)::int FROM samra_core.ledger_journals) AS journals,
      (SELECT count(*)::int FROM samra_core.remittance_transfers) AS transfers`);
      assert.deepEqual(empty.rows, [
        { customers: 0, invitations: 0, journals: 0, transfers: 0 },
      ]);
    } finally {
      await verification.pool.end();
    }
    const results = await runPersonaJourneys(manifest, {
      connectionString,
      runId: ownedRunId,
    });
    assert.deepEqual(
      results.map(({ id }) => id),
      [
        "environment",
        "admission",
        "onboarding-sender",
        "onboarding-limited",
        "funding",
        "beneficiaries",
        "transfer-success",
        "duplicate-retry",
        "insufficient-funds",
        "account-isolation",
        "payout-refund",
        "restart-persistence",
        "ledger-integrity",
        "cleanup",
      ],
    );
    assert.deepEqual(
      results.filter(({ status }) => status !== "passed"),
      [],
    );
    assert.equal(process.env.DATABASE_URL, previous);
    assert.equal(
      results.find(({ id }) => id === "funding")?.observations.fundedPersonas,
      2,
    );
    assert.equal(
      results.find(({ id }) => id === "transfer-success")?.observations
        .captureCount,
      1,
    );
    assert.equal(
      results.find(({ id }) => id === "ledger-integrity")?.observations
        .projectionMismatches,
      0,
    );
    assert.doesNotMatch(
      JSON.stringify(results),
      /postgres(?:ql)?:\/\/|Bearer |auth0\||persona-lab\.invalid/u,
    );

    // A repeat on a populated database must fail before modifying any fixtures.
    const repeat = await runPersonaJourneys(manifest, {
      connectionString,
      runId: ownedRunId,
    });
    assert.equal(
      repeat.find(({ id }) => id === "environment")?.status,
      "failed",
    );
    assert.ok(
      repeat
        .filter(({ id }) => id !== "environment" && id !== "cleanup")
        .every(({ status }) => status === "blocked"),
    );
    assert.equal(repeat.find(({ id }) => id === "cleanup")?.status, "passed");
  },
);
