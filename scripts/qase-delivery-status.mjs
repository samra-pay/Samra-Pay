import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function deliveryReceipt(env) {
  const runId = /^[1-9][0-9]*$/.test(env.QASE_RUN_ID ?? "")
    ? env.QASE_RUN_ID
    : null;
  const payloadValidated = env.QASE_PAYLOAD_OUTCOME === "success";
  const uploadAccepted = env.QASE_UPLOAD_OUTCOME === "success";
  const completionRequired = env.QASE_COMPLETION_REQUIRED !== "false";
  const completed = env.QASE_COMPLETE_OUTCOME === "success";
  const delivered =
    !!runId &&
    payloadValidated &&
    uploadAccepted &&
    (!completionRequired || completed);
  return {
    schemaVersion: 1,
    status: delivered
      ? completed
        ? "delivered-and-completed"
        : "delivered-open"
      : "not-delivered",
    runId,
    payloadValidated,
    uploadAccepted,
    completionRequired,
    completed,
    commit: env.GITHUB_SHA ?? null,
    githubRunId: env.GITHUB_RUN_ID ?? null,
    githubRunAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    // This receipt records action outcomes, not independent Qase API read-back.
    evidence: "github-action-outcomes",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const receipt = deliveryReceipt(process.env);
  writeFileSync("qase-delivery.json", JSON.stringify(receipt, null, 2) + "\n");
  const message = `Qase delivery: ${receipt.status}. GitHub test results and Qase delivery are separate outcomes.`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  if (receipt.status === "not-delivered") {
    console.error(
      "::error::Qase delivery was not successful. Check API entitlement and the creation/upload steps; preserved GitHub JUnit remains available.",
    );
    process.exitCode = 1;
  }
}
