import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImagePublicationManifest,
} from "./record-staging-image-publication.mjs";
import {
  buildStagingImageVerificationManifest,
  extractStagingVerificationJUnitFromLogs,
  validateStagingImageVerificationManifest,
  validateStagingVerificationJUnit,
  verifyStagingImageVerificationManifest,
  writeStagingImageVerificationManifest,
} from "./record-staging-image-verification.mjs";
import {
  buildStagingZeroTrafficDeploymentManifest,
  writeZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import { validateStagingVerificationManifest } from "./record-staging-verification.mjs";
import {
  STAGING_IMAGE_VERIFICATION_CHECKS,
  readStagingImageVerificationContract,
  validateStagingImageVerificationContract,
} from "./validate-staging-image-verification.mjs";
import {
  imageSecurityGate,
  releaseCandidateLineage,
} from "./staging-release-test-fixtures.mjs";

const candidateSha = "a".repeat(40);
const service = "samra-api";
const revision = `${service}-${candidateSha.slice(0, 12)}`;
const execFileAsync = promisify(execFile);
const workflow = await readFile(
  ".github/workflows/staging-image-verification.yml",
  "utf8",
);
const controller = await readFile(
  "deploy/gcp/run-staging-image-verification.sh",
  "utf8",
);
const activation = await readFile(
  "deploy/gcp/activate-staging-image-verification-federation.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-staging-image-verification-federation.sh",
  "utf8",
);
const digest = (name, value = "c") =>
  `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/${name}@sha256:${value.repeat(64)}`;

function publication() {
  const gitTreeSha = "d".repeat(40);
  const imageDigests = Object.fromEntries(
    STAGING_IMAGE_NAMES.map((name) => [name, digest(name)]),
  );
  return buildStagingImagePublicationManifest({
    candidateSha,
    gitTreeSha,
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    repository: "samra-staging",
    sourceRepository: "samra-pay/Samra-Pay",
    cloudBuildId: "0ebc07c2-3e97-4d6c-8ff3-1bbf6229db00",
    publisherIdentity:
      "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com",
    buildServiceAccount:
      "samra-cloud-build-staging@samra-pay-staging.iam.gserviceaccount.com",
    githubRunId: "32608456303",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:00:00.000Z",
    imageDigests,
    securityGate: imageSecurityGate(imageDigests),
    releaseCandidate: releaseCandidateLineage(candidateSha, gitTreeSha),
  });
}

function deployment() {
  return buildStagingZeroTrafficDeploymentManifest({
    publication: publication(),
    publicationManifestSha256: "e".repeat(64),
    targetService: service,
    revisionName: revision,
    imageDigest: digest(service),
    deployerIdentity:
      "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com",
    configurationSha256: "f".repeat(64),
    trafficBefore: [],
    trafficAfter: [],
    githubRunId: "32611669347",
    githubRunAttempt: "1",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T00:10:00.000Z",
  });
}

function observation(overrides = {}) {
  return {
    revision,
    imageDigest: digest(service),
    revisionAttestation: {
      ready: true,
      exactImageDigest: true,
      privateIngress: true,
      defaultServiceUrlDisabled: true,
      publicIamAbsent: true,
    },
    syntheticRunId: "verify-a1b2c3",
    jobExecutionId: "samra-api-verifier-a1b2c3",
    junitSha256: "1".repeat(64),
    runtimeServiceAccount:
      "samra-verifier-staging@samra-pay-staging.iam.gserviceaccount.com",
    databaseSecretVersion: "7",
    imageChecks: Object.fromEntries(
      STAGING_IMAGE_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
    generatedAt: "2026-08-23T00:20:00.000Z",
    ...overrides,
  };
}

function verification(overrides = {}) {
  return buildStagingImageVerificationManifest({
    zeroTrafficDeployment: deployment(),
    zeroTrafficDeploymentManifestSha256: "2".repeat(64),
    ...observation(),
    ...overrides,
  });
}

test("validates the exact-image runner as implemented but non-promotable", () => {
  assert.deepEqual(
    validateStagingImageVerificationContract(
      readStagingImageVerificationContract(),
    ),
    {
      schemaVersion: 1,
      status: "validated",
      environment: "staging",
      service: "samra-api",
      testCount: 9,
      imageCheckCount: 6,
      runnerImplemented: true,
      workflowImplemented: true,
      executionAuthorized: false,
      promotionEligible: false,
    },
  );
});

test("rejects contract drift that overstates execution or promotion authority", () => {
  for (const mutate of [
    (value) => (value.imageRunner.executionAuthorized = true),
    (value) => (value.workflowImplemented = false),
    (value) => (value.workflow.implemented = false),
    (value) => (value.promotionEligible = true),
    (value) => value.imageChecks.pop(),
    (value) => value.excludedPromotionChecks.pop(),
    (value) => (value.trafficMutationAuthorized = true),
    (value) => (value.imageRunner.testCount = 8),
  ]) {
    const changed = structuredClone(readStagingImageVerificationContract());
    mutate(changed);
    assert.throws(() => validateStagingImageVerificationContract(changed));
  }
});

function junitDocument() {
  const testCases = Array.from({ length: 9 }, (_, index) => {
    const id = `SYNTH-DAILY-${String(index + 1).padStart(3, "0")}`;
    return `    <testcase name="${id} synthetic journey" time="0.01" />`;
  }).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<testsuites tests="9" failures="0" errors="0" skipped="0">\n  <testsuite name="staging-verification" tests="9" failures="0" errors="0" skipped="0">\n${testCases}\n  </testsuite>\n</testsuites>\n`;
}

function logEntries(
  junit = junitDocument(),
  execution = "verifier-execution-abc",
) {
  return junit
    .trimEnd()
    .split("\n")
    .map((textPayload, index) => ({
      insertId: String(index).padStart(3, "0"),
      timestamp: `2026-08-23T00:00:${String(index).padStart(2, "0")}.000Z`,
      logName: "projects/samra-pay-staging/logs/run.googleapis.com%2Fstdout",
      resource: {
        type: "cloud_run_job",
        labels: { job_name: "samra-staging-image-verifier" },
      },
      labels: { execution_name: execution },
      textPayload,
    }));
}

test("extracts only complete passing JUnit from the exact verifier execution", () => {
  const junit = junitDocument();
  assert.deepEqual(validateStagingVerificationJUnit(junit), {
    testCount: 9,
    junitSha256: createHash("sha256").update(junit).digest("hex"),
    imageChecks: Object.fromEntries(
      STAGING_IMAGE_VERIFICATION_CHECKS.map((check) => [check, "passed"]),
    ),
  });
  assert.equal(
    extractStagingVerificationJUnitFromLogs(
      logEntries(junit),
      "verifier-execution-abc",
    ),
    junit,
  );
});

test("rejects failed, incomplete, noisy, or cross-execution verifier logs", () => {
  for (const entries of [
    logEntries(
      junitDocument().replace(
        "</testsuite>",
        '<failure message="bad" /></testsuite>',
      ),
    ),
    logEntries(junitDocument().replace("</testsuites>\n", "")),
    logEntries(`unexpected\n${junitDocument()}`),
    logEntries().map((entry, index) =>
      index === 0
        ? { ...entry, labels: { execution_name: "another-execution" } }
        : entry,
    ),
    logEntries().map((entry, index) =>
      index === 0
        ? { ...entry, logName: entry.logName.replace("stdout", "stderr") }
        : entry,
    ),
  ]) {
    assert.throws(() =>
      extractStagingVerificationJUnitFromLogs(
        entries,
        "verifier-execution-abc",
      ),
    );
  }
});

test("records exact-image checks separately from deployed revision checks", () => {
  const manifest = verification();
  assert.equal(manifest.status, "passed-not-promotion-eligible");
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.revision, revision);
  assert.equal(manifest.imageDigest, digest(service));
  assert.equal(manifest.execution.testCount, 9);
  assert.equal(manifest.promotionEligible, false);
  assert.equal(manifest.allChecksUsedDeployedRevision, false);
  assert.deepEqual(manifest.excludedPromotionChecks, {
    serviceAuthentication: "not-executed",
    deployedRevisionNetworkPath: "not-executed",
  });
  assert.equal(validateStagingImageVerificationManifest(manifest), manifest);
});

test("rejects image, revision, test, identity, secret, and authority drift", () => {
  for (const overrides of [
    { imageDigest: digest(service, "9") },
    { revision: "samra-api-other" },
    {
      revisionAttestation: {
        ...observation().revisionAttestation,
        ready: false,
      },
    },
    {
      imageChecks: {
        ...observation().imageChecks,
        ledger: "failed",
      },
    },
    { syntheticRunId: "INVALID" },
    { jobExecutionId: "INVALID" },
    { databaseSecretVersion: "latest" },
    {
      runtimeServiceAccount:
        "samra-api-staging@samra-pay-staging.iam.gserviceaccount.com",
    },
  ]) {
    assert.throws(() => verification(overrides));
  }

  for (const mutate of [
    (value) =>
      (value.imageDigest = value.imageDigest.replace(
        "samra-pay-staging",
        "other-project",
      )),
    (value) => (value.promotionEligible = true),
    (value) => (value.allChecksUsedDeployedRevision = true),
    (value) => (value.deployedRevisionNetworkPathObserved = true),
    (value) => (value.serviceAuthenticationObserved = true),
    (value) => (value.trafficChanged = true),
    (value) => (value.secretValuesRecorded = true),
    (value) => (value.excludedPromotionChecks.serviceAuthentication = "passed"),
    (value) => (value.notes = "Authorization: Bearer secret"),
  ]) {
    const changed = structuredClone(verification());
    mutate(changed);
    assert.throws(() => validateStagingImageVerificationManifest(changed));
  }
});

test("cannot be passed off as the combined two-plane verification", () => {
  assert.throws(
    () => validateStagingVerificationManifest(verification()),
    /Verification release identity drifted/,
  );
});

test("writes and verifies tamper-evident partial evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-image-verification-"));
  const manifestPath = join(root, "staging-image-verification.json");
  const hashPath = join(root, "staging-image-verification.sha256");
  const hash = await writeStagingImageVerificationManifest(
    verification(),
    manifestPath,
    hashPath,
  );
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(
    (await verifyStagingImageVerificationManifest(manifestPath, hashPath))
      .promotionEligible,
    false,
  );
  const serialized = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    serialized.replace("verify-a1b2c3", "verify-tampered"),
    "utf8",
  );
  await assert.rejects(
    verifyStagingImageVerificationManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});

test("CLI builds and independently verifies partial evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-image-verification-cli-"));
  const deploymentPath = join(root, "deployment.json");
  const deploymentHashPath = join(root, "deployment.sha256");
  const observationPath = join(root, "observation.json");
  const outputPath = join(root, "verification.json");
  const outputHashPath = join(root, "verification.sha256");
  await writeZeroTrafficDeploymentManifest(
    deployment(),
    deploymentPath,
    deploymentHashPath,
  );
  await writeFile(
    observationPath,
    `${JSON.stringify(observation(), null, 2)}\n`,
    "utf8",
  );
  const built = await execFileAsync(
    process.execPath,
    [
      "deploy/gcp/record-staging-image-verification.mjs",
      "build",
      "--zero-traffic-manifest",
      deploymentPath,
      "--zero-traffic-hash",
      deploymentHashPath,
      "--observation",
      observationPath,
      "--output",
      outputPath,
      "--hash-output",
      outputHashPath,
    ],
    { cwd: process.cwd() },
  );
  assert.equal(
    JSON.parse(built.stdout).status,
    "passed-not-promotion-eligible",
  );
  const verified = await execFileAsync(
    process.execPath,
    [
      "deploy/gcp/record-staging-image-verification.mjs",
      "verify",
      "--manifest",
      outputPath,
      "--hash",
      outputHashPath,
    ],
    { cwd: process.cwd() },
  );
  assert.equal(JSON.parse(verified.stdout).promotionEligible, false);
});

test("plans verifier execution and federation offline before any cloud command", () => {
  const environment = {
    ...process.env,
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_PROJECT_NUMBER: "934122615631",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: candidateSha,
  };
  const executionPlan = execFileSync(
    "bash",
    ["deploy/gcp/run-staging-image-verification.sh", "--plan"],
    { encoding: "utf8", env: environment },
  );
  assert.match(
    executionPlan,
    /No Google Cloud, GitHub, database, service, or evidence state was read or changed/,
  );
  assert.match(executionPlan, /temporary private Cloud Run job/);
  assert.match(
    executionPlan,
    /This partial evidence cannot authorize promotion/,
  );

  const federationPlan = execFileSync(
    "bash",
    ["deploy/gcp/activate-staging-image-verification-federation.sh", "--plan"],
    { encoding: "utf8", env: environment },
  );
  assert.match(
    federationPlan,
    /No Google Cloud, GitHub, database, job, log, or evidence state was read or changed/,
  );
  assert.match(
    federationPlan,
    /one isolated main-only Workload Identity provider/,
  );
  assert.ok(
    activation.indexOf('if [[ "${MODE}" == "--plan" ]]') <
      activation.indexOf("command -v gcloud"),
  );
});

test("workflow is manual, main-only, protected, keyless, and evidence-bound", () => {
  assert.match(workflow, /^name: Staging image verification$/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(
    workflow,
    /permissions:\n  contents: read\n  actions: read\n  id-token: write/,
  );
  assert.match(
    workflow,
    /environment:\n      name: staging-image-verification/,
  );
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /staging-zero-traffic-samra-api-\$\{GITHUB_SHA\}-run-/,
  );
  assert.match(workflow, /run-id: \$\{\{ inputs\.zero_traffic_run_id \}\}/);
  assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /AUTHORIZED_STAGING_IMAGE_VERIFICATION/);
  assert.match(workflow, /run-staging-image-verification\.sh --review/);
  assert.match(workflow, /run-staging-image-verification\.sh --apply/);
  for (const pinnedAction of [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093",
    "google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db",
  ]) {
    assert.match(workflow, new RegExp(pinnedAction.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(
    workflow,
    /secrets\.|credentials_json|GOOGLE_CREDENTIALS|update-traffic|allow-unauthenticated|gcloud builds submit|versions access/,
  );
});

test("controller uses one exact private job and always preserves the service boundary", () => {
  for (const required of [
    'JOB="samra-staging-image-verifier"',
    '--image="${IMAGE_DIGEST}"',
    '--service-account="${RUNTIME_SERVICE_ACCOUNT}"',
    '--network="${NETWORK}"',
    '--subnet="${SUBNET}"',
    "--vpc-egress=private-ranges-only",
    "--tasks=1",
    "--parallelism=1",
    "--max-retries=0",
    "--task-timeout=15m",
    '--set-secrets="TEST_DATABASE_URL=${DATABASE_SECRET}:${DATABASE_SECRET_VERSION}"',
    "gcloud run jobs execute",
    "--wait",
    "gcloud run jobs delete",
    '--view="${LOG_VIEW}"',
    "cmp --silent",
    "roles/run.serviceAgent",
    "Promotion eligible: no",
  ]) {
    assert.match(
      controller,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.doesNotMatch(
    controller,
    /update-traffic|allow-unauthenticated|secrets versions access|versions\/latest|curl\s|worf\.replit|SAMRA_GCP_IMAGE_VERIFICATION_APPLY:=AUTHORIZED/,
  );
  assert.ok(
    controller.indexOf("gcloud run jobs delete") <
      controller.indexOf(
        'echo "STAGING IMAGE VERIFICATION APPLIED AND VERIFIED"',
      ),
  );
});

test("federation isolates controller, runtime, secret, repository, and log access", () => {
  for (const source of [activation, audit]) {
    assert.match(source, /samra-image-verify-staging/);
    assert.match(source, /samra-pay-image-verify-main/);
    assert.match(source, /samra-github-verifier-staging/);
    assert.match(source, /samra-verifier-staging/);
    assert.match(source, /samraStagingImageVerifier/);
    assert.match(source, /roles\/artifactregistry\.reader/);
    assert.match(source, /roles\/iam\.serviceAccountUser/);
    assert.match(source, /roles\/iam\.workloadIdentityUser/);
    assert.match(source, /roles\/secretmanager\.secretAccessor/);
    assert.match(source, /roles\/logging\.viewAccessor/);
    assert.match(source, /roles\/run\.serviceAgent/);
    assert.match(source, /resource\.labels\.job_name/);
    assert.match(source, /--managed-by=user/);
    assert.doesNotMatch(
      source,
      /roles\/owner|roles\/editor|roles\/run\.admin|roles\/secretmanager\.admin|roles\/logging\.viewer|service-account-key|allow-unauthenticated|update-traffic|versions access/,
    );
  }
  assert.match(activation, /AUTHORIZED_STAGING_IMAGE_VERIFICATION_FEDERATION/);
  assert.match(activation, /gcloud logging views create/);
  assert.match(activation, /gcloud logging views add-iam-policy-binding/);
  assert.match(activation, /gcloud secrets add-iam-policy-binding/);
  assert.doesNotMatch(
    activation,
    /gcloud run jobs (?:create|execute)|gcloud run services|gcloud secrets versions access/,
  );
  assert.match(audit, /assert_member_absent/);
  assert.match(audit, /Temporary job: absent/);
});
