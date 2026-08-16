import type { PostgresPersistenceContext } from "@workspace/db";
import { DomainError } from "@workspace/remittance";
import type {
  BeneficiaryDeliveryInput,
  BeneficiaryRecord,
  BeneficiaryStore,
  CreateBeneficiary,
  UpdateBeneficiary,
} from "./beneficiary-store";

type BeneficiaryRow = {
  external_ref: string;
  actor_ref: string;
  display_name: string;
  city: string;
  country_code: string;
  rail: "bank_account" | "mobile_wallet";
  bank_id: "cbe" | "awash" | null;
  bank_account_number: string | null;
  wallet_id: "telebirr" | "cbebirr" | null;
  wallet_phone_number: string | null;
  state: "active" | "disabled";
  created_at: Date;
  updated_at: Date;
};

const selectBeneficiary = `
  SELECT b.external_ref, c.external_ref AS actor_ref, b.display_name, b.city,
         b.country_code, b.rail, b.bank_id, b.bank_account_number,
         b.wallet_id, b.wallet_phone_number, b.state, b.created_at, b.updated_at
  FROM samra_core.beneficiaries b
  JOIN samra_core.customers c ON c.id = b.customer_id`;

export class PostgresBeneficiaryStore implements BeneficiaryStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async list(actorId: string): Promise<readonly BeneficiaryRecord[]> {
    const result = await this.#context.query().query<BeneficiaryRow>(
      `${selectBeneficiary}
       WHERE c.external_ref = $1 AND b.state = 'active'
       ORDER BY b.created_at, b.external_ref`,
      [actorId],
    );
    return result.rows.map(mapBeneficiary);
  }

  async get(
    actorId: string,
    beneficiaryId: string,
    options: Readonly<{ includeDisabled?: boolean }> = {},
  ): Promise<BeneficiaryRecord | undefined> {
    const result = await this.#context.query().query<BeneficiaryRow>(
      `${selectBeneficiary}
       WHERE c.external_ref = $1 AND b.external_ref = $2
         ${options.includeDisabled ? "" : "AND b.state = 'active'"}`,
      [actorId, beneficiaryId],
    );
    return result.rows[0] ? mapBeneficiary(result.rows[0]) : undefined;
  }

  async create(input: CreateBeneficiary): Promise<BeneficiaryRecord> {
    const delivery = deliveryColumns(input.deliveryDetails);
    const result = await this.#context.query().query<BeneficiaryRow>(
      `WITH inserted AS (
         INSERT INTO samra_core.beneficiaries (
           customer_id, external_ref, display_name, city, country_code, rail,
           payout_reference, bank_id, bank_account_number, wallet_id,
           wallet_phone_number, provider_metadata, created_at, updated_at
         )
         SELECT c.id, $2, $3, $4, $5, $6::samra_core.beneficiary_rail,
                $7, $8, $9, $10, $11, '{"synthetic":true}'::jsonb, $12, $12
         FROM samra_core.customers c
         WHERE c.external_ref = $1
         RETURNING *
       )
       SELECT i.external_ref, c.external_ref AS actor_ref, i.display_name,
              i.city, i.country_code, i.rail, i.bank_id, i.bank_account_number,
              i.wallet_id, i.wallet_phone_number, i.state, i.created_at, i.updated_at
       FROM inserted i JOIN samra_core.customers c ON c.id = i.customer_id`,
      [
        input.actorId,
        input.id,
        input.displayName,
        input.city,
        input.countryCode,
        delivery.rail,
        delivery.payoutReference,
        delivery.bankId,
        delivery.bankAccountNumber,
        delivery.walletId,
        delivery.walletPhoneNumber,
        input.now,
      ],
    );
    if (!result.rows[0]) {
      throw new DomainError("NOT_FOUND", "The actor was not found.");
    }
    return mapBeneficiary(result.rows[0]);
  }

  async update(
    actorId: string,
    beneficiaryId: string,
    input: UpdateBeneficiary,
  ): Promise<BeneficiaryRecord | undefined> {
    const delivery = input.deliveryDetails
      ? deliveryColumns(input.deliveryDetails)
      : undefined;
    const result = await this.#context.query().query<BeneficiaryRow>(
      `WITH updated AS (
         UPDATE samra_core.beneficiaries b SET
           display_name = COALESCE($3, b.display_name),
           city = COALESCE($4, b.city),
           rail = COALESCE($5::samra_core.beneficiary_rail, b.rail),
           payout_reference = COALESCE($6, b.payout_reference),
           bank_id = CASE WHEN $5 IS NULL THEN b.bank_id ELSE $7 END,
           bank_account_number = CASE WHEN $5 IS NULL THEN b.bank_account_number ELSE $8 END,
           wallet_id = CASE WHEN $5 IS NULL THEN b.wallet_id ELSE $9 END,
           wallet_phone_number = CASE WHEN $5 IS NULL THEN b.wallet_phone_number ELSE $10 END,
           updated_at = $11
         FROM samra_core.customers c
         WHERE b.customer_id = c.id AND c.external_ref = $1
           AND b.external_ref = $2 AND b.state = 'active'
         RETURNING b.*
       )
       SELECT u.external_ref, c.external_ref AS actor_ref, u.display_name,
              u.city, u.country_code, u.rail, u.bank_id, u.bank_account_number,
              u.wallet_id, u.wallet_phone_number, u.state, u.created_at, u.updated_at
       FROM updated u JOIN samra_core.customers c ON c.id = u.customer_id`,
      [
        actorId,
        beneficiaryId,
        input.displayName ?? null,
        input.city ?? null,
        delivery?.rail ?? null,
        delivery?.payoutReference ?? null,
        delivery?.bankId ?? null,
        delivery?.bankAccountNumber ?? null,
        delivery?.walletId ?? null,
        delivery?.walletPhoneNumber ?? null,
        input.now,
      ],
    );
    return result.rows[0] ? mapBeneficiary(result.rows[0]) : undefined;
  }

  async softDelete(
    actorId: string,
    beneficiaryId: string,
    now: string,
  ): Promise<boolean> {
    const result = await this.#context.query().query(
      `UPDATE samra_core.beneficiaries b
       SET state = 'disabled', deleted_at = $3, updated_at = $3
       FROM samra_core.customers c
       WHERE b.customer_id = c.id AND c.external_ref = $1
         AND b.external_ref = $2 AND b.state = 'active'`,
      [actorId, beneficiaryId, now],
    );
    return result.rowCount === 1;
  }
}

