import { pathToFileURL } from "node:url";
import { createLaunchUpdatesConnectionTest } from "./server.mjs";

// Setup metadata, not proof of deployed IAM or permission to execute a test.
export const connectionTestTarget = Object.freeze({
  projectId: "samra-pay-production",
  region: "us-east4",
  jobName: "samra-production-resend-test",
  secretVersion: "1",
});

const configurationErrors = new Set([
  "LAUNCH_UPDATES_DISABLED",
  "LAUNCH_UPDATES_TEST_CONFIGURATION_INVALID",
  "LAUNCH_UPDATES_TEST_APPROVAL_EXPIRED",
  "LAUNCH_UPDATES_TEST_RECIPIENT_UNAVAILABLE",
]);
const transportErrors = new Set([
  "SERVER_ONLY",
  "INVALID_CONFIGURATION",
  "INVALID_REQUEST",
  "INVALID_RESPONSE",
  "REQUEST_TIMEOUT",
  "REDIRECT_REJECTED",
  "AUTHORIZATION_FAILED",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "REQUEST_REJECTED",
  "REQUEST_FAILED",
]);

function outcome(exitCode, status, detail = {}) {
  return Object.freeze({
    exitCode,
    report: Object.freeze({
      event: "samra_resend_connection_test",
      status,
      ...detail,
    }),
  });
}

/**
 * One-shot runner for a separately approved private Cloud Run Job.
 * Imports, disabled runs and missing/mismatched guards never access the key.
 * Tests inject a synthetic environment/network. No cloud credential is read
 * by this module: the approved job must mount the pinned secret itself.
 */
export async function runConnectionTest({
  args = [],
  env = {},
  fetchImpl,
  now,
} = {}) {
  try {
    if (
      typeof window !== "undefined" ||
      !Array.isArray(args) ||
      !env ||
      typeof env !== "object"
    ) {
      return outcome(1, "blocked", { code: "TEST_EXECUTION_NOT_CONFIGURED" });
    }
    const mode = env.SAMRA_LAUNCH_UPDATES_MODE ?? "disabled";
    if (args.length === 0 && mode === "disabled") {
      return outcome(0, "disabled");
    }
    if (
      args.length !== 1 ||
      args[0] !== "--send-approved-test" ||
      mode !== "test" ||
      env.SAMRA_CLOUD_PROJECT_ID !== connectionTestTarget.projectId ||
      env.SAMRA_RESEND_SECRET_VERSION !== connectionTestTarget.secretVersion ||
      env.CLOUD_RUN_JOB !== connectionTestTarget.jobName ||
      env.CLOUD_RUN_TASK_COUNT !== "1" ||
      env.CLOUD_RUN_TASK_INDEX !== "0" ||
      env.CLOUD_RUN_TASK_ATTEMPT !== "0" ||
      env.K_SERVICE !== undefined
    ) {
      return outcome(1, "blocked", { code: "TEST_EXECUTION_NOT_CONFIGURED" });
    }

    const client = createLaunchUpdatesConnectionTest({ env, fetchImpl, now });
    const result = await client.sendConnectionTest();
    // API acceptance is deliberately not labelled inbox delivery or signup.
    return outcome(0, "provider_accepted", { messageId: result.id });
  } catch (error) {
    let code = "TEST_FAILED";
    if (configurationErrors.has(error?.message)) code = error.message;
    else if (
      error?.name === "ResendTransportError" &&
      transportErrors.has(error.code)
    ) {
      code = error.code;
    }
    return outcome(1, "failed", { code });
  }
}

// Merely importing this file does not read process.env or call the provider.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runConnectionTest({
    args: process.argv.slice(2),
    env: process.env,
    fetchImpl: globalThis.fetch,
  });
  process.stdout.write(`${JSON.stringify(result.report)}\n`);
  process.exitCode = result.exitCode;
}
