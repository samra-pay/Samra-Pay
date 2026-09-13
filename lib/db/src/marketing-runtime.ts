import pg from "pg";
import { PostgresPersistenceContext } from "./postgres-persistence";
import {
  MarketingLeadTokenKeys,
  PostgresMarketingLeadStore,
} from "./postgres-marketing-leads";
import { PostgresMarketingActivationStore } from "./postgres-marketing-activation";
export function createMarketingPersistence({
  connectionString,
  ca,
  keys,
  activeVersion,
}: {
  connectionString: string;
  ca: string;
  keys: Record<string, Buffer>;
  activeVersion: string;
}) {
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.search ||
    !ca.includes("BEGIN CERTIFICATE")
  )
    throw new Error("MARKETING_DATABASE_TLS_REQUIRED");
  const pool = new pg.Pool({
    connectionString,
    ssl: { ca, rejectUnauthorized: true },
    max: 4,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
  });
  const context = new PostgresPersistenceContext(pool);
  const leads = new PostgresMarketingLeadStore(
    context,
    new MarketingLeadTokenKeys(keys, activeVersion),
  );
  return {
    leads,
    activation: new PostgresMarketingActivationStore(context, leads),
    close: () => pool.end(),
  };
}
