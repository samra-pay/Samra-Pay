import { runStagingDatabaseAccessAction } from "./staging-database-access";
import { parseStagingDatabaseAccessActionArguments } from "./staging-database-access-cli-arguments";

const action = parseStagingDatabaseAccessActionArguments(process.argv.slice(2));
if (!action) {
  throw new Error(
    "Usage: staging-database-access-cli.ts <bootstrap|finalize|audit-migration|audit-runtime>",
  );
}

await runStagingDatabaseAccessAction(action);
console.log(`STAGING DATABASE ACCESS ${action.toUpperCase()} PASS`);
