import { createHash, createHmac, randomUUID } from "node:crypto";
import type pg from "pg";
import { PostgresPersistenceContext } from "./postgres-persistence";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const allowedAttribution = {
  source: ["facebook", "instagram", "x", "youtube", "tiktok"],
  medium: ["social"],
  campaign: ["social_profile", "ask_samra", "product_demo"],
  content: ["bio", "channel_link", "post", "video"],
} as const;
export function safeLeadAttribution(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(allowedAttribution)) {
    const value = (input as Record<string, unknown>)[key];
    if (
      typeof value === "string" &&
      (values as readonly string[]).includes(value)
    )
      result[key] = value;
  }
  return result.source && result.medium && result.campaign ? result : {};
}

export class MarketingLeadTokenKeys {
  readonly #keys: ReadonlyMap<string, Buffer>;
  readonly activeVersion: string;
  constructor(keys: Record<string, Buffer>, activeVersion: string) {
    if (
      !keys[activeVersion] ||
      Object.entries(keys).some(
        ([version, key]) =>
          !/^[a-z0-9_-]{1,32}$/.test(version) ||
          !Buffer.isBuffer(key) ||
          key.length < 32,
      )
    )
      throw new Error("INVALID_MARKETING_TOKEN_KEYS");
    this.#keys = new Map(
      Object.entries(keys).map(([v, k]) => [v, Buffer.from(k)]),
    );
    this.activeVersion = activeVersion;
  }
  token(id: string, version = this.activeVersion): string {
    const key = this.#keys.get(version);
    if (!uuid.test(id) || !key)
      throw new Error("MARKETING_TOKEN_KEY_UNAVAILABLE");
    return createHmac("sha256", key)
      .update(`samra:marketing-confirm:v1:${id}`)
      .digest("base64url");
  }
}

export type PendingLeadInput = {
  email: string;
  emailConsent: true;
  adsConsent: boolean;
  noticeVersion: string;
  locale: "en" | "am";
  idempotencyKey: string;
  attribution?: unknown;
};
const receipt = () => Object.freeze({ accepted: true as const });

/** Internal repository. confirm is bearer-token authorized; withdraw requires
 * an independently authenticated operator/webhook/preference handler. Never
 * expose contact IDs as authorization in a public HTTP endpoint. */
