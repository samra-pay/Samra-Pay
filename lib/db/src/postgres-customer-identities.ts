import type { PostgresPersistenceContext } from "./postgres-persistence";

export type CustomerAuthIdentityResolution = Readonly<{
  identityId: string;
  identityState: "active" | "revoked";
  customerId: string;
  customerExternalRef: string;
  customerDisplayName: string;
  customerState: "active" | "suspended" | "closed";
  onboardingState: string | null;
}>;

export type CustomerAuthIdentityBinding = Readonly<{
  identityId: string;
  customerId: string;
  customerExternalRef: string;
  created: boolean;
}>;

type IdentityRow = {
  identity_id: string;
  identity_state: "active" | "revoked";
  customer_id: string;
  customer_external_ref: string;
  customer_display_name: string;
  customer_state: "active" | "suspended" | "closed";
  onboarding_state: string | null;
};

export class CustomerIdentityNotFoundError extends Error {
  constructor() {
    super("The Samra Pay customer does not exist.");
    this.name = "CustomerIdentityNotFoundError";
  }
}

export class CustomerIdentityConflictError extends Error {
  constructor() {
    super("The Auth0 identity is already bound or has been revoked.");
    this.name = "CustomerIdentityConflictError";
  }
}

export class PostgresCustomerIdentityStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async resolveAuth0Identity(input: {
    issuer: string;
    subject: string;
  }): Promise<CustomerAuthIdentityResolution | undefined> {
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);
    const result = await this.#context.query().query<IdentityRow>(
      `${identitySelectSql}
       WHERE identity.provider = 'auth0'
         AND identity.issuer = $1
         AND identity.subject = $2
       LIMIT 1`,
      [issuer, subject],
    );
    return result.rows[0] ? mapIdentity(result.rows[0]) : undefined;
  }

  async bindAuth0Identity(input: {
    customerExternalRef: string;
    issuer: string;
    subject: string;
  }): Promise<CustomerAuthIdentityBinding> {
    const customerExternalRef = normalizeCustomerRef(input.customerExternalRef);
    const issuer = normalizeAuth0Issuer(input.issuer);
    const subject = normalizeAuth0Subject(input.subject);

    return this.#context.run(async () => {
      const query = this.#context.query();
      const customer = await query.query<{
        id: string;
        external_ref: string;
      }>(
        `SELECT id, external_ref
         FROM samra_core.customers
         WHERE external_ref = $1
         FOR UPDATE`,
        [customerExternalRef],
      );
      const customerRow = customer.rows[0];
      if (!customerRow) throw new CustomerIdentityNotFoundError();

      const inserted = await query.query<{ id: string }>(
        `INSERT INTO samra_core.customer_auth_identities
         (customer_id, provider, issuer, subject)
         VALUES ($1, 'auth0', $2, $3)
         ON CONFLICT (provider, issuer, subject) DO NOTHING
         RETURNING id`,
        [customerRow.id, issuer, subject],
      );
      const created = inserted.rows[0] !== undefined;
      const identity = await query.query<{
        id: string;
        customer_id: string;
        state: "active" | "revoked";
      }>(
        `SELECT id, customer_id, state
         FROM samra_core.customer_auth_identities
         WHERE provider = 'auth0' AND issuer = $1 AND subject = $2
         FOR UPDATE`,
        [issuer, subject],
      );
      const identityRow = identity.rows[0];
      if (
        !identityRow ||
        identityRow.customer_id !== customerRow.id ||
        identityRow.state !== "active"
      ) {
        throw new CustomerIdentityConflictError();
      }

      if (created) {
        await query.query(
          `INSERT INTO samra_core.audit_events
           (event_key, actor_type, actor_id, action, entity_type, entity_id,
            metadata)
           VALUES ($1, 'system', 'customer-identity-binding',
                   'customer_auth_identity_bound', 'customer_auth_identity',
                   $2, $3::jsonb)
           ON CONFLICT (event_key) DO NOTHING`,
          [
            `customer-auth-identity:${identityRow.id}:bound`,
            identityRow.id,
            JSON.stringify({
              provider: "auth0",
              issuer,
              customerExternalRef: customerRow.external_ref,
            }),
          ],
        );
      }
      return Object.freeze({
        identityId: identityRow.id,
        customerId: customerRow.id,
        customerExternalRef: customerRow.external_ref,
        created,
      });
    });
  }
}

const identitySelectSql = `SELECT
  identity.id AS identity_id,
  identity.state AS identity_state,
  customer.id AS customer_id,
  customer.external_ref AS customer_external_ref,
  COALESCE(customer.display_name, 'Customer profile pending') AS customer_display_name,
  customer.state AS customer_state,
  onboarding.state AS onboarding_state
FROM samra_core.customer_auth_identities identity
JOIN samra_core.customers customer ON customer.id = identity.customer_id
LEFT JOIN samra_core.customer_onboardings onboarding
  ON onboarding.customer_id = customer.id`;

function mapIdentity(row: IdentityRow): CustomerAuthIdentityResolution {
  return Object.freeze({
    identityId: row.identity_id,
    identityState: row.identity_state,
    customerId: row.customer_id,
    customerExternalRef: row.customer_external_ref,
    customerDisplayName: row.customer_display_name,
    customerState: row.customer_state,
    onboardingState: row.onboarding_state,
  });
}

function normalizeCustomerRef(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) {
    throw new CustomerIdentityNotFoundError();
  }
  return normalized;
}

export function normalizeAuth0Issuer(value: string): string {
  const normalized = value.trim();
  let issuer: URL;
  try {
    issuer = new URL(normalized);
  } catch {
    throw new CustomerIdentityConflictError();
  }
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    (issuer.pathname !== "/" && issuer.pathname !== "")
  ) {
    throw new CustomerIdentityConflictError();
  }
  return `${issuer.origin}/`;
}

export function normalizeAuth0Subject(value: string): string {
  if (!value || value !== value.trim() || value.length > 255) {
    throw new CustomerIdentityConflictError();
  }
  return value;
}
