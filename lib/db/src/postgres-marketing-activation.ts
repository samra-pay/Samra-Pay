import { createHash } from "node:crypto";
import { PostgresPersistenceContext } from "./postgres-persistence";
import { PostgresMarketingLeadStore } from "./postgres-marketing-leads";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
type Provider = "meta" | "google" | "resend";
export type AudienceAdapter = {
  submit(input: { email: string; member: boolean }): Promise<{
    state: "accepted" | "pending" | "suppressed";
    requestId: string;
  }>;
  status(requestId: string): Promise<"accepted" | "pending" | "blocked">;
};
/** Owns database transactions, not HTTP authentication. Called only after signature/capability verification. */
export class PostgresMarketingActivationStore {
  constructor(
    private context: PostgresPersistenceContext,
    private leads: PostgresMarketingLeadStore,
  ) {}
  async allowRequest(
    bucket: "register" | "confirm" | "preferences" | "webhook",
    limit: number,
  ) {
    if (
      !["register", "confirm", "preferences", "webhook"].includes(bucket) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10000
    )
      throw new Error("INVALID_LIMIT");
    const r = await this.context.query().query(
      `INSERT INTO samra_core.marketing_request_limits(bucket,window_start,requests) VALUES($1,date_trunc('minute',now()),1)
  ON CONFLICT(bucket) DO UPDATE SET window_start=date_trunc('minute',now()),requests=CASE WHEN marketing_request_limits.window_start=date_trunc('minute',now()) THEN marketing_request_limits.requests+1 ELSE 1 END RETURNING requests`,
      [bucket],
    );
    return r.rows[0].requests <= limit;
  }
  async contactForChallenge(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const r = await this.context
      .query()
      .query(
        "SELECT contact_id FROM samra_core.marketing_lead_challenges WHERE token_digest=$1 AND expires_at>now() AND cancelled_at IS NULL",
        [hash(token)],
      );
    return r.rows[0]?.contact_id ?? null;
  }
  async providerEvent(event: {
    id: string;
    payloadHash: string;
    type: string;
    email: string | null;
    reason: "unsubscribed" | "complained" | "bounced" | null;
  }) {
    if (
      !/^[A-Za-z0-9_-]{8,160}$/.test(event.id) ||
      !/^[a-f0-9]{64}$/.test(event.payloadHash) ||
      event.type.length > 80
    )
      throw new Error("INVALID_PROVIDER_EVENT");
    return this.context.run(async () => {
      const q = this.context.query();
      const eventHash = hash(event.id);
      await q.query("SELECT pg_advisory_xact_lock(hashtextextended($1,20))", [
        eventHash,
      ]);
      const prior = await q.query(
        "SELECT payload_hash FROM samra_core.marketing_provider_events WHERE event_hash=$1",
        [eventHash],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].payload_hash !== event.payloadHash)
          throw new Error("PROVIDER_EVENT_CONFLICT");
        return;
      }
      // Signed account-wide suppression is conservative: never re-enable from provider events.
      if (event.email && event.reason) {
        const email = event.email.trim().normalize("NFKC").toLowerCase();
        await q.query("SELECT pg_advisory_xact_lock(hashtextextended($1,21))", [
          hash(email),
        ]);
        await q.query(
          "INSERT INTO samra_core.marketing_email_suppressions(email_hash,reason) VALUES($1,$2) ON CONFLICT(email_hash) DO NOTHING",
          [hash(email), event.reason],
        );
        const found = await q.query(
          "SELECT p.contact_id FROM samra_core.marketing_lead_profiles p JOIN samra_core.marketing_waitlist_contacts c ON c.id=p.contact_id WHERE c.email_hash=$1 AND c.email=$2",
          [hash(email), email],
        );
        if (found.rows[0])
          await this.leads.withdraw(
            found.rows[0].contact_id,
            event.reason,
            event.id,
          );
      }
      await q.query(
        "INSERT INTO samra_core.marketing_provider_events(event_hash,payload_hash,event_type) VALUES($1,$2,$3)",
        [eventHash, event.payloadHash, event.type],
      );
    });
  }
  async runAudience(destination: Provider, adapter: AudienceAdapter) {
    if (!["meta", "google", "resend"].includes(destination))
      throw new Error("INVALID_DESTINATION");
    // A durable intent is committed BEFORE any network call. A crashed submission is never replayed automatically.
    const intent = await this.context.run(async () => {
      const q = this.context.query();
      await q.query(
        "UPDATE samra_core.marketing_audience_sync SET state='uncertain',updated_at=now() WHERE destination=$1 AND state='submitting' AND updated_at<now()-interval '2 minutes'",
        [destination],
      );
      const rows = await q.query(
        `SELECT * FROM samra_core.marketing_audience_sync WHERE destination=$1 AND next_attempt_at<=now()
    AND ((state='idle' AND acknowledged_revision<revision) OR state='pending')
    ORDER BY desired_member,updated_at FOR UPDATE SKIP LOCKED LIMIT 1`,
        [destination],
      );
      const row = rows.rows[0];
      if (!row) return null;
      if (row.state === "pending") {
        await q.query(
          "UPDATE samra_core.marketing_audience_sync SET next_attempt_at=now()+interval '1 minute' WHERE contact_id=$1 AND destination=$2",
          [row.contact_id, destination],
        );
        return row;
      }
      await q.query(
        "UPDATE samra_core.marketing_audience_sync SET state='submitting',submitted_revision=revision,submitted_member=desired_member,attempts=attempts+1,updated_at=now() WHERE contact_id=$1 AND destination=$2",
        [row.contact_id, destination],
      );
      return {
        ...row,
        submitted_revision: row.revision,
        submitted_member: row.desired_member,
        state: "submitting",
      };
    });
    if (!intent) return { processed: false };
    return this.context.run(async () => {
      const q = this.context.query();
      // Same profile-first lock order as confirm/withdraw. Transport timeout is bounded by the adapter.
      const p = await q.query(
        "SELECT ads_allowed,verified_at,email_active,suppressed_at FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [intent.contact_id],
      );
      const locked = await q.query(
        "SELECT * FROM samra_core.marketing_audience_sync WHERE contact_id=$1 AND destination=$2 FOR UPDATE",
        [intent.contact_id, destination],
      );
      const row = locked.rows[0];
      if (
        !row ||
        row.state !== intent.state ||
        row.submitted_revision !== intent.submitted_revision
      )
        return { processed: false };
      const update = async (
        state: string,
        requestId: string | null,
        ack = false,
      ) =>
        q.query(
          `UPDATE samra_core.marketing_audience_sync SET state=$3,request_id=$4,
    acknowledged_revision=CASE WHEN $5 THEN submitted_revision ELSE acknowledged_revision END,
    next_attempt_at=now()+interval '1 minute',updated_at=now() WHERE contact_id=$1 AND destination=$2`,
          [intent.contact_id, destination, state, requestId, ack],
        );
      if (row.state === "pending") {
        try {
          const state = await adapter.status(row.request_id);
          await update(
            state === "accepted" ? "idle" : state,
            row.request_id,
            state === "accepted",
          );
        } catch {
          await update("pending", row.request_id);
        }
        return { processed: true };
      }
      const eligible =
        (destination === "resend" || !!p.rows[0]?.ads_allowed) &&
        !!p.rows[0]?.verified_at &&
        !!p.rows[0]?.email_active &&
        !p.rows[0]?.suppressed_at;
      if (
        row.revision !== row.submitted_revision ||
        row.submitted_member !== eligible
      ) {
        await update("idle", null);
        return { processed: false };
      }
      const contact = await q.query(
        "SELECT email FROM samra_core.marketing_waitlist_contacts WHERE id=$1",
        [row.contact_id],
      );
      try {
        const result = await adapter.submit({
          email: contact.rows[0].email,
          member: eligible,
        });
        if (destination === "resend" && result.state === "suppressed") {
          await this.leads.withdraw(
            row.contact_id,
            "unsubscribed",
            `resend-suppressed-${row.submitted_revision}-${row.contact_id}`,
          );
          await update("idle", null, true);
          return { processed: true };
        }
        if (
          !["accepted", "pending"].includes(result.state) ||
          typeof result.requestId !== "string" ||
          result.requestId.length > 256
        )
          throw new Error("INVALID_PROVIDER_RECEIPT");
        await update(
          result.state === "accepted" ? "idle" : "pending",
          result.requestId,
          result.state === "accepted",
        );
      } catch {
        await update("uncertain", null);
      }
      return { processed: true };
    });
  }
  /** Trusted operator only. Evidence must establish the fate of this exact submission before retry. */
  async reconcileAudience(input: {
    contactId: string;
    destination: Provider;
    submittedRevision: number;
    disposition: "accepted" | "not_applied";
    evidenceDigest: string;
  }) {
    if (
      !["meta", "google", "resend"].includes(input.destination) ||
      !Number.isInteger(input.submittedRevision) ||
      !["accepted", "not_applied"].includes(input.disposition) ||
      !/^[a-f0-9]{64}$/.test(input.evidenceDigest)
    )
      throw new Error("INVALID_RECONCILIATION");
    return this.context.run(async () => {
      const q = this.context.query();
      await q.query(
        "SELECT contact_id FROM samra_core.marketing_lead_profiles WHERE contact_id=$1 FOR UPDATE",
        [input.contactId],
      );
      const found = await q.query(
        "SELECT * FROM samra_core.marketing_audience_sync WHERE contact_id=$1 AND destination=$2 FOR UPDATE",
        [input.contactId, input.destination],
      );
      const row = found.rows[0];
      if (
        !row ||
        !["uncertain", "blocked"].includes(row.state) ||
        row.submitted_revision !== input.submittedRevision
      )
        throw new Error("STALE_RECONCILIATION");
      await q.query(
        "INSERT INTO samra_core.marketing_audience_reconciliations(contact_id,destination,submitted_revision,disposition,evidence_digest) VALUES($1,$2,$3,$4,$5)",
        [
          input.contactId,
          input.destination,
          input.submittedRevision,
          input.disposition,
          input.evidenceDigest,
        ],
      );
      await q.query(
        "UPDATE samra_core.marketing_audience_sync SET state='idle',acknowledged_revision=CASE WHEN $3 THEN submitted_revision ELSE acknowledged_revision END,next_attempt_at=now(),updated_at=now() WHERE contact_id=$1 AND destination=$2",
        [input.contactId, input.destination, input.disposition === "accepted"],
      );
    });
  }
  async metrics() {
    const q = this.context.query();
    const leads =
      await q.query(`SELECT count(*)::int AS registered,count(*) FILTER(WHERE verified_at IS NOT NULL)::int AS verified,
   count(*) FILTER(WHERE email_active AND suppressed_at IS NULL)::int AS email_active,count(*) FILTER(WHERE ads_allowed)::int AS advertising_allowed FROM samra_core.marketing_lead_profiles`);
    const sync = await q.query(
      "SELECT destination,state,count(*)::int AS count,min(updated_at) AS oldest FROM samra_core.marketing_audience_sync WHERE acknowledged_revision<revision OR state<>'idle' GROUP BY destination,state",
    );
    return { leads: leads.rows[0], pending: sync.rows };
  }
}
