import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateInventory } from "./validate-terraform-adoption.mjs";

const [environment, account, destination] = process.argv.slice(2);
const project = { dev: "samra-pay-dev", test: "samra-pay-test", staging: "samra-pay-staging", production: "samra-pay-production" }[environment];
if (!project || !account || !destination || !/^[^\s@]+@[^\s@]+$/.test(account)) {
  throw new Error("Usage: node deploy/gcp/audit-terraform-project.mjs <dev|test|staging|production> <existing-account> <new-private-output-directory>");
}
// Metadata only: never read a secret version, database, access token or Terraform state.
function read(args) {
  return JSON.parse(execFileSync("gcloud", [...args, `--account=${account}`, `--project=${project}`, "--format=json", "--quiet"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}
const inventory = {
  observedAt: new Date().toISOString(),
  project: read(["projects", "describe", project]),
  billing: read(["billing", "projects", "describe", project]),
};
const variables = validateInventory(inventory, environment);
const output = resolve(destination);
mkdirSync(output, { mode: 0o700 }); // Refuse to overwrite any prior audit.
writeFileSync(resolve(output, "inventory.json"), JSON.stringify(inventory, null, 2) + "\n", { mode: 0o600, flag: "wx" });
writeFileSync(resolve(output, "snapshot.tfvars.json"), JSON.stringify(variables, null, 2) + "\n", { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ environment, project, observedAt: inventory.observedAt, status: "project-metadata-verified-not-security-certified", output }));
