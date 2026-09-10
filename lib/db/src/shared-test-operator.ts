import { createHash } from "node:crypto";
import { z } from "zod";
import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import { PostgresLedgerJournalWriter } from "./postgres-ledger";
import { PostgresCustomerIdentityCaseStore } from "./postgres-customer-identity";
import type { PostgresPersistenceContext } from "./postgres-persistence";

const issuer = z.string().transform((value, context) => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
    return normalizeAuth0Issuer(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected an HTTPS issuer origin.",
    });
    return z.NEVER;
  }
});
const subject = z.string().min(1).max(255).transform(normalizeAuth0Subject);
const base = {
  environment: z.enum(["dev", "test"]),
  issuer,
  operatorAlias: z.string().regex(/^operator_[a-z0-9_-]{3,48}$/),
};
const manifestSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...base,
      operation: z.literal("fund-synthetic-account"),
      subject,
      amountMinor: z
        .string()
        .regex(/^[1-9][0-9]{0,5}$/)
        .refine((value) => BigInt(value) <= 100000n),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("invite"),
      admissionLimit: z.literal(5),
      subjects: z.tuple([subject, subject]),
      expiresAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      ...base,
      operation: z.literal("identity-decision"),
      subject,
      identityCaseId: z.string().regex(/^identity_case_[a-f0-9-]{32,36}$/),
      decision: z.enum(["review", "approved", "declined", "error"]),
      commandId: z.string().regex(/^synthetic_[a-z0-9_-]{12,64}$/),
    })
    .strict(),
]);

export type SharedTestManifest = z.infer<typeof manifestSchema>;

export function parseSharedTestManifest(value: unknown): SharedTestManifest {
  const manifest = manifestSchema.parse(value);
  if (
    manifest.operation === "invite" &&
    manifest.subjects[0] === manifest.subjects[1]
  ) {
    throw new Error("The initial roster requires two distinct identities.");
  }
  return manifest;
}

/** Validate before opening a connection. These are operator assertions, not cloud attestation. */
export function assertSharedTestOperatorEnvironment(
  manifest: SharedTestManifest,
  environment: NodeJS.ProcessEnv,
): string {
  const required = {
    SAMRA_DEPLOYMENT_ENVIRONMENT: manifest.environment,
    GOOGLE_CLOUD_PROJECT: `samra-pay-${manifest.environment}`,
    SAMRA_RELEASE_PROFILE: "synthetic-shared",
    SAMRA_PERSISTENCE_MODE: "postgres",
    SAMRA_CUSTOMER_AUTH_MODE: "auth0",
    SAMRA_PROVIDER_MODE: "fake",
    SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
    SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "fake",
  };
  if (
    Object.entries(required).some(
      ([key, value]) => environment[key] !== value,
    ) ||
    issuer.parse(environment["AUTH0_ISSUER_BASE_URL"]) !== manifest.issuer
  ) {
    throw new Error(
      "Shared Test operator configuration does not match the manifest.",
    );
  }
  const connectionString = environment["SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL"];
  if (!connectionString)
    throw new Error(
      "A separate synthetic operator database connection is required.",
    );
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== `/samra_${manifest.environment}`
  ) {
    throw new Error(
      "The operator connection must target the selected Dev/Test database.",
    );
  }
  return connectionString;
}

