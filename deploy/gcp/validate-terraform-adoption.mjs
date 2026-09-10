import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const projects = {
  dev: ["samra-pay-dev", "829811168658"],
  test: ["samra-pay-test", "378050809796"],
  staging: ["samra-pay-staging", "934122615631"],
  production: ["samra-pay-production", "382465561715"],
};

export function validateInventory(inventory, environment, now = Date.now()) {
  const expected = projects[environment];
  const p = inventory.project;
  const age = now - Date.parse(inventory.observedAt);
  if (!expected || !Number.isFinite(age) || age < 0 || age > 60 * 60 * 1000 ||
      p?.projectId !== expected[0] || String(p?.projectNumber) !== expected[1] ||
      p?.parent?.type !== "organization" || p?.parent?.id !== "993968777863" ||
      p?.lifecycleState !== "ACTIVE" || !p?.name ||
      inventory.billing?.billingEnabled !== true ||
      inventory.billing?.billingAccountName !== "billingAccounts/01196E-DFC16E-433E6C") {
    throw new Error("Fresh inventory must match the exact active project, company parent and billing account");
  }
  return { project_name: p.name, project_labels: p.labels ?? {} };
}

export function validateAdoptionPlan(plan, environment) {
  const expected = projects[environment];
  if (!expected || plan.errored === true || plan.complete !== true ||
      !Array.isArray(plan.resource_changes) || plan.deferred_changes?.length ||
      plan.resource_drift?.length) {
    throw new Error("Only complete, successful, drift-free project adoption plans are allowed");
  }
  if ((plan.checks ?? []).some((check) => check.status !== "pass")) {
    throw new Error("All Terraform checks must pass");
  }
  const managed = plan.resource_changes.filter((r) => r.mode === "managed");
  if (managed.length !== 1 || managed[0].address !== "module.project.google_project.existing" ||
      managed[0].type !== "google_project") {
    throw new Error("Adoption may own only this environment's existing project container");
  }
  for (const resource of plan.resource_changes) {
    const actions = resource.change?.actions;
    if (!Array.isArray(actions) || actions.length !== 1 ||
        !(actions[0] === "no-op" || (resource.mode === "data" && actions[0] === "read"))) {
      throw new Error(`Infrastructure mutation is forbidden during adoption: ${resource.address}`);
    }
  }
  const change = managed[0].change;
  if (change.importing && change.importing.id !== expected[0]) {
    throw new Error("Import must identify the exact existing project");
  }
  const after = change.after;
  if (after?.project_id !== expected[0] || String(after?.number) !== expected[1] ||
      after?.org_id !== "993968777863" || after?.billing_account !== "01196E-DFC16E-433E6C" ||
      after?.deletion_policy !== "PREVENT") {
    throw new Error("Planned project identity, billing or deletion protection changed");
  }
  return { environment, project: expected[0], importOnly: Boolean(change.importing), infrastructureChanges: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [environment, filename] = process.argv.slice(2);
  console.log(JSON.stringify(validateAdoptionPlan(JSON.parse(readFileSync(filename, "utf8")), environment)));
}
