import { createHash } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import type { PostgresPersistenceContext } from "./postgres-persistence";

export type WaitlistLocale = "en" | "am";

export type WaitlistSubscriptionReceipt = Readonly<{
  accepted: true;
  acceptedAt: string;
}>;

export interface MarketingWaitlistStore {
  subscribe(
    input: Readonly<{
      email: string;
      consentVersion: string;
      locale: WaitlistLocale;
      idempotencyKey: string;
    }>,
  ): Promise<WaitlistSubscriptionReceipt>;
}

type ExistingConsentRow = Readonly<{
  request_fingerprint: string;
  occurred_at: Date;
}>;

export class PostgresMarketingWaitlistStore implements MarketingWaitlistStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async subscribe(
    input: Readonly<{
      email: string;
      consentVersion: string;
      locale: WaitlistLocale;
      idempotencyKey: string;
    }>,
  ): Promise<WaitlistSubscriptionReceipt> {
    const email = normalizeWaitlistEmail(input.email);
    const emailHash = sha256(email);
    const commandKey = sha256(input.idempotencyKey);
    const requestFingerprint = sha256(
      JSON.stringify({
        emailHash,
        consentVersion: input.consentVersion,
        locale: input.locale,
      }),
    );

    return this.#context.run(async () => {
      const existing = await this.#context.query().query<ExistingConsentRow>(
        `SELECT request_fingerprint, occurred_at
             FROM samra_core.marketing_waitlist_consent_events
            WHERE command_key = $1
            LIMIT 1
            FOR UPDATE`,
        [commandKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== requestFingerprint) {
          throw new DomainError(
            "CONFLICT",
            "The waitlist idempotency key was reused with different input.",
          );
        }
        return Object.freeze({
          accepted: true as const,
          acceptedAt: existing.rows[0].occurred_at.toISOString(),
        });
      }

      const contact = await this.#context.query().query<{
        id: string;
        email: string;
      }>(
        `INSERT INTO samra_core.marketing_waitlist_contacts
           (email, email_hash)
         VALUES ($1, $2)
         ON CONFLICT (email_hash) DO UPDATE SET email_hash = EXCLUDED.email_hash
         RETURNING id, email`,
        [email, emailHash],
      );
      if (contact.rows[0]?.email !== email) {
        throw new Error("A waitlist email hash collision was detected.");
      }

      const event = await this.#context.query().query<{ occurred_at: Date }>(
        `INSERT INTO samra_core.marketing_waitlist_consent_events
           (contact_id, action, notice_version, locale, command_key, request_fingerprint)
         VALUES ($1, 'subscribed', $2, $3, $4, $5)
         ON CONFLICT (command_key) DO NOTHING
         RETURNING occurred_at`,
        [
          contact.rows[0].id,
          input.consentVersion,
          input.locale,
          commandKey,
          requestFingerprint,
        ],
      );

      if (!event.rows[0]) {
        const concurrent = await this.#context
          .query()
          .query<ExistingConsentRow>(
            `SELECT request_fingerprint, occurred_at
               FROM samra_core.marketing_waitlist_consent_events
              WHERE command_key = $1
              LIMIT 1`,
            [commandKey],
          );
        if (
          !concurrent.rows[0] ||
          concurrent.rows[0].request_fingerprint !== requestFingerprint
        ) {
          throw new DomainError(
            "CONFLICT",
            "The waitlist idempotency key was reused with different input.",
          );
        }
        return Object.freeze({
          accepted: true as const,
          acceptedAt: concurrent.rows[0].occurred_at.toISOString(),
        });
      }

      return Object.freeze({
        accepted: true as const,
        acceptedAt: event.rows[0].occurred_at.toISOString(),
      });
    });
  }
}

export class InMemoryMarketingWaitlistStore implements MarketingWaitlistStore {
  readonly #receipts = new Map<
    string,
    Readonly<{ fingerprint: string; receipt: WaitlistSubscriptionReceipt }>
  >();

  async subscribe(
    input: Readonly<{
      email: string;
      consentVersion: string;
      locale: WaitlistLocale;
      idempotencyKey: string;
    }>,
  ): Promise<WaitlistSubscriptionReceipt> {
    const fingerprint = sha256(
      JSON.stringify({
        email: normalizeWaitlistEmail(input.email),
        consentVersion: input.consentVersion,
        locale: input.locale,
      }),
    );
    const commandKey = sha256(input.idempotencyKey);
    const existing = this.#receipts.get(commandKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DomainError(
          "CONFLICT",
          "The waitlist idempotency key was reused with different input.",
        );
      }
      return existing.receipt;
    }
    const receipt = Object.freeze({
      accepted: true as const,
      acceptedAt: new Date().toISOString(),
    });
    this.#receipts.set(commandKey, Object.freeze({ fingerprint, receipt }));
    return receipt;
  }
}

export function normalizeWaitlistEmail(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (normalized.length < 3 || normalized.length > 254) {
    throw new DomainError("INVALID_ARGUMENT", "Enter a valid email address.");
  }
  return normalized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
