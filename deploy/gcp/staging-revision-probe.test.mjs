import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readStagingRevisionProbeContract,
  validateStagingRevisionProbeContract,
} from "./validate-staging-revision-probe.mjs";
import {
  extractStagingRevisionProbeResultFromLogs,
  validateStagingRevisionProbeResult,
} from "./record-staging-revision-probe.mjs";

const revision = "samra-api-aaaaaaaaaaaa";
const execution = "samra-staging-revision-probe-abc123";
const probeId = "svp-123-1";
const passedResult = {
  schemaVersion: 1,
  status: "passed",
  probeId,
  unauthenticatedStatus: 403,
  authenticatedHealthStatus: 200,
  authenticatedReadinessStatus: 200,
  healthResponseSha256: "a".repeat(64),
  readinessResponseSha256: "b".repeat(64),
  observedRevision: revision,
  serviceAuthenticationObserved: true,
  deployedRevisionNetworkPathObserved: true,
  tokenRecorded: false,
};

function logEntry(textPayload) {
  return {
    resource: {
      type: "cloud_run_job",
      labels: { job_name: "samra-staging-revision-probe" },
    },
    labels: { execution_name: execution },
    logName: "projects/samra-pay-staging/logs/run.googleapis.com%2Fstdout",
    timestamp: "2026-08-23T12:00:00.000Z",
    textPayload,
  };
}

test("validates the dormant exact-revision staging probe", () => {
  assert.deepEqual(
    validateStagingRevisionProbeContract(readStagingRevisionProbeContract()),
    {
      schemaVersion: 1,
      status: "validated",
      environment: "staging",
      service: "samra-api",
      checkCount: 2,
      runnerImplemented: true,
      workflowImplemented: true,
      executionAuthorized: false,
    },
  );
});

test("rejects authority, routing, identity, and evidence drift", () => {
  for (const mutate of [
    (value) => (value.workflow.executionAuthorized = true),
    (value) => (value.temporaryRevisionTagAuthorized = true),
    (value) => (value.temporaryServiceUrlAuthorized = true),
    (value) => (value.trafficPercentageMutationAuthorized = true),
    (value) => (value.publicAccessMutationAuthorized = true),
    (value) => (value.runtimeTemplateMutationAuthorized = true),
    (value) => (value.job.vpcEgress = "private-ranges-only"),
    (value) => (value.job.secretAccess = true),
    (value) => (value.federation.runtimeSecretAccess = true),
    (value) => (value.federation.runtimeProjectIam = true),
    (value) => (value.federation.mainOnly = false),
    (value) => value.checks.pop(),
    (value) =>
      (value.probeRunner.dedicatedRuntimeIdentity =
        "samra-api-staging@samra-pay-staging.iam.gserviceaccount.com"),
    (value) => (value.qase.oneCombinedRunRequired = true),
  ]) {
    const changed = structuredClone(readStagingRevisionProbeContract());
    mutate(changed);
    assert.throws(() => validateStagingRevisionProbeContract(changed));
  }
});

