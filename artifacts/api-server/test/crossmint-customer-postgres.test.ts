import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  ALPHA_WALLET_PROVISIONING_DISCLOSURE,
  CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION,
  CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
  PostgresCustomerOnboardingStore,
  PostgresCustomerIdentityCaseStore,
  PostgresCustomerWalletStore,
  PostgresPersistenceContext,
  assertPostgresRuntimeReady,
} from "@workspace/db";

const consent = {
  bundleVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
  documentVersion: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
  locale: "en-US",
  decision: "accepted" as const,
};
const result = (suffix = randomUUID().replaceAll("-", "")) => ({
  providerWalletRef: `evm:0x${suffix.repeat(40).slice(0, 40)}`,
  network: "evm",
  custodyModel: "smart-customer-email-recovery",
  publicAddress: `0x${suffix.repeat(40).slice(0, 40)}`,
  configurationVersion: CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION,
});

async function fixture(pool: pg.Pool, approved = true) {
  const context = new PostgresPersistenceContext(pool);
  const auth = {
    issuer: "https://crossmint-test.us.auth0.com/",
    subject: `auth0|${randomUUID()}`,
  };
  const onboarding = new PostgresCustomerOnboardingStore(context);
  const started = await onboarding.startAuth0Onboarding({
    ...auth,
    idempotencyKey: randomUUID(),
  });
  if (approved) {
    await onboarding.recordAuth0ConsentBundle({
      ...auth,
      idempotencyKey: randomUUID(),
      bundleVersion: ALPHA_ONBOARDING_CONSENT_BUNDLE.bundleVersion,
      locale: ALPHA_ONBOARDING_CONSENT_BUNDLE.locale,
      decisions: ALPHA_ONBOARDING_CONSENT_BUNDLE.documents.map((document) => ({
        consentType: document.consentType,
        documentVersion: document.documentVersion,
        decision: "accepted",
      })),
    });
    const cases = new PostgresCustomerIdentityCaseStore(context);
    const prepared = await cases.prepareAuth0IdentityCase({
      ...auth,
      idempotencyKey: randomUUID(),
    });
    const inquiry = `inq_fake_${randomUUID()}`;
    await cases.attachProviderInquiry({
      identityCaseId: prepared.snapshot.identityCaseId,
      providerRequestKey: prepared.providerRequestKey,
      providerInquiryRef: inquiry,
    });
    await cases.recordProviderEvent({
      identityCaseId: prepared.snapshot.identityCaseId,
      providerInquiryRef: inquiry,
      providerEventRef: randomUUID(),
      eventType: "inquiry.approved",
      decision: "approved",
      payloadDigest: "a".repeat(64),
    });
  }
  const policy = {
    mode: "crossmint-sandbox-customer" as const,
    allowedCustomerId: started.snapshot.customerId,
  };
  return {
    context,
    auth,
    policy,
    store: new PostgresCustomerWalletStore(context, policy),
    input: { ...auth, idempotencyKey: randomUUID(), consent },
  };
}

