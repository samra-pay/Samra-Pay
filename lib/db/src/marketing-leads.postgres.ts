import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PostgresMarketingActivationStore } from "./postgres-marketing-activation";
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
const context = new PostgresPersistenceContext(pool);
const store = new PostgresMarketingLeadStore(context, keys);
const activation = new PostgresMarketingActivationStore(context, store);
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
    "TRUNCATE samra_core.marketing_email_suppressions,samra_core.marketing_provider_events,samra_core.marketing_request_limits,samra_core.marketing_audience_removals,samra_core.marketing_lead_permissions,samra_core.marketing_lead_challenges,samra_core.marketing_lead_requests,samra_core.marketing_lead_profiles CASCADE",
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
    await t.test(
      "signed-event application deduplicates and never re-enables",
      async () => {
        await reset();
        const m = await pending();
        await store.confirm(m.token);
        const event = {
          id: "msg_synthetic_001",
          payloadHash: "a".repeat(64),
          type: "email.complained",
          email: input.email,
          reason: "complained" as const,
        };
        await activation.providerEvent(event);
        await activation.providerEvent(event);
        assert.equal((await profile()).email_active, false);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*) FROM samra_core.marketing_provider_events",
            )
          ).rows[0].count,
          "1",
        );
        await assert.rejects(
          activation.providerEvent({ ...event, payloadHash: "b".repeat(64) }),
          /CONFLICT/,
        );
      },
    );
    await t.test(
      "provider suppression before signup prevents confirmation mail",
      async () => {
        await reset();
        await activation.providerEvent({
          id: "msg_before_signup",
          payloadHash: "a".repeat(64),
          type: "suppression.added",
          email: input.email,
          reason: "unsubscribed",
        });
        await store.register(input);
        assert.equal(await store.claimVerificationEmail(), null);
      },
    );
    await t.test(
      "global request budgets are shared atomically across workers",
      async () => {
        await reset();
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            activation.allowRequest("register", 3),
          ),
        );
        assert.equal(results.filter(Boolean).length, 3);
      },
    );
    await t.test(
      "audience adds require confirmation; pending add completes before withdrawal removal",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const calls: boolean[] = [];
        const adapter = {
          submit: async ({ member }: { email: string; member: boolean }) => {
            calls.push(member);
            return { state: "pending" as const, requestId: "request-1" };
          },
          status: async () => "accepted" as const,
        };
        assert.equal(
          (await activation.runAudience("google", adapter)).processed,
          false,
        );
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        await store.confirm(m.token, true);
        await activation.runAudience("google", adapter);
        await store.withdrawAdvertising(
          (await profile()).contact_id,
          "withdraw-before-complete",
        );
        await pool.query(
          "UPDATE samra_core.marketing_audience_sync SET next_attempt_at=now()-interval '1 minute'",
        );
        await activation.runAudience("google", adapter);
        assert.deepEqual(calls, [true]);
        await pool.query(
          "UPDATE samra_core.marketing_audience_sync SET next_attempt_at=now()-interval '1 minute'",
        );
        await activation.runAudience("google", adapter);
        assert.deepEqual(calls, [true, false]);
      },
    );
    await t.test(
      "ambiguous upload blocks automatic replay and exposes operational backlog",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        await store.confirm(m.token, true);
        let calls = 0;
        const adapter = {
          submit: async () => {
            calls++;
            throw new Error("synthetic timeout");
          },
          status: async () => "accepted" as const,
        };
        await activation.runAudience("meta", adapter);
        await activation.runAudience("meta", adapter);
        assert.equal(calls, 1);
        const metrics = await activation.metrics();
        assert.equal(
          metrics.pending.find((r) => r.destination === "meta")?.state,
          "uncertain",
        );
      },
    );
    await t.test(
      "concurrent audience workers submit once and recheck consent",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        await store.confirm(m.token, true);
        let calls = 0;
        const adapter = {
          submit: async () => {
            calls++;
            return { state: "accepted" as const, requestId: "receipt-1" };
          },
          status: async () => "accepted" as const,
        };
        await Promise.all([
          activation.runAudience("meta", adapter),
          activation.runAudience("meta", adapter),
        ]);
        assert.equal(calls, 1);
        await store.withdrawAdvertising(
          (await profile()).contact_id,
          "withdraw-concurrent-1",
        );
        await pool.query(
          "UPDATE samra_core.marketing_audience_sync SET next_attempt_at=now()-interval '1 minute'",
        );
        const submitted: boolean[] = [];
        await activation.runAudience("meta", {
          ...adapter,
          submit: async ({ member }) => {
            submitted.push(member);
            return { state: "accepted", requestId: "remove-1" };
          },
        });
        assert.deepEqual(submitted, [false]);
      },
    );
    await t.test(
      "Resend sync follows email permission independently of advertising",
      async () => {
        await reset();
        const m = await pending();
        await store.confirm(m.token, false);
        const calls: boolean[] = [];
        const adapter = {
          submit: async ({ member }: { email: string; member: boolean }) => {
            calls.push(member);
            return { state: "accepted" as const, requestId: "resend-contact" };
          },
          status: async () => "accepted" as const,
        };
        await activation.runAudience("resend", adapter);
        assert.deepEqual(calls, [true]);
        await store.withdraw(
          (await profile()).contact_id,
          "unsubscribed",
          "full-unsubscribe-resend",
        );
        await pool.query(
          "UPDATE samra_core.marketing_audience_sync SET next_attempt_at=now()-interval '1 minute'",
        );
        await activation.runAudience("resend", adapter);
        assert.deepEqual(calls, [true, false]);
      },
    );
    await t.test(
      "uncertain outcome reconciliation is revision-bound and recorded immutably",
      async () => {
        await reset();
        await store.register({ ...input, adsConsent: true });
        const m = await store.claimVerificationEmail();
        assert.ok(m);
        await store.confirm(m.token, true);
        await activation.runAudience("meta", {
          submit: async () => {
            throw new Error("synthetic timeout");
          },
          status: async () => "accepted",
        });
        const id = (await profile()).contact_id;
        await assert.rejects(
          activation.reconcileAudience({
            contactId: id,
            destination: "meta",
            submittedRevision: 2,
            disposition: "accepted",
            evidenceDigest: "a".repeat(64),
          }),
          /STALE/,
        );
        await activation.reconcileAudience({
          contactId: id,
          destination: "meta",
          submittedRevision: 1,
          disposition: "accepted",
          evidenceDigest: "a".repeat(64),
        });
        assert.equal(
          (
            await pool.query(
              "SELECT state FROM samra_core.marketing_audience_sync WHERE destination='meta'",
            )
          ).rows[0].state,
          "idle",
        );
        await assert.rejects(
          pool.query(
            "DELETE FROM samra_core.marketing_audience_reconciliations",
          ),
          /append-only/,
        );
      },
    );
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
