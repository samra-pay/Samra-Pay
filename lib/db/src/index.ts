import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export type SamraDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: SamraDatabase;
  pool: pg.Pool;
}

export interface CreateDatabaseOptions {
  connectionString?: string;
  poolConfig?: Omit<pg.PoolConfig, "connectionString">;
}

let defaultConnection: DatabaseConnection | undefined;

function requireConnectionString(explicitConnectionString?: string): string {
  const connectionString = explicitConnectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required when a database connection is first requested.",
    );
  }

  return connectionString;
}

/**
 * Creates a new, unconnected pool and Drizzle client. PostgreSQL establishes
 * the physical connection only when the first query is executed.
 */
export function createDatabase(
  options: CreateDatabaseOptions = {},
): DatabaseConnection {
  const pool = new Pool({
    ...options.poolConfig,
    connectionString: requireConnectionString(options.connectionString),
  });

  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

/**
 * Returns the process-wide connection lazily. Importing this package never
 * reads DATABASE_URL and never opens a database connection.
 */
export function getDatabaseConnection(): DatabaseConnection {
  defaultConnection ??= createDatabase();
  return defaultConnection;
}

export function getDb(): SamraDatabase {
  return getDatabaseConnection().db;
}

export function getPool(): pg.Pool {
  return getDatabaseConnection().pool;
}

export async function closeDatabase(): Promise<void> {
  const connection = defaultConnection;
  defaultConnection = undefined;

  if (connection) {
    await connection.pool.end();
  }
}

export * from "./schema";
export * from "./postgres-persistence";
export * from "./postgres-ledger";
