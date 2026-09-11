import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controller = await readFile(
  "deploy/gcp/publish-staging-images.sh",
  "utf8",
);
const workflow = await readFile(
  ".github/workflows/staging-image-publication.yml",
  "utf8",
);

test("plans one bounded five-image staging publication offline", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/publish-staging-images.sh", "--plan"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
      },
    },
  );

  assert.match(output, /Plan only\. No Google Cloud state was read or changed/);
  assert.match(output, /publishes five immutable images/);
  assert.match(output, /cannot\s+deploy Cloud Run/);
  assert.match(output, /AUTHORIZED_STAGING_IMAGE_PUBLICATION/);
});

test("requires exact source, staging boundary, immutable registry, and keyless build identity", () => {
  for (const evidence of [
    "source commit does not match the reviewed SHA",
    "source working tree is not clean",
    "project must be samra-pay-staging",
    "organization must be 993968777863",
    "region must be us-east4",
    "repository must be samra-staging",
    "project label ${key} drifted",
    "immutable Docker repository drifted",
    "--managed-by=user",
    "build identity has a user-managed key",
    "build identity project IAM drifted",
    "build identity repository IAM drifted",
    "build identity impersonation IAM drifted",
    "caller must be the reviewed human operator or keyless GitHub publisher",
    "verify-staging-image-absence.mjs",
    "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS",
    "REVIEW COMPLETE — NO CLOUD CHANGES",
  ]) {
    assert.ok(controller.includes(evidence), evidence);
  }
});

test("requires structured registry absence before review success or publication authority", () => {
  const absence = controller.indexOf(
    'node "${ROOT_DIR}/deploy/gcp/verify-staging-image-absence.mjs"',
  );
  const registry = controller.indexOf("gcloud artifacts repositories describe");
  const reviewed = controller.indexOf(
    "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS",
  );
  const authorized = controller.indexOf(
    '[[ "${SAMRA_GCP_IMAGE_BUILD_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  assert.ok(
    registry >= 0 &&
      absence > registry &&
      reviewed > absence &&
      authorized > reviewed,
  );
  assert.match(
    controller.slice(absence, reviewed),
    /--candidate-sha "\$\{EXPECTED_SHA\}"/,
  );
  assert.match(
    controller.slice(absence, reviewed),
    /--operator "\$\{OPERATOR\}"/,
  );
  assert.doesNotMatch(controller, /if gcloud artifacts docker images describe/);
});

