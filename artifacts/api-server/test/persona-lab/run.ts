import { validatePersonaManifest } from "./contract.mjs";
import { runPersonaJourneys } from "./runtime";

async function main() {
  if (process.env["SAMRA_PERSONA_LAB_OWNED_DATABASE"] !== "true") {
    throw new Error("PERSONA_DATABASE_OWNERSHIP_REQUIRED");
  }
  const manifest = validatePersonaManifest(
    JSON.parse(process.env["SAMRA_PERSONA_LAB_MANIFEST"] ?? "null"),
  );
  const connectionString = process.env["TEST_DATABASE_URL"];
  const runId = process.env["SAMRA_PERSONA_LAB_RUN_ID"];
  if (!connectionString || !runId)
    throw new Error("PERSONA_RUNTIME_INPUT_REQUIRED");
  const results = await runPersonaJourneys(manifest, {
    connectionString,
    runId,
  });
  process.stdout.write(JSON.stringify({ results }) + "\n");
}

main().catch(() => {
  process.stderr.write("PERSONA_RUNTIME_BLOCKED\n");
  process.exitCode = 1;
});