test("sandbox PostgreSQL wallet consent, ownership, immutable mapping, retries, and restriction gates", async (t) => {
  if (!process.env["TEST_DATABASE_URL"])
    throw new Error(
      "TEST_DATABASE_URL is required for sandbox wallet persistence tests.",
    );
  const pool = new pg.Pool({
    connectionString: process.env["TEST_DATABASE_URL"],
    max: 4,
  });
  try {
    await assertPostgresRuntimeReady(pool, {
      customerControlledSandboxWallets: true,
    });
    await t.test("startup rejects a disabled mapping guard", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "ALTER TABLE samra_core.customer_wallet_provider_mappings DISABLE TRIGGER customer_wallet_mapping_configuration_guard",
        );
        await assert.rejects(
          assertPostgresRuntimeReady(client, {
            customerControlledSandboxWallets: true,
          }),
          /migration is not ready/,
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
    await t.test(
      "identity approval and exact sandbox consent precede any wallet creation",
      async () => {
        const unapproved = await fixture(pool, false);
        await assert.rejects(
          unapproved.store.prepareAuth0Wallet(unapproved.input),
          /approved Samra-owned identity/,
        );
        const ready = await fixture(pool);
        await assert.rejects(
          ready.store.prepareAuth0Wallet({
            ...ready.input,
            consent: {
              ...consent,
              bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
              documentVersion:
                ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
            },
          }),
          /disclosure/,
        );
        const different = new PostgresCustomerWalletStore(ready.context, {
          mode: "crossmint-sandbox-customer",
          allowedCustomerId: `customer_${"0".repeat(32)}`,
        });
        await assert.rejects(
          different.prepareAuth0Wallet(ready.input),
          /restricted/,
        );
        await assert.rejects(
          ready.store.getAuth0Wallet(ready.auth),
          /does not have a wallet/,
        );
      },
    );
    await t.test(
      "concurrent preparation and retries preserve one durable command and mapping",
      async () => {
        const f = await fixture(pool);
        const [a, b] = await Promise.all([
          f.store.prepareAuth0Wallet(f.input),
          f.store.prepareAuth0Wallet(f.input),
        ]);
        assert.equal(a.snapshot.walletId, b.snapshot.walletId);
        assert.equal(a.providerRequestKey, b.providerRequestKey);
        assert.equal(a.snapshot.synthetic, false);
        assert.equal(a.ownerLocator, `userId:${f.policy.allowedCustomerId}`);
        await f.store.recordProviderStartFailure({
          walletId: a.snapshot.walletId,
          reasonFamily: "wallet_provider_unavailable",
        });
        const retry = await f.store.prepareAuth0Wallet(f.input);
        assert.equal(retry.providerRequestKey, a.providerRequestKey);
        const initialResult = result();
        const attached = await f.store.attachProviderWallet({
          walletId: a.snapshot.walletId,
          providerRequestKey: a.providerRequestKey,
          result: initialResult,
        });
        assert.equal(attached.state, "ready");
        assert.deepEqual(attached.nextAllowedActions, [
          "await_customer_signer_setup",
        ]);
        const restarted = new PostgresCustomerWalletStore(
          new PostgresPersistenceContext(pool),
          f.policy,
        );
        assert.deepEqual(await restarted.getAuth0Wallet(f.auth), attached);
        assert.equal(
          (await restarted.prepareAuth0Wallet(f.input)).snapshot.version,
          attached.version,
        );
        await assert.rejects(
          restarted.prepareAuth0Wallet({
            ...f.input,
            idempotencyKey: randomUUID(),
          }),
          /different idempotency/,
        );
        const fake = new PostgresCustomerWalletStore(f.context);
        await assert.rejects(
          fake.prepareAuth0Wallet({
            ...f.input,
            consent: {
              ...consent,
              bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
              documentVersion:
                ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
            },
          }),
          /different provider configuration/,
        );
        const conflict = await restarted.attachProviderWallet({
          walletId: a.snapshot.walletId,
          providerRequestKey: a.providerRequestKey,
          result: result("2"),
        });
        assert.equal(conflict.state, "restricted");
        assert.equal(conflict.publicAddress, initialResult.publicAddress);
      },
    );
    await t.test(
      "database rejects mappings that disagree with the wallet configuration",
      async () => {
        const f = await fixture(pool);
        const prepared = await f.store.prepareAuth0Wallet(f.input);
        await assert.rejects(
          pool.query(
            `INSERT INTO samra_core.customer_wallet_provider_mappings
        (wallet_id,provider,provider_wallet_ref,network,custody_model,public_address,configuration_version)
        SELECT id,'crossmint','fake-invalid','synthetic','synthetic',NULL,configuration_version
        FROM samra_core.customer_wallets WHERE external_ref=$1`,
            [prepared.snapshot.walletId],
          ),
          (error: unknown) => (error as { code: string }).code === "23514",
        );
        await assert.rejects(
          f.store.attachProviderWallet({
            walletId: prepared.snapshot.walletId,
            providerRequestKey: "0".repeat(64),
            result: result("3"),
          }),
          /does not belong/,
        );
      },
    );
    await t.test(
      "a restriction received during the provider call prevents readiness and retry",
      async () => {
        const f = await fixture(pool);
        const prepared = await f.store.prepareAuth0Wallet(f.input);
        await pool.query(
          `UPDATE samra_core.customer_onboardings SET state='restricted',version=version+1
        WHERE customer_id=(SELECT id FROM samra_core.customers WHERE external_ref=$1)`,
          [f.policy.allowedCustomerId],
        );
        await assert.rejects(
          f.store.attachProviderWallet({
            walletId: prepared.snapshot.walletId,
            providerRequestKey: prepared.providerRequestKey,
            result: result("4"),
          }),
          /state transition/,
        );
        await assert.rejects(
          f.store.prepareAuth0Wallet(f.input),
          /state transition/,
        );
        assert.equal(
          (await f.store.getAuth0Wallet(f.auth)).state,
          "provisioning",
        );
      },
    );
  } finally {
    await pool.end();
  }
});
