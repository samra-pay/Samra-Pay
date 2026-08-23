import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  STAGING_IMAGE_NAMES,
  buildStagingImagePublicationManifest,
  writePublicationManifest,
} from "./record-staging-image-publication.mjs";
import {
  buildStagingZeroTrafficDeploymentManifest,
  validateStagingZeroTrafficDeploymentManifest,
  verifyZeroTrafficDeploymentManifest,
  writeZeroTrafficDeploymentManifest,
} from "./record-staging-zero-traffic-deployment.mjs";
import {
  readStagingZeroTrafficDeployment,
  validateStagingZeroTrafficDeployment,
  validateZeroTrafficEnvironment,
} from "./validate-staging-zero-traffic-deployment.mjs";

const contract = readStagingZeroTrafficDeployment();
const workflow = await readFile(
  ".github/workflows/staging-zero-traffic-deployment.yml",
  "utf8",
);
const controller = await readFile(
  "deploy/gcp/deploy-staging-zero-traffic.sh",
  "utf8",
);
const activation = await readFile(
  "deploy/gcp/activate-staging-zero-traffic-federation.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-staging-zero-traffic-federation.sh",
  "utf8",
);
const runtimeContract = JSON.parse(
  await readFile("deploy/gcp/staging-runtime-contract.json", "utf8"),
);
const sha = "a".repeat(40);
const digest = (name, value = "c") =>
  `us-east4-docker.pkg.dev/samra-pay-staging/samra-staging/${name}@sha256:${value.repeat(64)}`;
const imageDigests = Object.freeze(
  Object.fromEntries(STAGING_IMAGE_NAMES.map((name) => [name, digest(name)])),
);

function publication() {
  return buildStagingImagePublicationManifest({
    candidateSha: sha,
    gitTreeSha: "b".repeat(40),
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    region: "us-east4",
    repository: "samra-staging",
    sourceRepository: "haileleuld87/Samra-Pay",
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
  });
}

function deploymentManifest(overrides = {}) {
  return buildStagingZeroTrafficDeploymentManifest({
    publication: publication(),
    publicationManifestSha256: "d".repeat(64),
    targetService: "samra-design-system-preview",
    revisionName: `samra-design-system-preview-${sha.slice(0, 12)}`,
    imageDigest: imageDigests["samra-design-system-preview"],
    deployerIdentity:
      "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com",
    configurationSha256: "e".repeat(64),
    trafficBefore: [
      {
        revision: "samra-design-system-preview-prior",
        percent: 100,
        tag: null,
      },
    ],
    trafficAfter: [
      {
        revision: "samra-design-system-preview-prior",
        percent: 100,
        tag: null,
      },
    ],
    githubRunId: "32609632627",
    githubRunAttempt: "2",
    githubActor: "haileleuld87",
    generatedAt: "2026-08-23T01:00:00.000Z",
    ...overrides,
  });
}

test("validates the separate keyless zero-traffic deployment boundary", () => {
  const validated = validateStagingZeroTrafficDeployment(contract);
  assert.equal(validated.status, "validated");
  assert.equal(validated.poolId, "samra-zero-traffic-staging");
  assert.equal(validated.providerId, "samra-pay-zero-traffic-main");
  assert.equal(
    validated.deployerServiceAccount,
    "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com",
  );
  assert.deepEqual(validated.serviceNames, [
    "samra-api",
    "samra-customer-web",
    "samra-design-system-preview",
  ]);
  assert.equal(validated.permissionCount, 24);
  assert.equal(validated.deploymentAuthorized, false);
  assert.equal(validated.trafficAuthorized, false);
});

test("rejects repository, workflow, identity, IAM, traffic, and service drift", () => {
  for (const mutate of [
    (value) => (value.github.repositoryId = "1"),
    (value) => (value.github.allowedRef = "refs/heads/feature"),
    (value) => (value.googleCloud.workloadIdentityPoolId = "shared-pool"),
    (value) => (value.provider.attributeCondition = "true"),
    (value) =>
      value.iam.deployerCustomRolePermissions.push("run.services.setIamPolicy"),
    (value) => (value.deployment.initialTrafficPercent = 100),
    (value) => (value.deployment.publicUnauthenticatedAllowed = true),
    (value) => (value.deployment.defaultServiceUrlAllowed = true),
    (value) => (value.services["samra-api"].prerequisiteEvidence = []),
    (value) => (value.workflow.automaticTriggers = true),
    (value) => (value.workflow.trafficMutation = true),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingZeroTrafficDeployment(changed));
  }
});

