import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PostgresPersistenceContext } from "./postgres-persistence";
import {
  MarketingLeadTokenKeys,
  PostgresMarketingLeadStore,
  safeLeadAttribution,
} from "./postgres-marketing-leads";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "TEST_DATABASE_URL must name an isolated disposable database",
  );
const pool = new pg.Pool({ connectionString, max: 8 });
const keys = new MarketingLeadTokenKeys({ v1: randomBytes(32) }, "v1");
const store = new PostgresMarketingLeadStore(
  new PostgresPersistenceContext(pool),
  keys,
);
const input = {
  email: "reader@example.test",
  emailConsent: true as const,
  adsConsent: false,
  noticeVersion: "marketing-2026-09-09",
  locale: "en" as const,
  idempotencyKey: "signup-command-001",
  attribution: {
    source: "instagram",
    medium: "social",
    campaign: "social_profile",
    email: "private@example.test",
  },
};
async function reset() {
  await pool.query(
    "TRUNCATE samra_core.marketing_audience_removals,samra_core.marketing_lead_permissions,samra_core.marketing_lead_challenges,samra_core.marketing_lead_requests,samra_core.marketing_lead_profiles CASCADE",
  );
}
async function profile() {
  return (await pool.query("SELECT * FROM samra_core.marketing_lead_profiles"))
    .rows[0];
}
async function pending() {
  await store.register(input);
  const message = await store.claimVerificationEmail();
  assert.ok(message);
  return message;
}

