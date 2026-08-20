import { runStagingDatabaseAccessAction } from "./staging-database-access";

const action = process.argv[2];
if (!action) {
  throw new Error(
    "Usage: staging-database-access-cli.ts <bootstrap|finalize|audit-migration|audit-runtime>",
  );
}

await runStagingDatabaseAccessAction(action);
console.log(`STAGING DATABASE ACCESS ${action.toUpperCase()} PASS`);
