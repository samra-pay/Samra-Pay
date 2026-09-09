import { readFile } from "node:fs/promises";
import { createDatabase } from "./index";
import { PostgresPersistenceContext } from "./postgres-persistence";
import {
  assertSharedTestOperatorEnvironment,
  parseSharedTestManifest,
  runSharedTestOperation,
} from "./shared-test-operator";

let connection: ReturnType<typeof createDatabase> | undefined;
try {
  const [path, mode, ...rest] = process.argv.slice(2);
  if (!path || (mode !== undefined && mode !== "--apply") || rest.length) {
    throw new Error("Invalid arguments");
  }
  const manifest = parseSharedTestManifest(
    JSON.parse(await readFile(path, "utf8")),
  );
  const connectionString = assertSharedTestOperatorEnvironment(
    manifest,
    process.env,
  );
  connection = createDatabase({ connectionString, poolConfig: { max: 1 } });
  const receipt = await runSharedTestOperation(
    new PostgresPersistenceContext(connection.pool),
    manifest,
    mode === "--apply",
  );
  console.log(JSON.stringify(receipt));
} catch {
  // Database/parser errors can contain connection strings, subjects or manifest contents.
  console.error(
    "Synthetic setup failed. Check the private manifest, target configuration and database prerequisites. Usage: shared-test:operate <private-manifest.json> [--apply]",
  );
  process.exitCode = 1;
} finally {
  await connection?.pool.end();
}
