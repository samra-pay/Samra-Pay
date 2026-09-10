import assert from "node:assert/strict";
import test from "node:test";
import { validateAdoptionPlan, validateInventory } from "./validate-terraform-adoption.mjs";

function plan() {
  return {
    complete: true, checks: [{ status: "pass" }],
    resource_changes: [{
      address: "module.project.google_project.existing", mode: "managed", type: "google_project",
      change: { actions: ["no-op"], importing: { id: "samra-pay-dev" }, after: {
        project_id: "samra-pay-dev", number: "829811168658", org_id: "993968777863",
        billing_account: "01196E-DFC16E-433E6C", deletion_policy: "PREVENT",
      } },
    }],
  };
}

test("accepts import-only and later no-change project plans", () => {
  assert.equal(validateAdoptionPlan(plan(), "dev").infrastructureChanges, 0);
  const p = plan(); delete p.resource_changes[0].change.importing;
  assert.equal(validateAdoptionPlan(p, "dev").importOnly, false);
});

test("blocks mutations, incomplete checks, cross-project adoption and deletion exposure", () => {
  const mutations = [
    p => { p.complete = false; },
    p => { p.errored = true; },
    p => { p.deferred_changes = [{}]; },
    p => { p.resource_drift = [{}]; },
    p => { p.checks[0].status = "unknown"; },
    p => { p.resource_changes = []; },
    p => { p.resource_changes.push(structuredClone(p.resource_changes[0])); },
    p => { p.resource_changes[0].change.importing.id = "samra-pay-production"; },
    p => { p.resource_changes[0].change.after.org_id = "614833350075"; },
    p => { p.resource_changes[0].change.after.number = "382465561715"; },
    p => { p.resource_changes[0].change.after.billing_account = "01B42D-76504F-1D2458"; },
    p => { p.resource_changes[0].change.after.deletion_policy = "DELETE"; },
    ...[["create"], ["update"], ["delete"], ["delete", "create"], ["forget"], []].map(
      actions => p => { p.resource_changes[0].change.actions = actions; }),
  ];
  for (const mutate of mutations) {
    const p = plan(); mutate(p); assert.throws(() => validateAdoptionPlan(p, "dev"));
  }
  assert.throws(() => validateAdoptionPlan(plan(), "production"));
});

test("snapshot rejects stale, disabled-billing and source-organization inventory", () => {
  const now = Date.now();
  const inventory = {
    observedAt: new Date(now).toISOString(),
    project: { projectId: "samra-pay-dev", projectNumber: "829811168658", name: "Samra Pay Development",
      parent: { type: "organization", id: "993968777863" }, lifecycleState: "ACTIVE", labels: { environment: "dev" } },
    billing: { billingEnabled: true, billingAccountName: "billingAccounts/01196E-DFC16E-433E6C" },
  };
  assert.deepEqual(validateInventory(inventory, "dev", now).project_labels, { environment: "dev" });
  assert.throws(() => validateInventory(inventory, "dev", now + 3600001));
  for (const mutate of [
    i => { i.project.parent.id = "614833350075"; },
    i => { i.billing.billingEnabled = false; },
    i => { i.project.lifecycleState = "DELETE_REQUESTED"; },
  ]) {
    const i = structuredClone(inventory); mutate(i);
    assert.throws(() => validateInventory(i, "dev", now));
  }
});
