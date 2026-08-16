import { DomainError } from "@workspace/remittance";

export type BankId = "cbe" | "awash";
export type WalletId = "telebirr" | "cbebirr";

export type BeneficiaryDeliveryInput =
  | Readonly<{ method: "bank"; bankId: BankId; accountNumber: string }>
  | Readonly<{ method: "wallet"; walletId: WalletId; phoneNumber: string }>;

export type BeneficiaryRecord = Readonly<{
  id: string;
  actorId: string;
  displayName: string;
  city: string;
  countryCode: "ET";
  deliveryDetails: BeneficiaryDeliveryInput;
  state: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}>;

export type CreateBeneficiary = Readonly<{
  id: string;
  actorId: string;
  displayName: string;
  city: string;
  countryCode: "ET";
  deliveryDetails: BeneficiaryDeliveryInput;
  now: string;
}>;

export type UpdateBeneficiary = Readonly<{
  displayName?: string;
  city?: string;
  deliveryDetails?: BeneficiaryDeliveryInput;
  now: string;
}>;

export interface BeneficiaryStore {
  list(actorId: string): Promise<readonly BeneficiaryRecord[]>;
  get(
    actorId: string,
    beneficiaryId: string,
    options?: Readonly<{ includeDisabled?: boolean }>,
  ): Promise<BeneficiaryRecord | undefined>;
  create(input: CreateBeneficiary): Promise<BeneficiaryRecord>;
  update(
    actorId: string,
    beneficiaryId: string,
    input: UpdateBeneficiary,
  ): Promise<BeneficiaryRecord | undefined>;
  softDelete(
    actorId: string,
    beneficiaryId: string,
    now: string,
  ): Promise<boolean>;
}

export const BENEFICIARY_INSTITUTIONS = Object.freeze({
  cbe: "Commercial Bank of Ethiopia",
  awash: "Awash Bank",
  telebirr: "Telebirr",
  cbebirr: "CBE Birr",
});

const SEEDED_AT = "2026-01-01T00:00:00.000Z";

export const SEEDED_BENEFICIARIES: readonly BeneficiaryRecord[] = Object.freeze(
  [
    Object.freeze({
      id: "beneficiary_bank_001",
      actorId: "demo_customer_001",
      displayName: "Abebe Bekele",
      city: "Addis Ababa",
      countryCode: "ET",
      deliveryDetails: Object.freeze({
        method: "bank",
        bankId: "cbe",
        accountNumber: "100000006789",
      }),
      state: "active",
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    }),
    Object.freeze({
      id: "beneficiary_wallet_001",
      actorId: "demo_customer_001",
      displayName: "Tigist Haile",
      city: "Hawassa",
      countryCode: "ET",
      deliveryDetails: Object.freeze({
        method: "wallet",
        walletId: "telebirr",
        phoneNumber: "+251911114321",
      }),
      state: "active",
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    }),
    Object.freeze({
      id: "beneficiary_actor_b_001",
      actorId: "demo_customer_002",
      displayName: "Actor B Recipient",
      city: "Bahir Dar",
      countryCode: "ET",
      deliveryDetails: Object.freeze({
        method: "bank",
        bankId: "awash",
        accountNumber: "200000001234",
      }),
      state: "active",
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    }),
  ],
);

export class InMemoryBeneficiaryStore implements BeneficiaryStore {
  readonly #records = new Map<string, BeneficiaryRecord>();

  constructor(seed: readonly BeneficiaryRecord[] = SEEDED_BENEFICIARIES) {
    for (const record of seed) {
      this.#records.set(record.id, structuredClone(record));
    }
  }

  async list(actorId: string): Promise<readonly BeneficiaryRecord[]> {
    return [...this.#records.values()]
      .filter(
        (record) => record.actorId === actorId && record.state === "active",
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async get(
    actorId: string,
    beneficiaryId: string,
    options: Readonly<{ includeDisabled?: boolean }> = {},
  ): Promise<BeneficiaryRecord | undefined> {
    const record = this.#records.get(beneficiaryId);
    if (
      record?.actorId !== actorId ||
      (!options.includeDisabled && record.state !== "active")
    ) {
      return undefined;
    }
    return structuredClone(record);
  }

  async create(input: CreateBeneficiary): Promise<BeneficiaryRecord> {
    if (this.#records.has(input.id)) {
      throw new DomainError("CONFLICT", "The beneficiary already exists.", {
        beneficiaryId: input.id,
      });
    }
    const record: BeneficiaryRecord = {
      id: input.id,
      actorId: input.actorId,
      displayName: input.displayName,
      city: input.city,
      countryCode: input.countryCode,
      deliveryDetails: structuredClone(input.deliveryDetails),
      state: "active",
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.#records.set(record.id, record);
    return structuredClone(record);
  }

  async update(
    actorId: string,
    beneficiaryId: string,
    input: UpdateBeneficiary,
  ): Promise<BeneficiaryRecord | undefined> {
    const current = await this.get(actorId, beneficiaryId);
    if (!current) return undefined;
    const updated: BeneficiaryRecord = {
      ...current,
      displayName: input.displayName ?? current.displayName,
      city: input.city ?? current.city,
      deliveryDetails: input.deliveryDetails ?? current.deliveryDetails,
      updatedAt: input.now,
    };
    this.#records.set(updated.id, updated);
    return structuredClone(updated);
  }

  async softDelete(
    actorId: string,
    beneficiaryId: string,
    now: string,
  ): Promise<boolean> {
    const current = await this.get(actorId, beneficiaryId);
    if (!current) return false;
    this.#records.set(beneficiaryId, {
      ...current,
      state: "disabled",
      updatedAt: now,
    });
    return true;
  }
}

export function serializeBeneficiary(record: BeneficiaryRecord) {
  const details = record.deliveryDetails;
  return {
    id: record.id,
    displayName: record.displayName,
    city: record.city,
    countryCode: record.countryCode,
    deliveryDetails:
      details.method === "bank"
        ? {
            method: "bank" as const,
            bankId: details.bankId,
            institutionName: BENEFICIARY_INSTITUTIONS[details.bankId],
            accountNumberLast4: details.accountNumber.slice(-4),
          }
        : {
            method: "wallet" as const,
            walletId: details.walletId,
            institutionName: BENEFICIARY_INSTITUTIONS[details.walletId],
            phoneNumberLast4: details.phoneNumber.slice(-4),
          },
    status: "active" as const,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