test("isolates keyless probe control from its no-secret runtime identity", async () => {
  const [activation, audit] = await Promise.all([
    readFile(
      new URL(
        "./activate-staging-revision-probe-federation.sh",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("./audit-staging-revision-probe-federation.sh", import.meta.url),
      "utf8",
    ),
  ]);
  for (const source of [activation, audit]) {
    assert.match(source, /samra-revision-probe-staging/);
    assert.match(source, /samra-pay-revision-probe-main/);
    assert.match(source, /staging-verification/);
    assert.match(source, /roles\/run\.invoker/);
    assert.match(source, /roles\/iam\.workloadIdentityUser/);
    assert.match(source, /roles\/logging\.viewAccessor/);
    assert.doesNotMatch(source, /roles\/owner|roles\/editor/);
    assert.doesNotMatch(
      source,
      /secretAccessor|credentials\.json|service-account-key/,
    );
  }
  assert.match(activation, /AUTHORIZED_STAGING_REVISION_PROBE_FEDERATION/);
  assert.match(activation, /assertion\.workflow=='Staging verification probe'/);
  assert.match(audit, /assert_member_absent "serviceAccount:\$\{RUNTIME\}"/);
});

test("keeps the controller free of public, traffic-percentage, secret, vendor, and production mutations", async () => {
  const controller = await readFile(
    new URL("./run-staging-revision-probe.sh", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(controller, /--allow-unauthenticated/);
  assert.doesNotMatch(controller, /--to-revisions|--to-latest/);
  assert.doesNotMatch(controller, /--set-secrets|versions\/latest/);
  assert.doesNotMatch(controller, /worf\.replit|auth0|persona|crossmint/i);
  assert.match(controller, /--vpc-egress=all-traffic/);
  assert.match(controller, /--no-default-url/);
  assert.match(controller, /--default-url/);
  assert.match(controller, /--update-tags/);
  assert.match(controller, /--remove-tags/);
});

test("retains both evidence planes with optional protected Qase reporting", async () => {
  const workflow = await readFile(
    new URL(
      "../../.github/workflows/staging-verification-probe.yml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(workflow, /environment:\n\s+name: staging-verification/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /AUTHORIZED_STAGING_REVISION_PROBE/);
  assert.match(workflow, /staging-zero-traffic-samra-api-/);
  assert.match(workflow, /staging-image-verification-/);
  assert.match(
    workflow,
    /qase-tms\/gh-actions\/run-create@[0-9a-f]{40}(?:\s+#.*)?/,
  );
  assert.match(
    workflow,
    /qase-tms\/gh-actions\/report@[0-9a-f]{40}(?:\s+#.*)?/,
  );
  assert.match(
    workflow,
    /qase-tms\/gh-actions\/run-complete@[0-9a-f]{40}(?:\s+#.*)?/,
  );
  assert.match(
    workflow,
    /report_to_qase:[\s\S]*?type: boolean\n        default: false\n        required: false/,
  );
  assert.match(
    workflow,
    /id: qase_create\n        continue-on-error: true\n        if: inputs.mode == 'verify' && inputs.report_to_qase && success\(\)/,
  );
  assert.match(
    workflow,
    /id: qase_complete\n        continue-on-error: true\n        if: inputs.mode == 'verify' && steps.qase_create.outputs.id != '' && !cancelled\(\)/,
  );
  assert.match(
    workflow,
    /name: Record final tamper-evident staging verification\n        if: inputs.mode == 'verify' && success\(\)/,
  );
  assert.doesNotMatch(
    workflow,
    /requires the protected Qase token|steps.qase_complete.outcome ==/,
  );
  for (const id of ["qase_create", "qase_upload", "qase_complete"]) {
    assert.ok(workflow.includes(`"${id}":"\${{ steps.${id}.outcome }}"`));
  }
  assert.match(workflow, /exact-image-private-database\.xml/);
  assert.match(workflow, /exact-deployed-revision-private-http\.xml/);
  assert.match(workflow, /record-staging-verification\.mjs build/);
  assert.match(workflow, /retention-days: 365/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
  assert.doesNotMatch(workflow, /--allow-unauthenticated|--to-latest/);
});

test("accepts exactly one scoped, redacted probe result from restricted logs", () => {
  assert.deepEqual(
    extractStagingRevisionProbeResultFromLogs(
      [logEntry(`SAMRA_REVISION_PROBE_RESULT=${JSON.stringify(passedResult)}`)],
      execution,
      revision,
      probeId,
    ),
    validateStagingRevisionProbeResult(passedResult, revision, probeId),
  );
});

test("rejects ambiguous, cross-execution, or credential-bearing probe logs", () => {
  assert.throws(() =>
    extractStagingRevisionProbeResultFromLogs(
      [
        logEntry(`SAMRA_REVISION_PROBE_RESULT=${JSON.stringify(passedResult)}`),
        logEntry(`SAMRA_REVISION_PROBE_RESULT=${JSON.stringify(passedResult)}`),
      ],
      execution,
      revision,
      probeId,
    ),
  );

  const wrongExecution = logEntry(
    `SAMRA_REVISION_PROBE_RESULT=${JSON.stringify(passedResult)}`,
  );
  wrongExecution.labels.execution_name = "samra-staging-revision-probe-wrong";
  assert.throws(() =>
    extractStagingRevisionProbeResultFromLogs(
      [wrongExecution],
      execution,
      revision,
      probeId,
    ),
  );

  assert.throws(() =>
    validateStagingRevisionProbeResult(
      { ...passedResult, unexpected: "Authorization: Bearer secret" },
      revision,
      probeId,
    ),
  );
});