test("verified marketing leads on PostgreSQL", async (t) => {
  try {
    await t.test(
      "request replays durably; only approved attribution survives",
      async () => {
        await reset();
        const results = await Promise.all([
          store.register(input),
          store.register(input),
        ]);
        assert.deepEqual(results, [{ accepted: true }, { accepted: true }]);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*) FROM samra_core.marketing_lead_challenges",
            )
          ).rows[0].count,
          "1",
        );
        await assert.rejects(
          store.register({ ...input, email: "other@example.test" }),
          /IDEMPOTENCY_CONFLICT/,
        );
        assert.equal((await profile()).verified_at, null);
        assert.equal((await profile()).ads_allowed, false);
        const raw = (
          await pool.query(
            "SELECT attribution,token_digest FROM samra_core.marketing_lead_challenges",
          )
        ).rows[0];
        assert.equal(raw.attribution.email, undefined);
        assert.match(raw.token_digest, /^[a-f0-9]{64}$/);
      },
    );
    await t.test(
      "one-time confirmation is atomic; advertising is not inferred",
      async () => {
        await reset();
        const message = await pending();
        const results = await Promise.all([
          store.confirm(message.token),
          store.confirm(message.token),
        ]);
        assert.equal(results.filter(Boolean).length, 1);
        const p = await profile();
        assert.ok(p.verified_at);
        assert.equal(p.email_active, true);
        assert.equal(p.ads_allowed, false);
        const rows = (
          await pool.query(
            "SELECT purpose,granted FROM samra_core.marketing_lead_permissions ORDER BY purpose",
          )
        ).rows;
        assert.deepEqual(rows, [
          { purpose: "ads_matching", granted: false },
          { purpose: "email_updates", granted: true },
        ]);
        await assert.rejects(
          pool.query(
            "UPDATE samra_core.marketing_lead_permissions SET granted=true",
          ),
          /append-only/,
        );
      },
    );
    await t.test(
      "opt-in requires verified possession, and withdrawal queues both removals",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        assert.equal((await profile()).ads_allowed, false);
        await store.confirm(m.token, true);
        const p = await profile();
        assert.equal(p.ads_allowed, true);
        await store.withdraw(
          p.contact_id,
          "unsubscribed",
          "withdraw-command-001",
        );
        await store.withdraw(
          p.contact_id,
          "unsubscribed",
          "withdraw-command-001",
        );
        const removed = await profile();
        assert.equal(removed.ads_allowed, false);
        assert.equal(removed.email_active, false);
        const removals = (
          await pool.query(
            "SELECT destination,revision,completed_revision FROM samra_core.marketing_audience_removals ORDER BY destination",
          )
        ).rows;
        assert.deepEqual(removals, [
          { destination: "google", revision: 1, completed_revision: 0 },
          { destination: "meta", revision: 1, completed_revision: 0 },
        ]);
        await store.register({ ...input, idempotencyKey: "new-command-001" });
        assert.equal(await store.claimVerificationEmail(), null);
      },
    );
    await t.test(
      "advertising withdrawal preserves email and cancels stale advertising grants",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        await store.confirm(m.token, true);
        const p = await profile();
        await store.withdrawAdvertising(p.contact_id, "withdraw-ads-001");
        await store.withdrawAdvertising(p.contact_id, "withdraw-ads-001");
        assert.equal((await profile()).email_active, true);
        assert.equal((await profile()).ads_allowed, false);
        assert.equal((await profile()).suppressed_at, null);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*) FROM samra_core.marketing_lead_permissions WHERE reason='withdrawn'",
            )
          ).rows[0].count,
          "1",
        );
      },
    );
    await t.test(
      "requested advertising requires a second explicit checkbox",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        await store.confirm(m.token, false);
        assert.equal((await profile()).ads_allowed, false);
        assert.equal((await profile()).email_active, true);
      },
    );
    await t.test(
      "withdrawal racing confirmation cannot leave permission active",
      async () => {
        await reset();
        const m = await pending();
        const p = await profile();
        await Promise.all([
          store.confirm(m.token),
          store.withdraw(p.contact_id, "withdrawn", "withdraw-race-001"),
        ]);
        assert.equal((await profile()).email_active, false);
        assert.equal(await store.confirm(m.token), false);
      },
    );
    await t.test(
      "expired and cancelled links cannot grant permission",
      async () => {
        await reset();
        const m = await pending();
        await pool.query(
          "UPDATE samra_core.marketing_lead_challenges SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'",
        );
        assert.equal(await store.confirm(m.token), false);
        assert.equal(await store.confirm("not-a-token"), false);
      },
    );
    await t.test(
      "resend invalidates old link; cooldown receipts do not later send",
      async () => {
        await reset();
        const m = await pending();
        const cooled = { ...input, idempotencyKey: "cooldown-command-001" };
        await store.register(cooled);
        await pool.query(
          "UPDATE samra_core.marketing_lead_challenges SET created_at=created_at-interval '2 minutes',expires_at=expires_at-interval '2 minutes'",
        );
        await store.register(cooled);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*) FROM samra_core.marketing_lead_challenges",
            )
          ).rows[0].count,
          "1",
        );
        await store.register({
          ...input,
          idempotencyKey: "resend-command-001",
        });
        assert.equal(await store.confirm(m.token), false);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*) FROM samra_core.marketing_lead_challenges WHERE cancelled_at IS NULL",
            )
          ).rows[0].count,
          "1",
        );
      },
    );
    await t.test(
      "worker claims are exclusive and retry tokens remain stable",
      async () => {
        await reset();
        await store.register(input);
        const claimed = await Promise.all([
          store.claimVerificationEmail(),
          store.claimVerificationEmail(),
        ]);
        const m = claimed.find(Boolean)!;
        assert.ok(m);
        assert.equal(claimed.filter(Boolean).length, 1);
        await pool.query(
          "UPDATE samra_core.marketing_lead_challenges SET lease_until=now()-interval '1 minute'",
        );
        const retry = await store.claimVerificationEmail();
        assert.ok(retry);
        assert.equal(retry.token, m.token);
        assert.equal(retry.idempotencyKey, m.idempotencyKey);
        assert.notEqual(retry.leaseId, m.leaseId);
        assert.equal(
          await store.deliverVerificationEmail(m.id, m.leaseId, async () => {
            throw new Error("stale lease dispatched");
          }),
          false,
        );
        let sends = 0;
        assert.equal(
          await store.deliverVerificationEmail(
            retry.id,
            retry.leaseId,
            async () => {
              sends++;
            },
          ),
          true,
        );
        assert.equal(sends, 1);
        assert.equal(await store.claimVerificationEmail(), null);
      },
    );
    await t.test(
      "withdrawal cancels even an already claimed email before dispatch",
      async () => {
        await reset();
        const m = await pending();
        await store.withdraw(
          (await profile()).contact_id,
          "complained",
          "complaint-command-001",
        );
        let sends = 0;
        assert.equal(
          await store.deliverVerificationEmail(m.id, m.leaseId, async () => {
            sends++;
          }),
          false,
        );
        assert.equal(sends, 0);
      },
    );
    await t.test(
      "sender failure is retryable without recording sent or verified state",
      async () => {
        await reset();
        const m = await pending();
        await assert.rejects(
          store.deliverVerificationEmail(m.id, m.leaseId, async () => {
            throw new Error("synthetic provider failure");
          }),
          /synthetic/,
        );
        assert.equal((await profile()).verified_at, null);
        assert.equal(
          (
            await pool.query(
              "SELECT sent_at FROM samra_core.marketing_lead_challenges",
            )
          ).rows[0].sent_at,
          null,
        );
      },
    );
    await t.test("missing rotated key fails closed", async () => {
      await reset();
      await store.register(input);
      const wrong = new PostgresMarketingLeadStore(
        new PostgresPersistenceContext(pool),
        new MarketingLeadTokenKeys({ v2: randomBytes(32) }, "v2"),
      );
      await assert.rejects(wrong.claimVerificationEmail(), /KEY_UNAVAILABLE/);
    });
    assert.deepEqual(
      safeLeadAttribution({
        source: "customer@email.test",
        medium: "social",
        campaign: "social_profile",
      }),
      {},
    );
  } finally {
    await pool.end();
  }
});