test("permits only the keyless deployer or reviewed human for read-only review", () => {
  const base = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_PROJECT_NUMBER: "934122615631",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
  };
  for (const operator of [
    "operator@davidhaile.com",
    "samra-github-deployer-staging@samra-pay-staging.iam.gserviceaccount.com",
  ]) {
    assert.equal(
      validateZeroTrafficEnvironment({
        ...base,
        SAMRA_GCP_OPERATOR_ACCOUNT: operator,
      }).operator,
      operator,
    );
  }
  assert.throws(() =>
    validateZeroTrafficEnvironment({
      ...base,
      SAMRA_GCP_OPERATOR_ACCOUNT: "external@example.com",
    }),
  );
});

test("builds deployment evidence that binds publication, configuration, revision, and unchanged traffic", () => {
  const manifest = deploymentManifest();
  assert.equal(manifest.releaseId, `staging-${sha.slice(0, 12)}`);
  assert.equal(manifest.deployment.candidateTrafficPercent, 0);
  assert.deepEqual(
    manifest.deployment.trafficBefore,
    manifest.deployment.trafficAfter,
  );
  assert.equal(manifest.trafficAuthorized, false);
  assert.equal(manifest.migrationAuthorized, false);
  assert.equal(manifest.vendorActivationAuthorized, false);
  assert.equal(
    validateStagingZeroTrafficDeploymentManifest(manifest),
    manifest,
  );
});

test("rejects digest, revision, traffic, tag, identity, and evidence authority drift", () => {
  for (const overrides of [
    { revisionName: "samra-design-system-preview-other" },
    { imageDigest: digest("samra-design-system-preview", "f") },
    { deployerIdentity: "owner@example.com" },
    {
      trafficAfter: [
        {
          revision: "samra-design-system-preview-prior",
          percent: 90,
          tag: null,
        },
      ],
    },
    {
      trafficAfter: [
        {
          revision: `samra-design-system-preview-${sha.slice(0, 12)}`,
          percent: 0,
          tag: "candidate",
        },
        {
          revision: "samra-design-system-preview-prior",
          percent: 100,
          tag: null,
        },
      ],
    },
  ]) {
    assert.throws(() => deploymentManifest(overrides));
  }
  const changed = structuredClone(deploymentManifest());
  changed.trafficAuthorized = true;
  assert.throws(() => validateStagingZeroTrafficDeploymentManifest(changed));
});

test("writes and independently verifies tamper-evident deployment evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "samra-zero-traffic-"));
  const publicationPath = join(root, "publication.json");
  const publicationHashPath = join(root, "publication.sha256");
  await writePublicationManifest(
    publication(),
    publicationPath,
    publicationHashPath,
  );
  const manifestPath = join(root, "deployment.json");
  const hashPath = join(root, "deployment.sha256");
  const hash = await writeZeroTrafficDeploymentManifest(
    deploymentManifest(),
    manifestPath,
    hashPath,
  );
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(
    (await verifyZeroTrafficDeploymentManifest(manifestPath, hashPath))
      .candidateSha,
    sha,
  );
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      "deployed-zero-traffic",
      "tampered",
    ),
    "utf8",
  );
  await assert.rejects(
    verifyZeroTrafficDeploymentManifest(manifestPath, hashPath),
    /hash does not match/,
  );
});

test("plans deployment and federation offline before any cloud command", () => {
  const environment = {
    ...process.env,
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_PROJECT_NUMBER: "934122615631",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: sha,
  };
  const deployPlan = execFileSync(
    "bash",
    ["deploy/gcp/deploy-staging-zero-traffic.sh", "--plan"],
    { encoding: "utf8", env: environment },
  );
  assert.match(
    deployPlan,
    /No Google Cloud, GitHub, publication, or secret state was read/,
  );
  assert.match(
    deployPlan,
    /preserve the existing traffic allocation byte-for-byte/,
  );
  assert.match(
    deployPlan,
    /cannot build an image, execute a migration, read a secret payload/,
  );
  const federationPlan = execFileSync(
    "bash",
    ["deploy/gcp/activate-staging-zero-traffic-federation.sh", "--plan"],
    { encoding: "utf8", env: environment },
  );
  assert.match(
    federationPlan,
    /No Google Cloud or GitHub state was read or changed/,
  );
  assert.match(
    federationPlan,
    /dedicated staging Workload Identity pool with one\nmain-only provider/,
  );
  assert.ok(
    activation.indexOf('if [[ "${MODE}" == "--plan" ]]') <
      activation.indexOf("command -v gcloud"),
  );
});