test("places an exact authorization after every read-only preflight", () => {
  const review = controller.indexOf(
    "READ-ONLY STAGING IMAGE PUBLICATION REVIEW PASS",
  );
  const authorization = controller.indexOf(
    '[[ "${SAMRA_GCP_IMAGE_BUILD_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  const submit = controller.indexOf("gcloud builds submit");

  assert.ok(review >= 0);
  assert.ok(authorization > review);
  assert.ok(submit > authorization);
  assert.match(controller, /AUTHORIZED_STAGING_IMAGE_PUBLICATION/);
  assert.match(controller, /samra-github-staging@\$\{PROJECT_ID\}/);
});

test("submits only the reviewed build contract and records durable provenance", () => {
  for (const evidence of [
    '--config="${ROOT_DIR}/deploy/gcp/cloudbuild.yaml"',
    '--region="${REGION}"',
    'BUILD_SERVICE_ACCOUNT_RESOURCE="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}"',
    '--service-account="${BUILD_SERVICE_ACCOUNT_RESOURCE}"',
    '--ignore-file="${ROOT_DIR}/.gcloudignore"',
    "COMMIT_SHA=${EXPECTED_SHA}",
    "_ENVIRONMENT=staging",
    "_REGION=${REGION}",
    "_REPOSITORY=${REPOSITORY}",
    "_IMAGE_TAG=${EXPECTED_SHA}",
    "_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT}",
    "_RELEASE_CANDIDATE_RUN_ID=${SAMRA_RELEASE_CANDIDATE_RUN_ID}",
    "_RELEASE_CANDIDATE_RUN_ATTEMPT=${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT}",
    "_RELEASE_EVIDENCE_MANIFEST_SHA256=${RELEASE_EVIDENCE_MANIFEST_SHA256}",
    "gcloud builds describe",
    "record-staging-image-publication.mjs",
    "command -v trivy",
    'TRIVY_VERSION="0.70.0"',
    "--scanners vuln",
    "--severity CRITICAL",
    "--ignore-unfixed",
    "--scanners secret",
    "--severity HIGH,CRITICAL",
    '--security-evidence-root "${IMAGE_SECURITY_EVIDENCE_DIR}"',
    '--git-tree-sha "$(git -C "${ROOT_DIR}" rev-parse "${EXPECTED_SHA}^{tree}")"',
    '--github-run-id "${GITHUB_RUN_ID:-}"',
    '--github-run-attempt "${GITHUB_RUN_ATTEMPT:-}"',
    '--github-actor "${GITHUB_ACTOR:-}"',
    '--release-evidence-root "${SAMRA_RELEASE_EVIDENCE_ROOT}"',
    '--release-run-metadata "${SAMRA_RELEASE_RUN_METADATA}"',
    '--release-candidate-run-id "${SAMRA_RELEASE_CANDIDATE_RUN_ID}"',
    '--release-candidate-run-attempt "${SAMRA_RELEASE_CANDIDATE_RUN_ATTEMPT}"',
    'PUBLICATION_MANIFEST="${PUBLICATION_EVIDENCE_DIR}/staging-image-publication.json"',
    'PUBLICATION_MANIFEST_HASH="${PUBLICATION_EVIDENCE_DIR}/staging-image-publication.sha256"',
    "STAGING IMAGE PUBLICATION PASS",
    "Cloud Build staging storage, records, logs, and provenance may remain.",
    "No service was deployed, no traffic was changed, and no vendor was activated.",
    "Exact-digest security gate: passed for all five published images",
  ]) {
    assert.ok(controller.includes(evidence), evidence);
  }
  for (const image of [
    "samra-api",
    "samra-customer-web",
    "samra-operations-web",
    "samra-design-system-preview",
    "samra-migrations",
  ]) {
    assert.ok(controller.includes(image), image);
  }
});

test("gates every resolved registry digest before recording publication evidence", () => {
  const resolve = controller.indexOf('digest="$(resolve_digest "${name}")"');
  const vulnerabilityScan = controller.indexOf("trivy image", resolve);
  const secretScan = controller.indexOf("trivy image", vulnerabilityScan + 1);
  const recorder = controller.indexOf(
    'node "${ROOT_DIR}/deploy/gcp/record-staging-image-publication.mjs"',
  );
  assert.ok(resolve >= 0);
  assert.ok(vulnerabilityScan > resolve);
  assert.ok(secretScan > vulnerabilityScan);
  assert.ok(recorder > secretScan);
  assert.match(controller, /for name in "\$\{IMAGE_NAMES\[@\]\}"; do/);
  assert.match(
    workflow,
    /aquasecurity\/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514 # v0\.2\.6[\s\S]*?version: v0\.70\.0/,
  );
});

test("verifies one exact successful release artifact before Google authentication", () => {
  assert.match(
    workflow,
    /release_candidate_run_id:[\s\S]*?required: true[\s\S]*?release_candidate_run_attempt:[\s\S]*?required: true/,
  );
  assert.match(
    workflow,
    /permissions:\n  contents: read\n  actions: read\n  id-token: write/,
  );
  assert.match(
    workflow,
    /name: \$\{\{ steps\.release_artifact\.outputs\.artifact_name \}\}[\s\S]*?run-id: \$\{\{ inputs\.release_candidate_run_id \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /pattern:\s*samra-|release-runtime-security-\*/,
  );
  const download = workflow.indexOf(
    "- name: Download the exact release-candidate artifact",
  );
  const verify = workflow.indexOf(
    "- name: Verify release-candidate lineage before Google authentication",
  );
  const authenticate = workflow.indexOf(
    "- name: Obtain short-lived Google credentials",
  );
  assert.ok(download >= 0 && verify > download && authenticate > verify);
  assert.match(workflow, /verify-release-candidate-evidence\.mjs/);
  assert.match(
    workflow,
    /--run-metadata-output "\$\{SAMRA_RELEASE_RUN_METADATA\}"/,
  );

  const sourceCheck = controller.indexOf(
    '[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]]',
  );
  const evidenceCheck = controller.indexOf(
    "verify-release-candidate-evidence.mjs",
  );
  const cloudBoundary = controller.indexOf("command -v gcloud");
  assert.ok(sourceCheck >= 0 && evidenceCheck > sourceCheck);
  assert.ok(cloudBoundary > evidenceCheck);
});

test("retains the hashed publication manifest as a commit- and run-specific artifact", () => {
  assert.match(
    workflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/,
  );
  assert.match(
    workflow,
    /name: staging-image-publication-\$\{\{ github\.sha \}\}-run-\$\{\{ github\.run_id \}\}-attempt-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(workflow, /path: artifacts\/staging-release/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 365/);
});

test("uses the fully qualified build identity and regional build lookup", () => {
  assert.doesNotMatch(
    controller,
    /--service-account="\$\{BUILD_SERVICE_ACCOUNT\}"/,
  );

  const describeStart = controller.indexOf(
    'gcloud builds describe "${BUILD_ID}"',
  );
  const describeEnd = controller.indexOf("]] || {", describeStart);
  const describeCommand = controller.slice(describeStart, describeEnd);

  assert.ok(describeStart >= 0);
  assert.ok(describeEnd > describeStart);
  assert.ok(describeCommand.includes('--project="${PROJECT_ID}"'));
  assert.ok(describeCommand.includes('--region="${REGION}"'));
  assert.ok(describeCommand.includes("--format='value(status)'"));
});

test("contains no deployment, migration, secret-read, IAM-write, or Replit bypass", () => {
  assert.doesNotMatch(
    controller,
    /gcloud (?:run (?:deploy|services (?:update|replace)|jobs (?:create|update|execute|delete))|sql (?:instances|users|databases) (?:create|patch|delete)|secrets (?:create|versions add|versions access|delete)|projects add-iam-policy-binding|artifacts repositories create)/,
  );
  assert.doesNotMatch(
    controller,
    /--allow-unauthenticated|--ingress=all|postgres(?:ql)?:\/\/|worf\.replit|12345678/i,
  );
});