function deliveryColumns(delivery: BeneficiaryDeliveryInput) {
  return delivery.method === "bank"
    ? {
        rail: "bank_account" as const,
        payoutReference: delivery.accountNumber,
        bankId: delivery.bankId,
        bankAccountNumber: delivery.accountNumber,
        walletId: null,
        walletPhoneNumber: null,
      }
    : {
        rail: "mobile_wallet" as const,
        payoutReference: delivery.phoneNumber,
        bankId: null,
        bankAccountNumber: null,
        walletId: delivery.walletId,
        walletPhoneNumber: delivery.phoneNumber,
      };
}

function mapBeneficiary(row: BeneficiaryRow): BeneficiaryRecord {
  let deliveryDetails: BeneficiaryDeliveryInput;
  if (row.rail === "bank_account" && row.bank_id && row.bank_account_number) {
    deliveryDetails = {
      method: "bank",
      bankId: row.bank_id,
      accountNumber: row.bank_account_number,
    };
  } else if (
    row.rail === "mobile_wallet" &&
    row.wallet_id &&
    row.wallet_phone_number
  ) {
    deliveryDetails = {
      method: "wallet",
      walletId: row.wallet_id,
      phoneNumber: row.wallet_phone_number,
    };
  } else {
    throw new Error(`Invalid beneficiary delivery record: ${row.external_ref}`);
  }
  if (row.country_code !== "ET") {
    throw new Error(`Unsupported beneficiary destination: ${row.external_ref}`);
  }
  return {
    id: row.external_ref,
    actorId: row.actor_ref,
    displayName: row.display_name,
    city: row.city,
    countryCode: "ET",
    deliveryDetails,
    state: row.state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