test("workflow is manual, main-only, protected, keyless, and consumes prior evidence by hash", () => {
  assert.match(workflow, /^name: Staging zero-traffic deployment$/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(
    workflow,
    /permissions:\n  contents: read\n  actions: read\n  id-token: write/,
  );
  for (const action of Object.values(contract.workflow).filter(
    (value) => typeof value === "string" && value.includes("@"),
  )) {
    assert.equal(
      workflow.match(
        new RegExp(action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      )?.length,
      action.includes("download-artifact") ? 2 : 1,
    );
  }
  assert.match(
    workflow,
    /environment:\n      name: staging-zero-traffic-deployment/,
  );
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /run-id: \$\{\{ inputs\.publication_run_id \}\}/);
  assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /AUTHORIZED_STAGING_ZERO_TRAFFIC_DEPLOYMENT/);
  assert.match(workflow, /deploy-staging-zero-traffic\.sh --review/);
  assert.match(workflow, /deploy-staging-zero-traffic\.sh --apply/);
  assert.doesNotMatch(
    workflow,
    /secrets\.|credentials_json|GOOGLE_CREDENTIALS/,
  );
  assert.doesNotMatch(
    workflow,
    /update-traffic|allow-unauthenticated|gcloud builds submit|gcloud run jobs execute|secrets versions access/,
  );
});

test("controller deploys one exact digest without traffic, public access, migrations, or vendors", () => {
  for (const required of [
    "--no-traffic",
    "--no-default-url",
    "--revision-suffix=",
    "--ingress=internal-and-cloud-load-balancing",
    "--vpc-egress=private-ranges-only",
    "cmp --silent",
    "migration prerequisite does not match",
    "API prerequisite does not match",
    "AUTHORIZED_STAGING_ZERO_TRAFFIC_DEPLOYMENT",
    "record-staging-zero-traffic-deployment.mjs",
    "trafficAuthorized: false",
    "vendorActivationAuthorized: false",
  ]) {
    assert.ok(controller.includes(required), required);
  }
  assert.doesNotMatch(
    controller,
    /update-traffic|allow-unauthenticated|add-iam-policy-binding|gcloud builds submit|gcloud run jobs execute|secrets versions access|PERSONA_API_KEY|CROSSMINT_SERVER_API_KEY|worf\.replit|samra-pay-production/i,
  );
});

test("federation activation and audit grant only exact deploy and impersonation boundaries", () => {
  for (const required of [
    "samra-pay-zero-traffic-main",
    "samra-zero-traffic-staging",
    "samra-github-deployer-staging",
    "samraStagingZeroTrafficDeployer",
    "assertion.repository_id=='${REPOSITORY_ID}'",
    "assertion.workflow=='Staging zero-traffic deployment'",
    "principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository_id/${REPOSITORY_ID}",
    "isolated zero-traffic pool contains an unreviewed provider",
    "roles/artifactregistry.reader",
    "roles/iam.serviceAccountUser",
    "roles/iam.workloadIdentityUser",
    "AUTHORIZED_STAGING_ZERO_TRAFFIC_FEDERATION",
    "STAGING ZERO-TRAFFIC FEDERATION APPLIED AND VERIFIED",
  ]) {
    assert.ok(activation.includes(required), required);
  }
  assert.match(
    audit,
    /READ-ONLY STAGING ZERO-TRAFFIC FEDERATION POST-AUDIT PASS/,
  );
  assert.match(audit, /zero-traffic workload identity pool is not isolated/);
  assert.match(audit, /Artifact Registry repository is public/);
  assert.doesNotMatch(
    activation,
    /service-accounts keys create|roles\/(?:owner|editor|secretmanager\.secretAccessor|run\.admin|iam\.securityAdmin)|gcloud run deploy|gcloud run services update-traffic|gcloud builds submit|gcloud run jobs execute|secrets versions access/,
  );
  assert.doesNotMatch(
    audit,
    /add-iam-policy-binding|service-accounts create|workload-identity-pools (?:create|providers create)|gcloud run deploy|gcloud builds submit/,
  );
});

test("pins runtime database references and keeps vendor credentials out of the deploy workflow", () => {
  assert.match(
    runtimeContract.database.runtimeSecretReference,
    /\/versions\/PINNED_INTEGER$/,
  );
  assert.match(
    runtimeContract.database.migrationSecretReference,
    /\/versions\/PINNED_INTEGER$/,
  );
  assert.doesNotMatch(
    JSON.stringify(runtimeContract.database),
    /versions\/latest/,
  );
  assert.doesNotMatch(workflow, /PERSONA_|CROSSMINT_/);
});
