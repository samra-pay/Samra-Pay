import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  createDatabase,
  type DatabaseConnection,
  ALPHA_ONBOARDING_CONSENT_BUNDLE,
  ALPHA_WALLET_CONFIGURATION_VERSION,
  ALPHA_WALLET_PROVISIONING_DISCLOSURE,
  CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION,
  CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
  CustomerOnboardingAccessRestrictedError,
  PostgresCustomerOnboardingStore,
  PostgresCustomerIdentityCaseStore,
  PostgresCustomerWalletStore,
  PostgresPersistenceContext,
  assertPostgresRuntimeReady,
} from "@workspace/db";
import { CustomerWalletProvisioningService } from "../src/domain/customer-wallet";

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

async function fixture(pool: DatabaseConnection["pool"], approved = true) {
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
  let identityCaseId: string | null = null;
  let providerInquiryRef: string | null = null;
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
    identityCaseId = prepared.snapshot.identityCaseId;
    providerInquiryRef = inquiry;
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
    identityCaseId,
    providerInquiryRef,
    store: new PostgresCustomerWalletStore(context, policy),
    input: { ...auth, idempotencyKey: randomUUID(), consent },
  };
}

test("sandbox PostgreSQL wallet consent, ownership, immutable mapping, retries, and restriction gates", async (t) => {
  if (!process.env["TEST_DATABASE_URL"])
    throw new Error(
      "TEST_DATABASE_URL is required for sandbox wallet persistence tests.",
    );
  const { pool } = createDatabase({
    connectionString: process.env["TEST_DATABASE_URL"],
    poolConfig: { max: 4 },
  });
  try {
    await assertPostgresRuntimeReady(pool, {
      customerWalletControls: true,
    });
    await t.test(
      "startup rejects disabled sandbox evidence guards",
      async (t) => {
        const guards = [
          {
            table: "samra_core.customer_wallet_provider_mappings",
            trigger: "customer_wallet_mapping_configuration_guard",
          },
          {
            table: "samra_core.customer_wallet_provider_mappings",
            trigger: "customer_wallet_provider_mappings_append_only",
          },
          {
            table: "samra_core.customer_consents",
            trigger: "customer_consents_append_only",
          },
          {
            table: "samra_core.customer_wallets",
            trigger: "customer_wallets_controlled_mutation",
          },
          {
            table: "samra_core.customer_onboardings",
            trigger: "customer_onboardings_controlled_mutation",
          },
        ] as const;
        for (const guard of guards) {
          await t.test(guard.trigger, async () => {
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              await client.query(
                `ALTER TABLE ${guard.table} DISABLE TRIGGER ${guard.trigger}`,
              );
              await assert.rejects(
                assertPostgresRuntimeReady(client, {
                  customerWalletControls: true,
                }),
                /migration is not ready/,
              );
            } finally {
              await client.query("ROLLBACK");
              client.release();
            }
          });
        }
      },
    );
    await t.test(
      "direct ready inserts fail while normal created-state provisioning remains allowed",
      async (t) => {
        const configurations = [
          {
            environment: "staging" as const,
            configurationVersion:
              CUSTOMER_CONTROLLED_SANDBOX_CONFIGURATION_VERSION,
            disclosure: CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE,
          },
          {
            environment: "synthetic" as const,
            configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
            disclosure: ALPHA_WALLET_PROVISIONING_DISCLOSURE,
          },
        ] as const;

        for (const configuration of configurations) {
          await t.test(configuration.environment, async () => {
            const f = await fixture(pool);
            const identity = await pool.query<{
              customer_id: string;
              onboarding_id: string;
            }>(
              `SELECT customer.id AS customer_id, onboarding.id AS onboarding_id
                 FROM samra_core.customers customer
                 JOIN samra_core.customer_onboardings onboarding
                   ON onboarding.customer_id = customer.id
                WHERE customer.external_ref = $1`,
              [f.policy.allowedCustomerId],
            );
            assert.equal(identity.rows.length, 1);
            const target = identity.rows[0]!;
            const directCommandKey = randomUUID();
            const accepted = await pool.query<{ id: string }>(
              `INSERT INTO samra_core.customer_consents
                 (customer_id, onboarding_id, consent_type, document_version,
                  bundle_version, decision, locale, channel, idempotency_key)
               VALUES ($1,$2,'wallet_provisioning',$3,$4,'accepted',$5,'api',$6)
               RETURNING id`,
              [
                target.customer_id,
                target.onboarding_id,
                configuration.disclosure.documentVersion,
                configuration.disclosure.bundleVersion,
                configuration.disclosure.locale,
                directCommandKey,
              ],
            );
            const walletExternalRef = `wallet_${randomUUID().replaceAll("-", "")}`;
            await assert.rejects(
              pool.query(
                `INSERT INTO samra_core.customer_wallets
                   (external_ref, customer_id, onboarding_id, wallet_consent_id,
                    provider, provider_request_key, creation_command_key, state,
                    asset, environment, configuration_version, ready_at)
                 VALUES ($1,$2,$3,$4,'crossmint',$5,$6,'ready','USDC',$7,$8,now())`,
                [
                  walletExternalRef,
                  target.customer_id,
                  target.onboarding_id,
                  accepted.rows[0]!.id,
                  randomUUID().replaceAll("-", "").repeat(2),
                  randomUUID().replaceAll("-", "").repeat(2),
                  configuration.environment,
                  configuration.configurationVersion,
                ],
              ),
              (error: unknown) => {
                const candidate = error as {
                  code?: string;
                  message?: string;
                };
                return (
                  candidate.code === "23514" &&
                  candidate.message?.includes(
                    "customer wallet must be inserted in created state",
                  ) === true
                );
              },
            );
            const absent = await pool.query<{ count: string }>(
              `SELECT count(*)::text AS count
                 FROM samra_core.customer_wallets
                WHERE external_ref = $1`,
              [walletExternalRef],
            );
            assert.equal(absent.rows[0]!.count, "0");

            const store =
              configuration.environment === "staging"
                ? f.store
                : new PostgresCustomerWalletStore(f.context);
            const prepared = await store.prepareAuth0Wallet({
              ...f.auth,
              idempotencyKey: randomUUID(),
              consent: {
                bundleVersion: configuration.disclosure.bundleVersion,
                documentVersion: configuration.disclosure.documentVersion,
                locale: configuration.disclosure.locale,
                decision: "accepted",
              },
            });
            assert.equal(prepared.snapshot.state, "provisioning");
          });
        }
      },
    );
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
      "concurrent preparation and reconciliation preserve one durable command and mapping",
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
          reasonFamily: "wallet_provider_outcome_unknown",
        });
        const retry = await f.store.prepareAuth0Wallet(f.input);
        assert.equal(retry.providerRequestKey, a.providerRequestKey);
        assert.equal(retry.snapshot.state, "error");
        assert.deepEqual(retry.snapshot.nextAllowedActions, [
          "await_wallet_reconciliation",
          "contact_support",
        ]);
        const initialResult = result();
        const attached = await f.store.attachProviderWallet({
          walletId: a.snapshot.walletId,
          providerRequestKey: a.providerRequestKey,
          result: initialResult,
        });
        assert.equal(attached.state, "customer_control_setup");
        assert.equal(attached.readyAt, null);
        assert.equal(attached.custodyModel, null);
        assert.equal(attached.publicAddress, null);
        assert.deepEqual(attached.nextAllowedActions, [
          "await_customer_control_setup",
        ]);
        const persistedSetup = await pool.query<{
          wallet_state: string;
          onboarding_state: string;
          ready_at: Date | null;
          public_address: string | null;
        }>(
          `SELECT wallet.state AS wallet_state,
                  onboarding.state AS onboarding_state,
                  wallet.ready_at,
                  mapping.public_address
             FROM samra_core.customer_wallets wallet
             JOIN samra_core.customer_onboardings onboarding
               ON onboarding.id = wallet.onboarding_id
             JOIN samra_core.customer_wallet_provider_mappings mapping
               ON mapping.wallet_id = wallet.id
            WHERE wallet.external_ref = $1`,
          [a.snapshot.walletId],
        );
        assert.deepEqual(persistedSetup.rows, [
          {
            wallet_state: "customer_control_setup",
            onboarding_state: "wallet_control_setup",
            ready_at: null,
            public_address: initialResult.publicAddress,
          },
        ]);
        await assert.rejects(
          pool.query(
            `UPDATE samra_core.customer_wallets
                SET state = 'ready', ready_at = now(), version = version + 1,
                    updated_at = now()
              WHERE external_ref = $1`,
            [a.snapshot.walletId],
          ),
          (error: unknown) => (error as { code: string }).code === "23514",
        );
        await assert.rejects(
          pool.query(
            `UPDATE samra_core.customer_onboardings
                SET state = 'wallet_ready',
                    latest_completed_step = 'wallet_provisioned',
                    version = version + 1, entered_at = now(),
                    updated_at = now()
              WHERE id = (
                SELECT onboarding_id
                  FROM samra_core.customer_wallets
                 WHERE external_ref = $1
              )`,
            [a.snapshot.walletId],
          ),
          (error: unknown) => (error as { code: string }).code === "23514",
        );
        const restarted = new PostgresCustomerWalletStore(
          new PostgresPersistenceContext(pool),
          f.policy,
        );
        assert.deepEqual(await restarted.getAuth0Wallet(f.auth), attached);
        assert.equal(
          (await restarted.prepareAuth0Wallet(f.input)).snapshot.version,
          attached.version,
        );
        const replayedWithFreshKey = await restarted.prepareAuth0Wallet({
          ...f.input,
          idempotencyKey: randomUUID(),
        });
        assert.equal(replayedWithFreshKey.created, false);
        assert.deepEqual(replayedWithFreshKey.snapshot, attached);
        assert.equal(
          replayedWithFreshKey.providerRequestKey,
          a.providerRequestKey,
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
        assert.equal(conflict.publicAddress, null);
      },
    );
    await t.test(
      "legacy staging re-consent preserves exact retries without reopening provider dispatch",
      async (t) => {
        for (const walletState of ["provisioning", "error"] as const) {
          await t.test(walletState, async () => {
            const f = await fixture(pool);
            const prepared = await f.store.prepareAuth0Wallet(f.input);
            if (walletState === "error") {
              await f.store.recordProviderStartFailure({
                walletId: prepared.snapshot.walletId,
                reasonFamily: "wallet_provider_outcome_unknown",
              });
            }

            await pool.query(
              "ALTER TABLE samra_core.customer_consents DISABLE TRIGGER customer_consents_append_only",
            );
            try {
              await pool.query(
                `UPDATE samra_core.customer_consents
                    SET bundle_version = 'sandbox-customer-wallet-v1',
                        document_version = 'sandbox-customer-wallet-v1'
                  WHERE id = (
                    SELECT wallet_consent_id
                      FROM samra_core.customer_wallets
                     WHERE external_ref = $1
                  )`,
                [prepared.snapshot.walletId],
              );
            } finally {
              await pool.query(
                "ALTER TABLE samra_core.customer_consents ENABLE TRIGGER customer_consents_append_only",
              );
            }

            const refreshKey = `legacy-wallet-refresh-${randomUUID()}`;
            const refreshInput = {
              ...f.input,
              idempotencyKey: refreshKey,
            };
            const refreshed = await f.store.prepareAuth0Wallet(refreshInput);
            assert.equal(refreshed.created, false);
            assert.equal(refreshed.snapshot.state, walletState);
            assert.equal(
              refreshed.providerRequestKey,
              prepared.providerRequestKey,
            );

            const replay = await f.store.prepareAuth0Wallet(refreshInput);
            assert.equal(replay.created, false);
            assert.deepEqual(replay.snapshot, refreshed.snapshot);
            assert.equal(
              replay.providerRequestKey,
              prepared.providerRequestKey,
            );
            await assert.rejects(
              f.store.prepareAuth0Wallet({
                ...refreshInput,
                idempotencyKey: randomUUID(),
              }),
              /different idempotency command/,
            );

            const evidence = await pool.query<{
              current_rows: string;
              idempotency_key: string;
            }>(
              `SELECT count(*)::text AS current_rows,
                      min(idempotency_key) AS idempotency_key
                 FROM samra_core.customer_consents consent
                 JOIN samra_core.customer_wallets wallet
                   ON wallet.customer_id = consent.customer_id
                  AND wallet.onboarding_id = consent.onboarding_id
                WHERE wallet.external_ref = $1
                  AND consent.consent_type = 'wallet_provisioning'
                  AND consent.bundle_version = $2
                  AND consent.document_version = $3`,
              [
                prepared.snapshot.walletId,
                CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.bundleVersion,
                CUSTOMER_CONTROLLED_SANDBOX_DISCLOSURE.documentVersion,
              ],
            );
            assert.deepEqual(evidence.rows, [
              {
                current_rows: "1",
                idempotency_key: createHash("sha256")
                  .update(refreshKey)
                  .digest("hex"),
              },
            ]);
          });
        }
      },
    );
    await t.test(
      "a stale synthetic same-key preparation returns the winning mapped wallet without dispatch",
      async () => {
        const f = await fixture(pool);
        const store = new PostgresCustomerWalletStore(f.context);
        const input = {
          ...f.auth,
          idempotencyKey: randomUUID(),
          consent: {
            bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
            documentVersion:
              ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
            locale: ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale,
            decision: "accepted" as const,
          },
        };
        const first = await store.prepareAuth0Wallet(input);
        const staleReplay = await store.prepareAuth0Wallet(input);
        assert.equal(first.created, true);
        assert.equal(staleReplay.created, false);
        assert.equal(staleReplay.snapshot.state, "provisioning");

        let winnerDispatches = 0;
        const winner = await store.runAuthorizedProviderDispatch(
          {
            ...f.auth,
            walletId: first.snapshot.walletId,
            providerRequestKey: first.providerRequestKey,
          },
          async () => {
            winnerDispatches += 1;
            return store.attachProviderWallet({
              walletId: first.snapshot.walletId,
              providerRequestKey: first.providerRequestKey,
              result: {
                providerWalletRef: `wallet_fake_${randomUUID().replaceAll("-", "")}`,
                network: "synthetic",
                custodyModel: "synthetic",
                publicAddress: null,
                configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
              },
            });
          },
        );
        assert.equal(winner.state, "ready");
        assert.equal(winnerDispatches, 1);

        let replayDispatches = 0;
        const replay = await store.runAuthorizedProviderDispatch(
          {
            ...f.auth,
            walletId: staleReplay.snapshot.walletId,
            providerRequestKey: staleReplay.providerRequestKey,
          },
          async () => {
            replayDispatches += 1;
            throw new Error("must not dispatch a completed same-key replay");
          },
        );
        assert.deepEqual(replay, winner);
        assert.equal(replayDispatches, 0);
      },
    );
    await t.test(
      "a stale staging creator returns a reconciled control-setup wallet without dispatch",
      async () => {
        const f = await fixture(pool);
        const staleCreator = await f.store.prepareAuth0Wallet(f.input);
        const reconciled = await f.store.attachProviderWallet({
          walletId: staleCreator.snapshot.walletId,
          providerRequestKey: staleCreator.providerRequestKey,
          result: result(),
        });
        assert.equal(reconciled.state, "customer_control_setup");

        let replayDispatches = 0;
        const replay = await f.store.runAuthorizedProviderDispatch(
          {
            ...f.auth,
            walletId: staleCreator.snapshot.walletId,
            providerRequestKey: staleCreator.providerRequestKey,
          },
          async () => {
            replayDispatches += 1;
            throw new Error("must not dispatch after reconciliation completed");
          },
        );
        assert.deepEqual(replay, reconciled);
        assert.equal(replayDispatches, 0);
      },
    );
    await t.test(
      "deterministic synthetic attachment remains ready without a customer-control setup state",
      async () => {
        const f = await fixture(pool);
        const fake = new PostgresCustomerWalletStore(f.context);
        const syntheticConsent = {
          bundleVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
          documentVersion: ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
          locale: ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale,
          decision: "accepted" as const,
        };
        const prepared = await fake.prepareAuth0Wallet({
          ...f.auth,
          idempotencyKey: randomUUID(),
          consent: syntheticConsent,
        });
        await assert.rejects(
          pool.query(
            `UPDATE samra_core.customer_wallets
                SET state = 'ready', ready_at = now(), version = version + 1,
                    updated_at = now()
              WHERE external_ref = $1`,
            [prepared.snapshot.walletId],
          ),
          (error: unknown) => (error as { code: string }).code === "23514",
        );
        const failed = await fake.recordProviderStartFailure({
          walletId: prepared.snapshot.walletId,
          reasonFamily: "wallet_provider_unavailable",
        });
        assert.equal(failed.state, "error");
        const resumedAfterReload = await fake.prepareAuth0Wallet({
          ...f.auth,
          idempotencyKey: randomUUID(),
          consent: syntheticConsent,
        });
        assert.equal(resumedAfterReload.snapshot.walletId, failed.walletId);
        assert.equal(resumedAfterReload.snapshot.state, "error");
        assert.equal(
          resumedAfterReload.providerRequestKey,
          prepared.providerRequestKey,
        );
        const attached = await fake.attachProviderWallet({
          walletId: resumedAfterReload.snapshot.walletId,
          providerRequestKey: resumedAfterReload.providerRequestKey,
          result: {
            providerWalletRef: `synthetic_${randomUUID()}`,
            network: "synthetic",
            custodyModel: "synthetic",
            publicAddress: null,
            configurationVersion: ALPHA_WALLET_CONFIGURATION_VERSION,
          },
        });
        assert.equal(attached.state, "ready");
        assert.notEqual(attached.readyAt, null);
        assert.deepEqual(attached.nextAllowedActions, [
          "continue_to_funding_setup",
        ]);
        const persisted = await pool.query<{
          wallet_state: string;
          onboarding_state: string;
        }>(
          `SELECT wallet.state AS wallet_state,
                  onboarding.state AS onboarding_state
             FROM samra_core.customer_wallets wallet
             JOIN samra_core.customer_onboardings onboarding
               ON onboarding.id = wallet.onboarding_id
            WHERE wallet.external_ref = $1`,
          [attached.walletId],
        );
        assert.deepEqual(persisted.rows, [
          { wallet_state: "ready", onboarding_state: "wallet_ready" },
        ]);
      },
    );
    await t.test(
      "late identity conflicts stop synthetic provisioning and error retries before provider dispatch",
      async (t) => {
        for (const walletState of ["provisioning", "error"] as const) {
          await t.test(walletState, async () => {
            const f = await fixture(pool);
            assert.notEqual(f.identityCaseId, null);
            assert.notEqual(f.providerInquiryRef, null);
            const store = new PostgresCustomerWalletStore(f.context);
            const input = {
              ...f.auth,
              idempotencyKey: randomUUID(),
              consent: {
                bundleVersion:
                  ALPHA_WALLET_PROVISIONING_DISCLOSURE.bundleVersion,
                documentVersion:
                  ALPHA_WALLET_PROVISIONING_DISCLOSURE.documentVersion,
                locale: ALPHA_WALLET_PROVISIONING_DISCLOSURE.locale,
                decision: "accepted" as const,
              },
            };
            const prepared = await store.prepareAuth0Wallet(input);
            assert.equal(prepared.snapshot.state, "provisioning");
            if (walletState === "error") {
              const failed = await store.recordProviderStartFailure({
                walletId: prepared.snapshot.walletId,
                reasonFamily: "wallet_provider_unavailable",
              });
              assert.equal(failed.state, "error");
            }

            const identityCases = new PostgresCustomerIdentityCaseStore(
              f.context,
            );
            const conflict = await identityCases.recordProviderEvent({
              identityCaseId: f.identityCaseId!,
              providerInquiryRef: f.providerInquiryRef!,
              providerEventRef: `evt_synthetic_conflict_${randomUUID()}`,
              eventType: "inquiry.declined",
              decision: "declined",
              payloadDigest: "c".repeat(64),
            });
            assert.equal(conflict.disposition, "conflict");
            const onboarding = new PostgresCustomerOnboardingStore(f.context);
            assert.equal(
              (await onboarding.getAuth0Onboarding(f.auth)).state,
              "restricted",
            );

            let providerCalls = 0;
            const service = new CustomerWalletProvisioningService({
              store,
              provider: {
                provider: "crossmint",
                async createWallet() {
                  providerCalls += 1;
                  throw new Error("must not be called");
                },
              },
            });
            await assert.rejects(
              service.startAuth0Wallet(input),
              CustomerOnboardingAccessRestrictedError,
            );
            assert.equal(providerCalls, 0);
            const restricted = await store.getAuth0Wallet(f.auth);
            assert.equal(restricted.state, "restricted");
            assert.equal(restricted.reasonFamily, "identity_provider_conflict");
            assert.deepEqual(restricted.nextAllowedActions, [
              "contact_support",
            ]);
          });
        }
      },
    );
    await t.test(
      "a contradictory identity result restricts onboarding after wallet creation",
      async () => {
        const f = await fixture(pool);
        assert.notEqual(f.identityCaseId, null);
        assert.notEqual(f.providerInquiryRef, null);
        const prepared = await f.store.prepareAuth0Wallet(f.input);
        const attached = await f.store.attachProviderWallet({
          walletId: prepared.snapshot.walletId,
          providerRequestKey: prepared.providerRequestKey,
          result: result(),
        });
        assert.equal(attached.state, "customer_control_setup");

        const cases = new PostgresCustomerIdentityCaseStore(f.context);
        const conflict = await cases.recordProviderEvent({
          identityCaseId: f.identityCaseId!,
          providerInquiryRef: f.providerInquiryRef!,
          providerEventRef: `evt_conflict_${randomUUID()}`,
          eventType: "inquiry.declined",
          decision: "declined",
          payloadDigest: "b".repeat(64),
        });
        assert.equal(conflict.disposition, "conflict");
        const onboarding = new PostgresCustomerOnboardingStore(f.context);
        assert.equal(
          (await onboarding.getAuth0Onboarding(f.auth)).state,
          "restricted",
        );
        assert.equal(
          (await f.store.getAuth0Wallet(f.auth)).state,
          "restricted",
        );
      },
    );
    await t.test(
      "an idempotent resume rejects a persisted wallet disclosure mismatch",
      async () => {
        const f = await fixture(pool);
        const prepared = await f.store.prepareAuth0Wallet(f.input);
        await pool.query(
          "ALTER TABLE samra_core.customer_consents DISABLE TRIGGER customer_consents_append_only",
        );
        try {
          await pool.query(
            `UPDATE samra_core.customer_consents
                SET document_version = 'legacy-sandbox-customer-wallet-v0'
              WHERE id = (
                SELECT wallet_consent_id
                  FROM samra_core.customer_wallets
                 WHERE external_ref = $1
              )`,
            [prepared.snapshot.walletId],
          );
        } finally {
          await pool.query(
            "ALTER TABLE samra_core.customer_consents ENABLE TRIGGER customer_consents_append_only",
          );
        }
        await assert.rejects(
          f.store.prepareAuth0Wallet(f.input),
          /different wallet provisioning disclosure/,
        );
      },
    );
    await t.test(
      "database rejects mappings that disagree with the wallet configuration",
      async () => {
        const f = await fixture(pool);
        const prepared = await f.store.prepareAuth0Wallet(f.input);
        await assert.rejects(
          pool.query(
            `UPDATE samra_core.customer_wallets
                SET state = 'customer_control_setup',
                    version = version + 1, updated_at = now()
              WHERE external_ref = $1`,
            [prepared.snapshot.walletId],
          ),
          (error: unknown) => (error as { code: string }).code === "23514",
        );
        await assert.rejects(
          pool.query(
            `UPDATE samra_core.customer_wallets
                SET state = 'ready', ready_at = now(), version = version + 1
              WHERE external_ref = $1`,
            [prepared.snapshot.walletId],
          ),
          (error: unknown) => (error as { code: string }).code === "23514",
        );
        for (const state of ["wallet_control_setup", "wallet_ready"] as const) {
          await assert.rejects(
            pool.query(
              `UPDATE samra_core.customer_onboardings
                  SET state = $2, version = version + 1,
                      entered_at = now(), updated_at = now()
                WHERE id = (
                  SELECT onboarding_id
                    FROM samra_core.customer_wallets
                   WHERE external_ref = $1
                )`,
              [prepared.snapshot.walletId, state],
            ),
            (error: unknown) => (error as { code: string }).code === "23514",
          );
        }
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
      "a restriction received during the provider call preserves the mapping without granting capability",
      async () => {
        const f = await fixture(pool);
        const prepared = await f.store.prepareAuth0Wallet(f.input);
        await pool.query(
          `UPDATE samra_core.customer_onboardings
              SET state='restricted', reason_family='identity_provider_conflict',
                  version=version+1
        WHERE customer_id=(SELECT id FROM samra_core.customers WHERE external_ref=$1)`,
          [f.policy.allowedCustomerId],
        );
        const providerResult = result("4");
        const restricted = await f.store.attachProviderWallet({
          walletId: prepared.snapshot.walletId,
          providerRequestKey: prepared.providerRequestKey,
          result: providerResult,
        });
        assert.equal(restricted.state, "restricted");
        assert.equal(restricted.reasonFamily, "identity_provider_conflict");
        assert.equal(restricted.readyAt, null);
        assert.equal(restricted.custodyModel, null);
        assert.equal(restricted.publicAddress, null);
        assert.deepEqual(restricted.nextAllowedActions, ["contact_support"]);
        const replay = await f.store.prepareAuth0Wallet(f.input);
        assert.equal(replay.created, false);
        assert.equal(replay.snapshot.state, "restricted");
        assert.equal(
          replay.snapshot.reasonFamily,
          "identity_provider_conflict",
        );
        assert.equal(replay.providerRequestKey, prepared.providerRequestKey);
        const persisted = await pool.query<{
          wallet_state: string;
          onboarding_state: string;
          provider_wallet_ref: string;
          public_address: string | null;
        }>(
          `SELECT wallet.state AS wallet_state,
                  onboarding.state AS onboarding_state,
                  mapping.provider_wallet_ref,
                  mapping.public_address
             FROM samra_core.customer_wallets wallet
             JOIN samra_core.customer_onboardings onboarding
               ON onboarding.id = wallet.onboarding_id
             JOIN samra_core.customer_wallet_provider_mappings mapping
               ON mapping.wallet_id = wallet.id
            WHERE wallet.external_ref = $1`,
          [prepared.snapshot.walletId],
        );
        assert.deepEqual(persisted.rows, [
          {
            wallet_state: "restricted",
            onboarding_state: "restricted",
            provider_wallet_ref: providerResult.providerWalletRef,
            public_address: providerResult.publicAddress,
          },
        ]);
        const fetched = await f.store.getAuth0Wallet(f.auth);
        assert.equal(fetched.state, "restricted");
        assert.equal(fetched.custodyModel, null);
        assert.equal(fetched.publicAddress, null);
      },
    );
  } finally {
    await pool.end();
  }
});