export class PostgresMarketingLeadStore {
  readonly #context: PostgresPersistenceContext;
  readonly #keys: MarketingLeadTokenKeys;
  constructor(
    context: PostgresPersistenceContext,
    keys: MarketingLeadTokenKeys,
  ) {
    this.#context = context;
    this.#keys = keys;
  }
  async register(input: PendingLeadInput) {
    const email =
      typeof input.email === "string"
        ? input.email.trim().normalize("NFKC").toLowerCase()
        : "";
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      input.emailConsent !== true ||
      typeof input.adsConsent !== "boolean" ||
      !["en", "am"].includes(input.locale) ||
      !/^marketing-\d{4}-\d{2}-\d{2}$/.test(input.noticeVersion) ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)
    )
      throw new Error("INVALID_MARKETING_LEAD_REQUEST");
    const attribution = safeLeadAttribution(input.attribution);
    const command = digest(input.idempotencyKey);
    const fingerprint = digest(
      JSON.stringify([
        email,
        input.adsConsent,
        input.noticeVersion,
        input.locale,
        attribution,
      ]),
    );
    return this.#context.run(async () => {
      const q = this.#context.query();
      // Serializes same commands across different addresses, then same-address requests.
      await q.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 19))", [
        command,
      ]);
      const replay = await q.query(
        "SELECT fingerprint FROM samra_core.marketing_lead_requests WHERE command_hash=$1",
        [command],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].fingerprint !== fingerprint)
          throw new Error("MARKETING_IDEMPOTENCY_CONFLICT");
        return receipt();
      }
      await q.query("SELECT pg_advisory_xact_lock(hashtextextended($1,21))", [
        digest(email),
      ]);
      const contacts = await q.query(
        "INSERT INTO samra_core.marketing_waitlist_contacts(email,email_hash) VALUES($1,$2) ON CONFLICT(email_hash) DO UPDATE SET email_hash=EXCLUDED.email_hash RETURNING id,email",
        [email, digest(email)],
      );
      const contact = contacts.rows[0];
      if (contact.email !== email) throw new Error("MARKETING_EMAIL_COLLISION");
      await q.query(
        "INSERT INTO samra_core.marketing_lead_profiles(contact_id) VALUES($1) ON CONFLICT DO NOTHING",
        [contact.id],
      );
      const profile = await q.query(
        "SELECT * FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [contact.id],
      );
      await q.query(
        "INSERT INTO samra_core.marketing_lead_requests(command_hash,fingerprint,contact_id) VALUES($1,$2,$3)",
        [command, fingerprint, contact.id],
      );
      if (profile.rows[0].suppressed_at) return receipt();
      const suppressed = await q.query(
        "SELECT 1 FROM samra_core.marketing_email_suppressions WHERE email_hash=$1",
        [digest(email)],
      );
      if (suppressed.rowCount) {
        await q.query(
          "UPDATE samra_core.marketing_lead_profiles SET suppressed_at=now() WHERE contact_id=$1",
          [contact.id],
        );
        return receipt();
      }
      const cooldown = await q.query(
        "SELECT 1 FROM samra_core.marketing_lead_challenges WHERE contact_id=$1 AND created_at > now()-interval '60 seconds' LIMIT 1",
        [contact.id],
      );
      if (cooldown.rowCount) return receipt();
      const daily = await q.query(
        "SELECT count(*)::integer AS count FROM samra_core.marketing_lead_challenges WHERE contact_id=$1 AND created_at > now()-interval '1 day'",
        [contact.id],
      );
      if (daily.rows[0].count >= 5) return receipt();
      const id = randomUUID();
      await q.query(
        "UPDATE samra_core.marketing_lead_challenges SET cancelled_at=now() WHERE contact_id=$1 AND consumed_at IS NULL AND cancelled_at IS NULL",
        [contact.id],
      );
      await q.query(
        `INSERT INTO samra_core.marketing_lead_challenges(id,contact_id,command_hash,fingerprint,token_digest,key_version,notice_version,ads_requested,locale,attribution,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '24 hours')`,
        [
          id,
          contact.id,
          command,
          fingerprint,
          digest(this.#keys.token(id)),
          this.#keys.activeVersion,
          input.noticeVersion,
          input.adsConsent,
          input.locale,
          JSON.stringify(attribution),
        ],
      );
      return receipt();
    });
  }
  async confirm(token: string, adsConsent = false): Promise<boolean> {
    if (
      typeof token !== "string" ||
      !tokenPattern.test(token) ||
      typeof adsConsent !== "boolean"
    )
      return false;
    return this.#context.run(async () => {
      const q = this.#context.query();
      const candidate = await q.query(
        "SELECT contact_id FROM samra_core.marketing_lead_challenges WHERE token_digest=$1",
        [digest(token)],
      );
      if (!candidate.rows[0]) return false;
      const id = candidate.rows[0].contact_id;
      const profile = await q.query(
        "SELECT * FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [id],
      );
      if (profile.rows[0].suppressed_at) return false;
      const found = await q.query(
        "UPDATE samra_core.marketing_lead_challenges SET consumed_at=now() WHERE token_digest=$1 AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>now() RETURNING *",
        [digest(token)],
      );
      const challenge = found.rows[0];
      if (!challenge) return false;
      const adsGranted =
        challenge.ads_requested === true && adsConsent === true;
      await q.query(
        `UPDATE samra_core.marketing_lead_profiles SET
    first_touch=CASE WHEN verified_at IS NULL THEN $2 ELSE first_touch END,
    signup_touch=$2, verified_at=COALESCE(verified_at,now()), email_active=true,
    ads_allowed=$3,updated_at=now() WHERE contact_id=$1`,
        [id, challenge.attribution, adsGranted],
      );
      for (const [purpose, granted] of [
        ["email_updates", true],
        ["ads_matching", adsGranted],
      ]) {
        await q.query(
          "INSERT INTO samra_core.marketing_lead_permissions(contact_id,purpose,granted,notice_version,reason,command_hash) VALUES($1,$2,$3,$4,'confirmed',$5)",
          [
            id,
            purpose,
            granted,
            challenge.notice_version,
            challenge.command_hash,
          ],
        );
      }
      if (!adsGranted) await this.#remove(q, id);
      return true;
    });
  }
  async withdraw(
    contactId: string,
    reason: "withdrawn" | "unsubscribed" | "complained" | "bounced",
    commandId: string,
  ) {
    if (
      !uuid.test(contactId) ||
      !["withdrawn", "unsubscribed", "complained", "bounced"].includes(
        reason,
      ) ||
      !/^[A-Za-z0-9_-]{8,160}$/.test(commandId)
    )
      throw new Error("INVALID_MARKETING_WITHDRAWAL");
    return this.#context.run(async () => {
      const q = this.#context.query();
      const profile = await q.query(
        "SELECT contact_id FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [contactId],
      );
      if (!profile.rowCount) return;
      const command = digest(`withdraw-all:${commandId}`);
      const prior = await q.query(
        "SELECT reason FROM samra_core.marketing_lead_permissions WHERE contact_id=$1 AND command_hash=$2",
        [contactId, command],
      );
      if (prior.rows.length) {
        if (prior.rows.some((row) => row.reason !== reason))
          throw new Error("MARKETING_IDEMPOTENCY_CONFLICT");
        return;
      }
      await q.query(
        "UPDATE samra_core.marketing_lead_profiles SET ads_allowed=false,email_active=false,suppressed_at=now(),updated_at=now() WHERE contact_id=$1",
        [contactId],
      );
      await q.query(
        "UPDATE samra_core.marketing_lead_challenges SET cancelled_at=COALESCE(cancelled_at,now()) WHERE contact_id=$1 AND consumed_at IS NULL",
        [contactId],
      );
      for (const purpose of ["email_updates", "ads_matching"])
        await q.query(
          "INSERT INTO samra_core.marketing_lead_permissions(contact_id,purpose,granted,notice_version,reason,command_hash) VALUES($1,$2,false,'withdrawal',$3,$4)",
          [contactId, purpose, reason, command],
        );
      await this.#remove(q, contactId);
      await q.query(
        `INSERT INTO samra_core.marketing_audience_sync(contact_id,destination,desired_member) VALUES($1,'resend',false)
        ON CONFLICT(contact_id,destination) DO UPDATE SET desired_member=false,revision=marketing_audience_sync.revision+1,updated_at=now() WHERE marketing_audience_sync.desired_member`,
        [contactId],
      );
    });
  }
  async #remove(q: Pick<pg.Pool, "query">, id: string) {
    for (const destination of ["meta", "google"])
      await q.query(
        `INSERT INTO samra_core.marketing_audience_removals(contact_id,destination) VALUES($1,$2)
   ON CONFLICT(contact_id,destination) DO UPDATE SET revision=marketing_audience_removals.revision+1,requested_at=now()`,
        [id, destination],
      );
  }
  async claimVerificationEmail() {
    return this.#context.run(async () => {
      const q = this.#context.query();
      const selected =
        await q.query(`SELECT c.id FROM samra_core.marketing_lead_challenges c
    JOIN samra_core.marketing_lead_profiles p ON p.contact_id=c.contact_id
    WHERE c.sent_at IS NULL AND c.consumed_at IS NULL AND c.cancelled_at IS NULL
    AND c.expires_at>now() AND c.attempts<5 AND p.suppressed_at IS NULL
    AND (c.lease_until IS NULL OR c.lease_until<now()) ORDER BY c.created_at FOR UPDATE OF c SKIP LOCKED LIMIT 1`);
      if (!selected.rows[0]) return null;
      const id = selected.rows[0].id,
        leaseId = randomUUID();
      const found = await q.query(
        `UPDATE samra_core.marketing_lead_challenges SET lease_id=$2,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE id=$1 RETURNING *`,
        [id, leaseId],
      );
      const row = found.rows[0];
      const contact = await q.query(
        "SELECT email FROM samra_core.marketing_waitlist_contacts WHERE id=$1",
        [row.contact_id],
      );
      const token = this.#keys.token(id, row.key_version);
      if (digest(token) !== row.token_digest)
        throw new Error("MARKETING_TOKEN_KEY_MISMATCH");
      return {
        id,
        leaseId,
        email: contact.rows[0].email as string,
        locale: row.locale as "en" | "am",
        token,
        idempotencyKey: `lead-verification-${id}`,
      };
    });
  }
  async deliverVerificationEmail(
    id: string,
    leaseId: string,
    send: (message: {
      email: string;
      locale: "en" | "am";
      token: string;
      contactId: string;
      idempotencyKey: string;
    }) => Promise<void | { suppressed: true }>,
  ) {
    if (!uuid.test(id) || !uuid.test(leaseId) || typeof send !== "function")
      throw new Error("INVALID_MARKETING_LEASE");
    return this.#context.run(async () => {
      const q = this.#context.query();
      const found = await q.query(
        "SELECT contact_id FROM samra_core.marketing_lead_challenges WHERE id=$1",
        [id],
      );
      if (!found.rows[0]) return false;
      // Lock the profile before the challenge, matching confirmation/withdrawal.
      const profile = await q.query(
        "SELECT suppressed_at FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [found.rows[0].contact_id],
      );
      if (profile.rows[0].suppressed_at) return false;
      const challenge = await q.query(
        "SELECT * FROM samra_core.marketing_lead_challenges WHERE id=$1 AND lease_id=$2 AND lease_until>now() AND sent_at IS NULL AND cancelled_at IS NULL AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [id, leaseId],
      );
      const row = challenge.rows[0];
      if (!row) return false;
      const contact = await q.query(
        "SELECT email FROM samra_core.marketing_waitlist_contacts WHERE id=$1",
        [row.contact_id],
      );
      const token = this.#keys.token(id, row.key_version);
      if (digest(token) !== row.token_digest)
        throw new Error("MARKETING_TOKEN_KEY_MISMATCH");
      // Bounded sender timeout required. Withdrawal cannot race past this send.
      const outcome = await send({
        contactId: row.contact_id,
        email: contact.rows[0].email,
        locale: row.locale,
        token,
        idempotencyKey: `lead-verification-${id}`,
      });
      if (outcome?.suppressed) {
        await this.withdraw(
          row.contact_id,
          "unsubscribed",
          `provider-suppressed-${id}`,
        );
        return false;
      }
      await q.query(
        "UPDATE samra_core.marketing_lead_challenges SET sent_at=now(),lease_until=NULL WHERE id=$1",
        [id],
      );
      return true;
    });
  }
  async withdrawAdvertising(contactId: string, commandId: string) {
    if (!uuid.test(contactId) || !/^[A-Za-z0-9_-]{8,160}$/.test(commandId))
      throw new Error("INVALID_MARKETING_WITHDRAWAL");
    return this.#context.run(async () => {
      const q = this.#context.query();
      const profile = await q.query(
        "SELECT contact_id FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [contactId],
      );
      if (!profile.rowCount) return;
      const command = digest(`withdraw-ads:${commandId}`);
      const prior = await q.query(
        "SELECT 1 FROM samra_core.marketing_lead_permissions WHERE contact_id=$1 AND command_hash=$2",
        [contactId, command],
      );
      if (prior.rowCount) return;
      await q.query(
        "UPDATE samra_core.marketing_lead_profiles SET ads_allowed=false,updated_at=now() WHERE contact_id=$1",
        [contactId],
      );
      await q.query(
        "UPDATE samra_core.marketing_lead_challenges SET cancelled_at=COALESCE(cancelled_at,now()) WHERE contact_id=$1 AND ads_requested AND consumed_at IS NULL",
        [contactId],
      );
      await q.query(
        "INSERT INTO samra_core.marketing_lead_permissions(contact_id,purpose,granted,notice_version,reason,command_hash) VALUES($1,'ads_matching',false,'withdrawal','withdrawn',$2)",
        [contactId, command],
      );
      await this.#remove(q, contactId);
    });
  }
}
