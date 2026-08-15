import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database migration commands.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./drizzle",
  dialect: "postgresql",
  migrations: {
    schema: "samra_migrations",
    table: "migration_history",
  },
  dbCredentials: {
    url: databaseUrl,
  },
});