type Receipt = Readonly<{
  environment: "dev" | "test";
  operation: SharedTestManifest["operation"];
  applied: boolean;
  result: string;
}>;

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Operator CLI only. No customer route imports this module; no provider clients are used. */
export async function runSharedTestOperation(
  context: PostgresPersistenceContext,
  input: SharedTestManifest,
  apply = false,
): Promise<Receipt> {
  const manifest = parseSharedTestManifest(input);
  return context.run(async () => {
    await context.query().query("SAVEPOINT synthetic_operator_operation");
    try {
      const target = await context
        .query()
        .query<{ database: string }>("SELECT current_database() AS database");
      if (target.rows[0]?.database !== `samra_${manifest.environment}`) {
        throw new Error(
          "The connected database does not match the selected environment.",
        );
      }
      // Use the admission store's lock to serialize roster changes with first login.
      const controls = await context
        .query()
        .query<{ admission_limit: number }>(
          "SELECT admission_limit FROM samra_core.alpha_release_controls WHERE release_id = 'alpha-release-1' FOR UPDATE",
        );
      if (!controls.rows[0])
        throw new Error("Admission controls must be migrated first.");
      let result: string;
      let eventKey: string;
      let entityId: string;
      if (manifest.operation === "invite") {
        if (![0, 5].includes(controls.rows[0].admission_limit))
          throw new Error(
            "The existing admission limit requires separate review.",
          );
        const expiry = await context
          .query()
          .query<{ valid: boolean }>(
            "SELECT $1::timestamptz > now() AND $1::timestamptz <= now() + interval '7 days' AS valid",
            [manifest.expiresAt],
          );
        if (!expiry.rows[0]?.valid)
          throw new Error("Invitation expiry must be in the next seven days.");
        const existing = await context.query().query<{
          issuer: string;
          subject: string;
          expires_at: Date;
          revoked_at: Date | null;
        }>("SELECT issuer, subject, expires_at, revoked_at FROM samra_core.alpha_invitations FOR UPDATE");
        if (
          existing.rows.some(
            (row) =>
              row.issuer !== manifest.issuer ||
              !manifest.subjects.includes(row.subject) ||
              row.revoked_at !== null ||
              row.expires_at.toISOString() !==
                new Date(manifest.expiresAt).toISOString(),
          )
        ) {
          throw new Error(
            "Existing invitations differ from this initial roster; replacement, renewal and reactivation require separate review.",
          );
        }
        for (const value of manifest.subjects) {
          await context
            .query()
            .query(
              "INSERT INTO samra_core.alpha_invitations (issuer, subject, expires_at) VALUES ($1, $2, $3) ON CONFLICT (issuer, subject) DO NOTHING",
              [manifest.issuer, value, manifest.expiresAt],
            );
        }
        await context
          .query()
          .query(
            "UPDATE samra_core.alpha_release_controls SET admission_limit = 5 WHERE release_id = 'alpha-release-1'",
          );
        eventKey = `synthetic-invite:${digest(JSON.stringify([manifest.environment, manifest.issuer, [...manifest.subjects].sort(), manifest.expiresAt]))}`;
        entityId = `shared-${manifest.environment}`;
        result =
          "Two invitations ready; no customers, consent, wallets or balances created.";
      } else {
        // A decision requires a currently admitted, active identity. Expiry only affects unused invites.
        const admitted = await context.query().query<{ customer_id: string }>(
          `SELECT a.customer_id FROM samra_core.alpha_invitations i
           JOIN samra_core.alpha_admissions a ON a.invitation_id = i.id
           JOIN samra_core.customers c ON c.id = a.customer_id
           JOIN samra_core.customer_auth_identities auth ON auth.customer_id = c.id
             AND auth.provider = 'auth0' AND auth.issuer = i.issuer AND auth.subject = i.subject
           WHERE i.issuer = $1 AND i.subject = $2 AND i.revoked_at IS NULL
             AND c.state = 'active' AND auth.state = 'active'
           FOR UPDATE OF i, c, auth`,
          [manifest.issuer, manifest.subject],
        );
        if (admitted.rows.length !== 1)
          throw new Error("An admitted, active tester is required.");
        if (manifest.operation === "fund-synthetic-account") {
          const customerId = admitted.rows[0]!.customer_id;
          const identity = await context
            .query()
            .query(
              "SELECT 1 FROM samra_core.customer_identity_cases WHERE customer_id=$1 AND state='approved' AND left(provider_inquiry_ref,9) = 'inq_fake_'",
              [customerId],
            );
          if (identity.rows.length !== 1)
            throw new Error(
              "Approved simulated identity required for fixture funding.",
            );
          const accountRef = `synthetic_usd_${customerId.replaceAll("-", "")}`;
          await context
            .query()
            .query(
              "INSERT INTO samra_core.product_accounts(customer_id,external_ref,kind,currency) VALUES ($1,$2,'domestic_cash','USD') ON CONFLICT(external_ref) DO NOTHING",
              [customerId, accountRef],
            );
          const account = await context
            .query()
            .query<{ id: string }>(
              "SELECT id FROM samra_core.product_accounts WHERE customer_id=$1 AND external_ref=$2 AND currency='USD' AND kind='domestic_cash' AND state='active' FOR UPDATE",
              [customerId, accountRef],
            );
          if (account.rows.length !== 1)
            throw new Error("Synthetic account ownership or state mismatch.");
          const accounts = [
            [
              accountRef,
              "Synthetic customer USD liability",
              "liability",
              "credit",
              account.rows[0]!.id,
              false,
            ],
            [
              "control_rain_usd",
              "Synthetic funding control asset",
              "asset",
              "debit",
              null,
              false,
            ],
            [
              "clearing_remittance_principal_usd",
              "Synthetic principal clearing",
              "liability",
              "credit",
              null,
              false,
            ],
            [
              "liability_deferred_remittance_fee_usd",
              "Synthetic deferred fee",
              "liability",
              "credit",
              null,
              false,
            ],
            [
              "revenue_remittance_fee_usd",
              "Synthetic fee revenue",
              "revenue",
              "credit",
              null,
              false,
            ],
            [
              "asset_reconciliation_suspense_usd",
              "Synthetic reconciliation suspense",
              "asset",
              "debit",
              null,
              true,
            ],
          ];
          for (const values of accounts) {
            await context
              .query()
              .query(
                "INSERT INTO samra_core.ledger_accounts(code,name,account_class,normal_side,product_account_id,allow_negative_available,currency) VALUES($1,$2,$3,$4,$5,$6,'USD') ON CONFLICT(code) DO NOTHING",
                values,
              );
            const matching = await context
              .query()
              .query(
                "SELECT 1 FROM samra_core.ledger_accounts WHERE code=$1 AND account_class=$2 AND normal_side=$3 AND product_account_id IS NOT DISTINCT FROM $4::uuid AND allow_negative_available=$5 AND currency='USD' AND state='active'",
                [values[0], values[2], values[3], values[4], values[5]],
              );
            if (matching.rowCount !== 1)
              throw new Error(
                "Ledger account dimensions differ from the fixture contract.",
              );
          }
          // One initial credit per admitted customer. A different amount on retry conflicts.
          eventKey = `synthetic-opening:${digest(JSON.stringify([manifest.environment, customerId]))}`;
          entityId = await new PostgresLedgerJournalWriter(context).post({
            eventType: "synthetic_initial_credit",
            eventId: eventKey,
            description: "Initial synthetic test balance",
            metadata: {
              environment: manifest.environment,
              syntheticOnly: "true",
            },
            postings: [
              ["control_rain_usd", "debit", BigInt(manifest.amountMinor)],
              [accountRef, "credit", BigInt(manifest.amountMinor)],
            ],
            auditActor: {
              actorType: "system",
              actorId: manifest.operatorAlias,
            },
          });
          result =
            "Synthetic account ready; initial balanced credit applied or replayed. No real money moved.";
        } else {
          const store = new PostgresCustomerIdentityCaseStore(context);
          const current = await store.getAuth0IdentityCase(manifest);
          if (current.identityCaseId !== manifest.identityCaseId)
            throw new Error(
              "The identity case does not belong to this tester.",
            );
          // The store also rejects any inquiry without the synthetic inq_fake_ prefix.
          const commandDigest = digest(
            JSON.stringify([manifest.environment, manifest.commandId]),
          );
          const outcome = await store.recordProviderEvent({
            identityCaseId: manifest.identityCaseId,
            providerEventRef: `evt_fake_operator_${commandDigest}`,
            eventType: `inquiry.${manifest.decision}`,
            decision: manifest.decision,
            payloadDigest: digest(
              JSON.stringify([
                manifest.identityCaseId,
                manifest.decision,
                "synthetic-only",
              ]),
            ),
          });
          eventKey = `synthetic-decision:${commandDigest}`;
          entityId = manifest.identityCaseId;
          result = `Synthetic identity ${outcome.snapshot.state}; ${outcome.replayed ? "replayed" : outcome.disposition}.`;
        }
      }
      await context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'system', $2, $3, 'synthetic_test_setup', $4, $5::jsonb)
         ON CONFLICT (event_key) DO NOTHING`,
        [
          eventKey,
          manifest.operatorAlias,
          `synthetic_${manifest.operation}`,
          entityId,
          JSON.stringify({
            environment: manifest.environment,
            syntheticOnly: true,
          }),
        ],
      );
      const receipt: Receipt = {
        environment: manifest.environment,
        operation: manifest.operation,
        applied: apply,
        result,
      };
      if (!apply) {
        await context
          .query()
          .query("ROLLBACK TO SAVEPOINT synthetic_operator_operation");
      }
      await context
        .query()
        .query("RELEASE SAVEPOINT synthetic_operator_operation");
      return receipt;
    } catch (error) {
      await context
        .query()
        .query("ROLLBACK TO SAVEPOINT synthetic_operator_operation");
      await context
        .query()
        .query("RELEASE SAVEPOINT synthetic_operator_operation");
      throw error;
    }
  });
}
