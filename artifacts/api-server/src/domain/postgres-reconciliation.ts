import type { PostgresPersistenceContext } from "@workspace/db";
import { DomainError } from "@workspace/remittance";
import type {
  DemoReconciliationRun,
  ReconciliationStore,
} from "./demo-runtime";

export class PostgresReconciliationStore implements ReconciliationStore {
  readonly #context: PostgresPersistenceContext;

  constructor(context: PostgresPersistenceContext) {
    this.#context = context;
  }

  async save(run: DemoReconciliationRun): Promise<void> {
    const query = this.#context.query();
    const inserted = await query.query<{ id: string }>(
      `INSERT INTO samra_core.reconciliation_runs (
         external_ref, provider, state, period_start, period_end,
         matched_count, exception_count, started_at, completed_at
       ) VALUES ($1,'caliza','completed',$2,$3,$4,$5,$2,$3)
       ON CONFLICT (external_ref) DO UPDATE SET completed_at = EXCLUDED.completed_at
       RETURNING id`,
      [
        run.id,
        run.startedAt,
        run.completedAt,
        run.items.filter((item) => item.classification === "matched").length,
        run.items.filter((item) => item.classification !== "matched").length,
      ],
    );
    const runId = inserted.rows[0]!.id;
    for (const [sequence, item] of run.items.entries()) {
      const transfer = await query.query<{ id: string }>(
        `SELECT id FROM samra_core.remittance_transfers WHERE external_ref = $1`,
        [item.matchKey],
      );
      const insertedItem = await query.query<{ id: string }>(
        `INSERT INTO samra_core.reconciliation_items (
           run_id, match_key, result, internal_resource_type,
           internal_resource_id, internal_currency, provider_currency,
           internal_amount_minor, provider_amount_minor, details
         ) VALUES ($1,$2,$3,'remittance_transfer',$4,$5,$6,$7,$8,$9::jsonb)
         ON CONFLICT (run_id, match_key) DO NOTHING
         RETURNING id`,
        [
          runId,
          item.matchKey,
          toDatabaseClassification(item.classification),
          transfer.rows[0]?.id ?? null,
          item.internalAmount?.currency ?? null,
          item.externalAmount?.currency ?? null,
          item.internalAmount?.minorUnits ?? null,
          item.externalAmount?.minorUnits ?? null,
          JSON.stringify({ classification: item.classification, sequence }),
        ],
      );
      const itemId =
        insertedItem.rows[0]?.id ??
        (await resolveReconciliationItemReplay(query, {
          runId,
          matchKey: item.matchKey,
          classification: toDatabaseClassification(item.classification),
          internalCurrency: item.internalAmount?.currency ?? null,
          providerCurrency: item.externalAmount?.currency ?? null,
          internalAmountMinor: item.internalAmount?.minorUnits ?? null,
          providerAmountMinor: item.externalAmount?.minorUnits ?? null,
        }));
      if (item.classification !== "matched") {
        const exceptionCode = toDatabaseClassification(item.classification);
        await query.query(
          `INSERT INTO samra_core.reconciliation_exceptions
           (item_id, exception_code, state, summary, opened_at, updated_at)
           VALUES ($1,$2,'open',$3,$4,$4)
           ON CONFLICT (item_id, exception_code) DO NOTHING`,
          [
            itemId,
            exceptionCode,
            reconciliationSummary(item.classification, item.matchKey),
            run.completedAt,
          ],
        );
        await query.query(
          `INSERT INTO samra_core.audit_events
           (event_key, actor_type, action, entity_type, entity_id,
            correlation_id, metadata, occurred_at)
           VALUES ($1,'system','reconciliation_exception_opened',
                   'remittance_transfer',$2,$3,$4::jsonb,$5)
           ON CONFLICT (event_key) DO NOTHING`,
          [
            `reconciliation:${run.id}:exception:${item.matchKey}:${exceptionCode}`,
            item.matchKey,
            run.id,
            JSON.stringify({ classification: item.classification }),
            run.completedAt,
          ],
        );
      }
    }
    await query.query(
      `INSERT INTO samra_core.audit_events
       (event_key, actor_type, action, entity_type, entity_id, correlation_id, metadata, occurred_at)
       VALUES ($1,'system','reconciliation_completed','reconciliation_run',$2,$2,$3::jsonb,$4)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        `reconciliation:${run.id}:completed`,
        run.id,
        JSON.stringify({
          matchedCount: run.items.filter(
            (item) => item.classification === "matched",
          ).length,
          exceptionCount: run.items.filter(
            (item) => item.classification !== "matched",
          ).length,
        }),
        run.completedAt,
      ],
    );
  }

  async get(runId: string): Promise<DemoReconciliationRun | undefined> {
    const run = await this.#context.query().query<{
      id: string;
      external_ref: string;
      started_at: Date;
      completed_at: Date;
    }>(
      `SELECT id, external_ref, started_at, completed_at
       FROM samra_core.reconciliation_runs WHERE external_ref = $1`,
      [runId],
    );
    const row = run.rows[0];
    if (!row) return undefined;
    const items = await this.#context.query().query<{
      match_key: string;
      result: string;
      internal_currency: "USD" | "ETB" | null;
      provider_currency: "USD" | "ETB" | null;
      internal_amount_minor: string | null;
      provider_amount_minor: string | null;
      details: {
        classification?: DemoReconciliationRun["items"][number]["classification"];
      };
    }>(
      `SELECT match_key, result, internal_currency, provider_currency,
              internal_amount_minor, provider_amount_minor, details
       FROM samra_core.reconciliation_items WHERE run_id = $1
       ORDER BY CASE
                  WHEN jsonb_typeof(details->'sequence') = 'number'
                    THEN (details->>'sequence')::integer
                  ELSE NULL
                END NULLS LAST,
                created_at, match_key`,
      [row.id],
    );
    return Object.freeze({
      id: row.external_ref,
      status: "completed" as const,
      provider: "caliza" as const,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at.toISOString(),
      items: Object.freeze(
        items.rows.map((item) =>
          Object.freeze({
            id: `recon_item_${item.match_key}`,
            matchKey: item.match_key,
            classification:
              item.details.classification ??
              fromDatabaseClassification(item.result),
            ...(item.internal_currency && item.internal_amount_minor
              ? {
                  internalAmount: {
                    currency: item.internal_currency,
                    minorUnits: item.internal_amount_minor,
                  },
                }
              : {}),
            ...(item.provider_currency && item.provider_amount_minor
              ? {
                  externalAmount: {
                    currency: item.provider_currency,
                    minorUnits: item.provider_amount_minor,
                  },
                }
              : {}),
          }),
        ),
      ),
    });
  }
}

function reconciliationSummary(
  classification: DemoReconciliationRun["items"][number]["classification"],
  matchKey: string,
): string {
  switch (classification) {
    case "amount_mismatch":
      return `Provider evidence does not match Samra's amount for ${matchKey}.`;
    case "missing_externally":
      return `Samra transfer ${matchKey} is missing from provider evidence.`;
    case "missing_internally":
      return `Provider evidence has no matching Samra transfer for ${matchKey}.`;
    case "currency_mismatch":
      return `Provider evidence uses a different currency for ${matchKey}.`;
    case "status_mismatch":
      return `Provider status does not match Samra's transfer state for ${matchKey}.`;
    default:
      return `Reconciliation requires review for ${matchKey}.`;
  }
}

function toDatabaseClassification(
  classification: DemoReconciliationRun["items"][number]["classification"],
) {
  if (classification === "missing_internally") return "missing_internal";
  if (classification === "missing_externally") return "missing_provider";
  if (classification === "amount_mismatch") return "amount_mismatch";
  if (classification === "currency_mismatch") return "currency_mismatch";
  if (classification === "matched") return "matched";
  return "status_mismatch";
}

function fromDatabaseClassification(
  classification: string,
): DemoReconciliationRun["items"][number]["classification"] {
  if (classification === "missing_internal") return "missing_internally";
  if (classification === "missing_provider") return "missing_externally";
  if (classification === "amount_mismatch") return "amount_mismatch";
  if (classification === "currency_mismatch") return "currency_mismatch";
  if (classification === "matched") return "matched";
  return "status_mismatch";
}

async function resolveReconciliationItemReplay(
  query: ReturnType<PostgresPersistenceContext["query"]>,
  expected: Readonly<{
    runId: string;
    matchKey: string;
    classification: string;
    internalCurrency: string | null;
    providerCurrency: string | null;
    internalAmountMinor: string | null;
    providerAmountMinor: string | null;
  }>,
): Promise<string> {
  const replay = await query.query<{
    id: string;
    result: string;
    internal_currency: string | null;
    provider_currency: string | null;
    internal_amount_minor: string | null;
    provider_amount_minor: string | null;
  }>(
    `SELECT id, result, internal_currency, provider_currency,
            internal_amount_minor::text, provider_amount_minor::text
     FROM samra_core.reconciliation_items
     WHERE run_id = $1 AND match_key = $2`,
    [expected.runId, expected.matchKey],
  );
  const existing = replay.rows[0];
  if (
    !existing ||
    existing.result !== expected.classification ||
    existing.internal_currency !== expected.internalCurrency ||
    existing.provider_currency !== expected.providerCurrency ||
    existing.internal_amount_minor !== expected.internalAmountMinor ||
    existing.provider_amount_minor !== expected.providerAmountMinor
  ) {
    throw new DomainError(
      "CONFLICT",
      "The reconciliation item already exists with different evidence.",
      { matchKey: expected.matchKey },
    );
  }
  return existing.id;
}
