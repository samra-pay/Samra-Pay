import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readStagingGithubFederation,
  validateFederationEnvironment,
  validateStagingGithubFederation,
} from "./validate-staging-github-federation.mjs";

const contract = readStagingGithubFederation();
const activate = await readFile(
  "deploy/gcp/activate-staging-github-federation.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-staging-github-federation.sh",
  "utf8",
);
const workflow = await readFile(
  ".github/workflows/staging-image-publication.yml",
  "utf8",
);
const publish = await readFile("deploy/gcp/publish-staging-images.sh", "utf8");
const gitignore = await readFile(".gitignore", "utf8");
const dockerignore = await readFile(".dockerignore", "utf8");

test("locks federation to the stable private-repository identity and staging boundary", () => {
  assert.deepEqual(validateStagingGithubFederation(contract), {
    schemaVersion: 1,
    status: "validated",
    projectId: "samra-pay-staging",
    projectNumber: "934122615631",
    repository: "haileleuld87/Samra-Pay",
    repositoryId: "1335175962",
    allowedRef: "refs/heads/main",
    workflowPath: ".github/workflows/staging-image-publication.yml",
    poolId: "samra-github-staging",
    providerId: "samra-pay-main",
    publisherServiceAccount:
      "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com",
    permissionCount: 18,
  });
  assert.equal(contract.github.repositoryOwnerId, "237485986");
  assert.equal(contract.github.allowedEvent, "workflow_dispatch");
  assert.equal(
    contract.github.protectedEnvironment,
    "staging-image-publication",
  );
  assert.match(contract.provider.attributeCondition, /assertion\.workflow_ref/);
  assert.match(contract.provider.attributeCondition, /assertion\.environment/);
});

test("rejects repository, numeric identity, branch, workflow, and project drift", () => {
  for (const mutate of [
    (value) => (value.github.repository = "Renamed-Repo"),
    (value) => (value.github.repositoryId = "1"),
    (value) => (value.github.repositoryOwnerId = "1"),
    (value) => (value.github.allowedRef = "refs/heads/feature"),
    (value) => (value.github.allowedEvent = "pull_request"),
    (value) => (value.github.workflowName = "Other workflow"),
    (value) => (value.googleCloud.projectId = "samra-pay-production"),
    (value) => (value.googleCloud.projectNumber = "1"),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingGithubFederation(changed));
  }
});

test("rejects credential, IAM, action-version, and automatic-trigger drift", () => {
  for (const mutate of [
    (value) =>
      value.iam.publisherCustomRolePermissions.push("storage.objects.get"),
    (value) =>
      (value.iam.publisherSourceBucketRole = "roles/storage.objectAdmin"),
    (value) =>
      (value.iam.publisherBuildServiceAccountRole =
        "roles/iam.serviceAccountTokenCreator"),
    (value) =>
      (value.workflow.authenticationAction = "google-github-actions/auth@v2"),
    (value) => (value.workflow.automaticTriggers = true),
    (value) => (value.workflow.serviceDeployment = true),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateStagingGithubFederation(changed));
  }
});

test("validates only the reviewed human administrator for federation activation", () => {
  const valid = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_PROJECT_NUMBER: "934122615631",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
  };
  assert.equal(
    validateFederationEnvironment(valid).operator,
    valid.SAMRA_GCP_OPERATOR_ACCOUNT,
  );
  for (const [key, value] of [
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-production"],
    ["SAMRA_GCP_PROJECT_NUMBER", "1"],
    ["SAMRA_GCP_ORGANIZATION_ID", "1"],
    ["SAMRA_GCP_REGION", "us-west1"],
    ["SAMRA_GCP_OPERATOR_ACCOUNT", "external@example.com"],
  ]) {
    assert.throws(() =>
      validateFederationEnvironment({ ...valid, [key]: value }),
    );
  }
});

test("plans the bounded federation offline before any cloud command", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/activate-staging-github-federation.sh", "--plan"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
        SAMRA_GCP_PROJECT_NUMBER: "934122615631",
        SAMRA_GCP_ORGANIZATION_ID: "614833350075",
        SAMRA_GCP_REGION: "us-east4",
        SAMRA_GCP_OPERATOR_ACCOUNT: "operator@davidhaile.com",
        SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
      },
    },
  );
  assert.match(
    output,
    /Plan only\. No Google Cloud or GitHub state was read or changed/,
  );
  assert.match(output, /stable repository and owner IDs/);
  assert.match(output, /exact workflow file on refs\/heads\/main/);
  assert.match(
    output,
    /cannot submit a build, publish an image, deploy a service/,
  );
  assert.match(output, /AUTHORIZED_STAGING_GITHUB_FEDERATION/);
  assert.ok(
    activate.indexOf('if [[ "${MODE}" == "--plan" ]]') <
      activate.indexOf("command -v gcloud"),
  );
});

