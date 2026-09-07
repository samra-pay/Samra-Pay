import {
  normalizeAuth0Issuer,
  normalizeAuth0Subject,
} from "./postgres-customer-identities";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export class AlphaAccessDeniedError extends Error {
  constructor() {
    super("This account cannot access the invited alpha at this time.");
    this.name = "AlphaAccessDeniedError";
  }
}

export class AlphaAdmissionRequiredError extends Error {
  constructor() {
    super("Complete Samra onboarding to claim the invitation.");
    this.name = "AlphaAdmissionRequiredError";
  }
}

type Auth0Identity = Readonly<{ issuer: string; subject: string }>;

/** Uses the onboarding transaction: admission, customer and audit commit together. */
export class PostgresAlphaAccessStore {
  constructor(private readonly context: PostgresPersistenceContext) {}

  async admitAuth0Customer(
    input: Auth0Identity & { customerId: string },
  ): Promise<void> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    await this.context.run(async () => {
      // A single durable lock serializes admissions across all API instances.
      const controls = await this.context
        .query()
        .query<{ admission_limit: number }>(
          `SELECT admission_limit FROM samra_core.alpha_release_controls
          WHERE release_id = 'alpha-release-1' FOR UPDATE`,
        );
      const invitation = await this.context.query().query<{
        id: string;
        redeemable: boolean;
        customer_id: string | null;
      }>(
        `SELECT i.id, i.expires_at > now() AS redeemable, a.customer_id
           FROM samra_core.alpha_invitations i
           LEFT JOIN samra_core.alpha_admissions a ON a.invitation_id = i.id
          WHERE i.issuer = $1 AND i.subject = $2 AND i.revoked_at IS NULL
          FOR UPDATE OF i`,
        [issuer, subject],
      );
      const row = invitation.rows[0];
      if (!controls.rows[0] || !row) throw new AlphaAccessDeniedError();
      // Expiry closes an unused invitation; returning admitted users keep their slot.
      if (row.customer_id) {
        if (row.customer_id !== input.customerId)
          throw new AlphaAccessDeniedError();
        return;
      }
      if (!row.redeemable) throw new AlphaAccessDeniedError();
      const count = await this.context
        .query()
        .query<{ count: number }>(
          `SELECT count(*)::int AS count FROM samra_core.alpha_admissions`,
        );
      const slot = count.rows[0]!.count + 1;
      if (slot > controls.rows[0].admission_limit || slot > 100) {
        throw new AlphaAccessDeniedError();
      }
      await this.context.query().query(
        `INSERT INTO samra_core.alpha_admissions (slot, invitation_id, customer_id)
         VALUES ($1, $2, $3)`,
        [slot, row.id, input.customerId],
      );
      await this.context.query().query(
        `INSERT INTO samra_core.audit_events
         (event_key, actor_type, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'system', 'alpha-admission', 'alpha_customer_admitted',
                 'customer', $2, $3::jsonb)`,
        [
          `alpha-admission:${slot}`,
          input.customerId,
          JSON.stringify({ release: "alpha-release-1", slot }),
        ],
      );
    });
  }

  async assertAuth0Access(input: Auth0Identity): Promise<void> {
    const result = await this.context.query().query<{
      redeemable: boolean;
      admitted: boolean;
      active: boolean;
    }>(
      `SELECT i.expires_at > now() AS redeemable,
              a.slot IS NOT NULL AS admitted,
              c.state = 'active' AND auth.state = 'active' AS active
         FROM samra_core.alpha_invitations i
         LEFT JOIN samra_core.alpha_admissions a ON a.invitation_id = i.id
         LEFT JOIN samra_core.customers c ON c.id = a.customer_id
         LEFT JOIN samra_core.customer_auth_identities auth
           ON auth.customer_id = a.customer_id AND auth.provider = 'auth0'
          AND auth.issuer = i.issuer AND auth.subject = i.subject
        WHERE i.issuer = $1 AND i.subject = $2 AND i.revoked_at IS NULL`,
      [
        normalizeAuth0Issuer(input.issuer),
        normalizeAuth0Subject(input.subject),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new AlphaAccessDeniedError();
    if (!row.admitted && row.redeemable)
      throw new AlphaAdmissionRequiredError();
    if (!row.admitted || row.active !== true)
      throw new AlphaAccessDeniedError();
  }
}

export type AlphaAccessStore = Pick<
  PostgresAlphaAccessStore,
  "assertAuth0Access"
>;
