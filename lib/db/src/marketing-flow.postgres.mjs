import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PostgresPersistenceContext } from "./postgres-persistence.ts";
import {
  MarketingLeadTokenKeys,
  PostgresMarketingLeadStore,
} from "./postgres-marketing-leads.ts";
import { PostgresMarketingActivationStore } from "./postgres-marketing-activation.ts";
import { createMarketingApplication } from "../../launch-updates/src/marketing-runtime.mjs";
import { createPreferenceTokens } from "../../launch-updates/src/preference-tokens.mjs";

const origin = "https://www.samrapay.com";
test("synthetic full flow: form, email, confirmation, provider acceptance and separate withdrawal", async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error("DISPOSABLE_TEST_DATABASE_REQUIRED");
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    await pool.query(
      "TRUNCATE samra_core.marketing_lead_profiles,samra_core.marketing_provider_events,samra_core.marketing_request_limits,samra_core.marketing_email_suppressions CASCADE",
    );
    const context = new PostgresPersistenceContext(pool),
      keys = { v1: randomBytes(32) },
      leads = new PostgresMarketingLeadStore(
        context,
        new MarketingLeadTokenKeys(keys, "v1"),
      ),
      activation = new PostgresMarketingActivationStore(context, leads);
    const emails = [],
      audiences = [];
    const app = createMarketingApplication({
      leads,
      activation,
      preferenceTokens: createPreferenceTokens({ keys, activeVersion: "v1" }),
      webhookSecret: "whsec_" + randomBytes(32).toString("base64"),
      emailTransport: {
        getSuppression: async () => null,
        getContact: async () => null,
        sendConfirmation: async (message) => {
          emails.push(message);
          return { id: "synthetic-message" };
        },
      },
      audienceAdapters: {
        meta: {
          submit: async ({ member }) => {
            audiences.push(member);
            return { state: "accepted", requestId: "synthetic-receipt" };
          },
          status: async () => "accepted",
        },
      },
    });
    const post = (path, body) =>
      app.handle(
        new Request(origin + path, {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            "idempotency-key": "full-flow-signup-001",
          },
          body: JSON.stringify(body),
        }),
      );
    assert.equal(
      (
        await post("/api/v1/marketing-leads", {
          email: "full-flow@example.test",
          emailConsent: true,
          adsConsent: true,
          noticeVersion: "marketing-2026-09-09",
          locale: "en",
          website: "",
          attribution: {},
        })
      ).status,
      202,
    );
    assert.equal((await app.workOnce()).email.processed, true);
    assert.equal(emails.length, 1);
    assert.equal(audiences.length, 0);
    const token = emails[0].text.match(/\/confirm-email#([A-Za-z0-9_-]+)/)[1];
    const page = await app.handle(new Request(origin + "/confirm-email"));
    assert.equal(page.status, 200);
    assert.equal((await activation.metrics()).leads.verified, 0);
    const confirmation = await post("/api/v1/marketing-leads/confirm", {
      token,
      adsConsent: true,
    });
    const confirmed = await confirmation.json();
    assert.equal(confirmed.confirmed, true);
    assert.match(confirmed.preferencesUrl, /^\/email-preferences#/);
    await app.workOnce();
    assert.deepEqual(audiences, [true]);
    const preferenceToken = confirmed.preferencesUrl.split("#")[1];
    assert.equal(
      (
        await post("/api/v1/marketing-leads/preferences", {
          token: preferenceToken,
          scope: "ads",
        })
      ).status,
      200,
    );
    assert.equal((await activation.metrics()).leads.email_active, 1);
    assert.equal((await activation.metrics()).leads.advertising_allowed, 0);
    await pool.query(
      "UPDATE samra_core.marketing_audience_sync SET next_attempt_at=now()-interval '1 minute'",
    );
    await app.workOnce();
    assert.deepEqual(audiences, [true, false]);
    assert.equal(
      (
        await post("/api/v1/marketing-leads/preferences", {
          token: preferenceToken,
          scope: "all",
        })
      ).status,
      200,
    );
    assert.equal((await activation.metrics()).leads.email_active, 0);
    assert.equal(
      (await app.handle(new Request(origin + "/metrics"))).status,
      404,
    );
  } finally {
    await pool.end();
  }
});