test("keeps every inline Node validator compatible with the Cloud Shell runtime", () => {
  const programs = [
    ...activate.matchAll(/node -e '\n([\s\S]*?)\n\s*'(?=\s)/g),
  ].map((match) => match[1]);
  assert.equal(programs.length, 6);
  for (const program of programs) {
    execFileSync(process.execPath, ["--check"], {
      input: program,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
});

test("creates only the reviewed keyless trust and least-privilege bindings", () => {
  for (const evidence of [
    "gcloud iam workload-identity-pools create",
    "gcloud iam workload-identity-pools providers create-oidc",
    "assertion.repository_id=='${REPOSITORY_ID}'",
    "assertion.repository_owner_id=='${REPOSITORY_OWNER_ID}'",
    "assertion.ref=='refs/heads/main'",
    "assertion.event_name=='workflow_dispatch'",
    "assertion.workflow=='Staging image publication'",
    "assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/staging-image-publication.yml@refs/heads/main'",
    "assertion.environment=='staging-image-publication'",
    "roles/storage.objectCreator",
    "roles/iam.serviceAccountUser",
    "roles/iam.workloadIdentityUser",
    "AUTHORIZED_STAGING_GITHUB_FEDERATION",
    "--managed-by=user",
    "source bucket is public",
    "build identity has a user-managed key",
    "SERVICE_ACCOUNT_CREATE_MAX_ATTEMPTS=3",
    "Service accounts created per minute per project",
    "STAGING GITHUB FEDERATION APPLIED AND VERIFIED",
  ]) {
    assert.ok(activate.includes(evidence), evidence);
  }
  const authorization = activate.indexOf(
    '[[ "${SAMRA_GCP_GITHUB_FEDERATION_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  assert.ok(
    authorization >
      activate.indexOf("READ-ONLY STAGING GITHUB FEDERATION REVIEW PASS"),
  );
  assert.ok(activate.indexOf("gcloud services enable") > authorization);
  assert.doesNotMatch(
    activate,
    /service-accounts keys create|roles\/(?:owner|editor|storage\.admin|storage\.objectAdmin)|gcloud builds submit|gcloud run deploy|gcloud run jobs execute|gcloud secrets versions access|allow-unauthenticated|worf\.replit|samra-pay-production/i,
  );
});

test("independent audit proves exact federation, IAM, keylessness, and source boundary", () => {
  for (const evidence of [
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "provider.attributeCondition",
    "publisher custom role drifted",
    "publisher identity has a user-managed key",
    "build identity has a user-managed key",
    "publisher project IAM is not exact",
    "publisher source-bucket IAM is not exact",
    "build identity impersonation IAM is not exact",
    "publisher federation IAM is not exact",
    "READ-ONLY STAGING GITHUB FEDERATION POST-AUDIT PASS",
  ]) {
    assert.ok(audit.includes(evidence), evidence);
  }
  assert.doesNotMatch(
    audit,
    /add-iam-policy-binding|remove-iam-policy-binding|service-accounts create|workload-identity-pools create|gcloud builds submit|gcloud storage cp|gcloud run deploy/,
  );
});

test("workflow is manual, main-only, keyless, protected, and reuses the reviewed controller", () => {
  assert.match(workflow, /name: Staging image publication/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(workflow, /permissions:\n  contents: read\n  id-token: write/);
  assert.equal(
    workflow.match(
      /google-github-actions\/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093/g,
    )?.length,
    1,
  );
  assert.equal(
    workflow.match(
      /google-github-actions\/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db/g,
    )?.length,
    1,
  );
  assert.equal(
    workflow.match(
      /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g,
    )?.length,
    1,
  );
  assert.doesNotMatch(workflow, /uses: [^\n]+@v\d+(?:\s|$)/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /github\.repository == 'haileleuld87\/Samra-Pay'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.equal(
    workflow.match(/environment:\n      name: staging-image-publication/g)
      ?.length,
    1,
  );
  assert.match(
    workflow,
    /SAMRA_WORKFLOW_AUTHORIZATION.*AUTHORIZED_STAGING_IMAGE_PUBLICATION/,
  );
  assert.equal(
    workflow.match(/publish-staging-images\.sh --review/g)?.length,
    1,
  );
  assert.equal(
    workflow.match(/publish-staging-images\.sh --apply/g)?.length,
    1,
  );
  assert.match(
    workflow,
    /Publish mode requires the exact publication authorization/,
  );
  assert.doesNotMatch(
    workflow,
    /credentials_json|GOOGLE_CREDENTIALS|secrets\./,
  );
  assert.doesNotMatch(
    workflow,
    /gcloud run|gcloud sql|gcloud secrets|--allow-unauthenticated/,
  );
});

test("generated short-lived credentials cannot enter Git or container contexts", () => {
  for (const ignore of [gitignore, dockerignore]) {
    assert.ok(ignore.split("\n").includes("gha-creds-*.json"));
  }
});

test("publication controller accepts only the human or keyless publisher and requires both exact build impersonators", () => {
  assert.match(publish, /OPERATOR.*HUMAN_OPERATOR.*PUBLISHER_SERVICE_ACCOUNT/s);
  assert.match(
    publish,
    /caller must be the reviewed human operator or keyless GitHub publisher/,
  );
  assert.match(publish, /publisher identity has a user-managed key/);
  assert.match(publish, /publisher custom role drifted/);
  assert.match(publish, /workload identity pool is not active/);
  assert.match(publish, /workload identity provider drifted/);
  assert.match(publish, /assertion\.workflow_ref/);
  assert.match(publish, /assertion\.environment/);
  assert.match(publish, /publisher project IAM drifted/);
  assert.match(publish, /publisher federation IAM drifted/);
  assert.match(publish, /publisher source-bucket IAM drifted/);
  assert.match(publish, /`user:\$\{process\.argv\[1\]\}`/);
  assert.match(publish, /`serviceAccount:\$\{process\.argv\[2\]\}`/);
  assert.match(publish, /Caller: \$\{OPERATOR\}/);
});
