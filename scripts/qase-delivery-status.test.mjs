import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deliveryReceipt } from "./qase-delivery-status.mjs";

const success = {
  QASE_RUN_ID: "123",
  QASE_PAYLOAD_OUTCOME: "success",
  QASE_UPLOAD_OUTCOME: "success",
  QASE_COMPLETE_OUTCOME: "success",
  QASE_COMPLETION_REQUIRED: "true",
};
test("Qase receipt requires validated payload, run identity, accepted upload, and completion", () => {
  assert.equal(deliveryReceipt(success).status, "delivered-and-completed");
  for (const override of [
    { QASE_RUN_ID: "" },
    { QASE_RUN_ID: "not-an-id" },
    { QASE_PAYLOAD_OUTCOME: "failure" },
    { QASE_UPLOAD_OUTCOME: "failure" },
    { QASE_UPLOAD_OUTCOME: "skipped" },
    { QASE_COMPLETE_OUTCOME: "failure" },
    { QASE_COMPLETE_OUTCOME: "cancelled" },
  ])
    assert.equal(
      deliveryReceipt({ ...success, ...override }).status,
      "not-delivered",
    );
});
test("Qase 403 creation failure cannot become green delivery through skipped steps", () => {
  assert.equal(
    deliveryReceipt({
      QASE_PAYLOAD_OUTCOME: "success",
      QASE_UPLOAD_OUTCOME: "skipped",
      QASE_COMPLETE_OUTCOME: "skipped",
    }).status,
    "not-delivered",
  );
});
test("explicitly open runs require upload but not completion", () => {
  assert.equal(
    deliveryReceipt({
      ...success,
      QASE_COMPLETION_REQUIRED: "false",
      QASE_COMPLETE_OUTCOME: "skipped",
    }).status,
    "delivered-open",
  );
});
test("receipt only retains safe provenance fields", () => {
  const receipt = deliveryReceipt({
    ...success,
    QASE_API_TOKEN: "do-not-copy",
    GITHUB_SHA: "abc",
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "2",
  });
  assert.equal(receipt.commit, "abc");
  assert.equal(receipt.githubRunId, "42");
  assert.doesNotMatch(JSON.stringify(receipt), /do-not-copy|API_TOKEN/);
});


test("CI keeps Qase optional and always records delivery instead of treating tolerated errors as success", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const qase = workflow.split("  qase-report:")[1].split("  required-ci:")[0];
  assert.match(qase, /vars\.QASE_REPORT_ENABLED == 'true'/);
  assert.match(qase, /github\.event\.pull_request\.head\.repo\.fork == false/);
  assert.match(qase, /name: Record actual Qase delivery outcome\n\s+if: always\(\)/);
  assert.match(qase, /steps\.qase-upload-acceptance\.outcome/);
  assert.match(qase, /steps\.qase-complete\.outcome/);
  assert.match(qase, /run: node scripts\/qase-delivery-status\.mjs/);
  assert.match(qase, /path: qase-delivery\.json/);
  assert.doesNotMatch(workflow.split("  required-ci:")[1], /- qase-report/);
});


test("weekly and performance Qase delivery use the same opt-in and truthful receipt", () => {
  for (const file of ["backend-resilience.yml", "ledger-performance.yml"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    const qase = workflow.split("  qase-report:")[1];
    assert.match(qase, /vars\.QASE_REPORT_ENABLED == 'true'/);
    assert.match(qase, /github\.event\.pull_request\.head\.repo\.fork == false/);
    assert.match(qase, /name: Record actual Qase delivery outcome\n\s+if: always\(\)/);
    assert.match(qase, /run: node scripts\/qase-delivery-status\.mjs/);
    assert.match(qase, /path: qase-delivery\.json/);
  }
});
