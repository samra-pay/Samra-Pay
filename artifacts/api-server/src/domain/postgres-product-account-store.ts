import { createHash } from "node:crypto";
import type { PostgresPersistenceContext } from "@workspace/db";

export type SyntheticProductAccount = Readonly<{ id: string; last4: string }>;
export interface SyntheticProductAccountStore {
  list(actorId: string): Promise<readonly SyntheticProductAccount[]>;
}

// Read existing accounts only. Provisioning and balanced synthetic credits are
// separate operator actions; a customer request cannot manufacture a balance.
export class PostgresProductAccountStore implements SyntheticProductAccountStore {
  constructor(private readonly context: PostgresPersistenceContext) {}

  async list(actorId: string): Promise<readonly SyntheticProductAccount[]> {
    const result = await this.context.query().query<{ external_ref: string }>(
      `SELECT pa.external_ref
       FROM samra_core.product_accounts pa
       JOIN samra_core.customers c ON c.id = pa.customer_id
       JOIN samra_core.ledger_accounts la ON la.product_account_id = pa.id
         AND la.code = pa.external_ref AND la.currency = pa.currency
         AND la.account_class = 'liability' AND la.normal_side = 'credit'
         AND la.state = 'active'
       WHERE c.external_ref = $1 AND c.state = 'active'
         AND pa.kind = 'domestic_cash' AND pa.currency = 'USD' AND pa.state = 'active'
       ORDER BY pa.created_at, pa.external_ref`,
      [actorId],
    );
    return result.rows.map(({ external_ref }) => ({
      id: external_ref,
      // Synthetic display suffix, never a bank/card routing identifier.
      last4: String(
        createHash("sha256").update(external_ref).digest().readUInt32BE(0) %
          10000,
      ).padStart(4, "0"),
    }));
  }
}
