import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readProductionFoundationPreflight,
  validateProductionFoundationPreflight,
  validateProductionPreflightActivationEnvironment,
} from "./validate-production-foundation-preflight.mjs";

const contract = readProductionFoundationPreflight();
const activate = await readFile(
  "deploy/gcp/activate-production-foundation-preflight.sh",
  "utf8",
);
const audit = await readFile(
  "deploy/gcp/audit-production-foundation-preflight.sh",
  "utf8",
);
const workflow = await readFile(
  ".github/workflows/production-foundation-preflight.yml",
  "utf8",
);
const productionReview = await readFile(
  "deploy/gcp/review-coming-soon-production.sh",
  "utf8",
);

test("locks one prepared keyless production preflight boundary", () => {
  assert.deepEqual(validateProductionFoundationPreflight(contract), {
    schemaVersion: 1,
    status: "validated-prepared-not-applied",
    productionProjectId: "samra-pay-production",
    productionProjectNumber: "382465561715",
    stagingProjectId: "samra-pay-staging",
    repository: "haileleuld87/Samra-Pay",
    repositoryId: "1335175962",
    workflowPath: ".github/workflows/production-foundation-preflight.yml",
    protectedEnvironment: "production-foundation-review",
    poolId: "samra-production-review",
    providerId: "samra-foundation-preflight",
    auditorServiceAccount:
      "samra-production-auditor@samra-pay-production.iam.gserviceaccount.com",
    productionPermissionCount: 5,
    stagingPermissionCount: 1,
    requiredApiCount: 7,
    estimatedBaseMonthlyCostUsd: 0,
  });
  assert.equal(contract.iam.billingAccountRole, null);
  assert.equal(contract.github.enterpriseTransferRequiresTrustReissue, true);
});

test("rejects repository, project, IAM, API, action, trigger, and authorization drift", () => {
  for (const mutate of [
    (value) => (value.status = "applied"),
    (value) => (value.applyAuthorized = true),
    (value) => (value.github.repositoryId = "1"),
    (value) => (value.github.allowedRef = "refs/heads/feature"),
    (value) => (value.googleCloud.productionProjectNumber = "1"),
    (value) => (value.googleCloud.stagingProjectId = "another-project"),
    (value) => (value.iam.billingAccountRole = "roles/billing.viewer"),
    (value) =>
      value.iam.productionCustomRolePermissions.push("billing.budgets.list"),
    (value) =>
      (value.workflow.authenticationAction = "google-github-actions/auth@v3"),
    (value) => (value.workflow.automaticTriggers = true),
    (value) => value.bootstrap.requiredProductionApis.pop(),
  ]) {
    const changed = structuredClone(contract);
    mutate(changed);
    assert.throws(() => validateProductionFoundationPreflight(changed));
  }
});

test("requires the exact production activation boundary and human administrator", () => {
  const environment = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-production",
    SAMRA_GCP_PROJECT_NUMBER: "382465561715",
    SAMRA_GCP_STAGING_PROJECT_ID: "samra-pay-staging",
    SAMRA_GCP_ORGANIZATION_ID: "614833350075",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
  };
  assert.equal(
    validateProductionPreflightActivationEnvironment(environment).operator,
    "me@davidhaile.com",
  );
  for (const [key, value] of [
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-staging"],
    ["SAMRA_GCP_PROJECT_NUMBER", "1"],
    ["SAMRA_GCP_STAGING_PROJECT_ID", "samra-pay-production"],
    ["SAMRA_GCP_ORGANIZATION_ID", "1"],
    ["SAMRA_GCP_REGION", "us-west1"],
    ["SAMRA_GCP_OPERATOR_ACCOUNT", "external@example.com"],
    ["SAMRA_GCP_EXPECTED_SHA", "abc123"],
  ]) {
    assert.throws(() =>
      validateProductionPreflightActivationEnvironment({
        ...environment,
        [key]: value,
      }),
    );
  }
});

test("plans the zero-cost trust offline before any cloud command", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/activate-production-foundation-preflight.sh", "--plan"],
    { encoding: "utf8" },
  );
  assert.match(output, /PRODUCTION FOUNDATION PREFLIGHT AUTOMATION PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /seven exact control-plane APIs/);
  assert.match(output, /No billing-account role, service-account key, build/);
  assert.match(output, /Enterprise organization requires an/);
  assert.match(output, /AUTHORIZED_PRODUCTION_FOUNDATION_PREFLIGHT/);
  assert.match(output, /PLAN COMPLETE — NO CLOUD OR GITHUB CHANGES/);
  assert.ok(
    activate.indexOf('if [[ "${MODE}" == "--plan" ]]') <
      activate.indexOf("command -v gcloud"),
  );
});

test("keeps the one-time bootstrap exact, resumable, keyless, and authorization-gated", () => {
  for (const evidence of [
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "serviceusage.googleapis.com",
    "sts.googleapis.com",
    "billing.resourcebudgets.read",
    "resourcemanager.projects.get",
    "serviceusage.services.use",
    "gcloud iam workload-identity-pools create",
    "gcloud iam workload-identity-pools providers create-oidc",
    "assertion.workflow_ref=='haileleuld87/Samra-Pay/.github/workflows/production-foundation-preflight.yml@refs/heads/main'",
    "assertion.environment=='production-foundation-review'",
    "roles/iam.workloadIdentityUser",
    "--managed-by=user",
    "AUTHORIZED_PRODUCTION_FOUNDATION_PREFLIGHT",
    "PRODUCTION FOUNDATION PREFLIGHT TRUST APPLIED AND VERIFIED",
  ]) {
    assert.ok(activate.includes(evidence), evidence);
  }
  const authorization = activate.indexOf(
    '[[ "${SAMRA_GCP_PRODUCTION_PREFLIGHT_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  assert.ok(
    authorization >
      activate.indexOf(
        "READ-ONLY PRODUCTION FOUNDATION PREFLIGHT TRUST REVIEW PASS",
      ),
  );
  assert.ok(activate.indexOf("gcloud services enable") > authorization);
  assert.doesNotMatch(
    activate,
    /roles\/(?:owner|editor|billing\.viewer|billing\.admin|secretmanager|run\.admin)|service-accounts keys create|gcloud builds submit|gcloud run deploy|gcloud sql|gcloud secrets|allow-unauthenticated/iu,
  );
});

test("independent audit proves exact APIs, trust, IAM, and keylessness without mutation", () => {
  for (const evidence of [
    "preflight custom role drifted",
    "production auditor has a user-managed key",
    "production review identity provider drifted",
    "production auditor project IAM is not exact",
    "production auditor federation IAM is not exact",
    "READ-ONLY PRODUCTION FOUNDATION PREFLIGHT TRUST POST-AUDIT PASS",
  ]) {
    assert.ok(audit.includes(evidence), evidence);
  }
  assert.doesNotMatch(
    audit,
    /add-iam-policy-binding|remove-iam-policy-binding|services enable|roles create|service-accounts create|workload-identity-pools create|gcloud builds submit|gcloud run deploy|gcloud sql|gcloud secrets/iu,
  );
});

test("workflow is manual, main-only, protected, pinned, read-only, and preserves evidence", () => {
  assert.match(workflow, /name: Production foundation preflight/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request|schedule):/m);
  assert.match(workflow, /permissions:\n  contents: read\n  id-token: write/);
  assert.match(
    workflow,
    /environment:\n      name: production-foundation-review/,
  );
  assert.match(workflow, /github\.repository == 'haileleuld87\/Samra-Pay'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /persist-credentials: false/);
  for (const action of [
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093",
    "google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  ]) {
    assert.equal(workflow.match(new RegExp(action, "g"))?.length, 1, action);
  }
  assert.doesNotMatch(workflow, /uses: [^\n]+@v\d+(?:\s|$)/);
  assert.match(workflow, /review-coming-soon-production\.sh --review/);
  assert.match(workflow, /retention-days: 365/);
  assert.doesNotMatch(
    workflow,
    /credentials_json|GOOGLE_CREDENTIALS|secrets\.|gcloud (?:services enable|iam roles create|run|sql|secrets|builds submit)/,
  );
});

test("production review accepts only the human or dedicated auditor and writes non-mutating evidence", () => {
  assert.match(
    productionReview,
    /SAMRA_GCP_QUOTA_PROJECT_ID:=samra-pay-production/,
  );
  assert.match(
    productionReview,
    /--billing-project="\$\{SAMRA_GCP_QUOTA_PROJECT_ID\}"/,
  );
  assert.match(productionReview, /cloudMutation: false/);
  assert.match(productionReview, /customerData: false/);
  assert.match(productionReview, /vendorActivation: false/);
  assert.match(productionReview, /dnsChange: false/);
  assert.match(productionReview, /flag: "wx"/);
  assert.doesNotMatch(
    productionReview,
    /projects create|billing projects link|billing budgets create|services enable|run deploy|sql instances create|dns record-sets/iu,
  );
});

test("new shell controllers parse in the Cloud Shell Bash runtime", () => {
  for (const script of [
    "deploy/gcp/activate-production-foundation-preflight.sh",
    "deploy/gcp/audit-production-foundation-preflight.sh",
    "deploy/gcp/review-coming-soon-production.sh",
  ]) {
    execFileSync("bash", ["-n", script]);
  }
});

test("every inline JavaScript validator parses before Cloud Shell execution", () => {
  const programs = [activate, audit, productionReview].flatMap((source) =>
    [
      ...source.matchAll(
        /node( --input-type=module)? -e '\n([\s\S]*?)\n\s*'(?=\s)/g,
      ),
    ].map((match) => ({ module: Boolean(match[1]), source: match[2] })),
  );
  assert.equal(programs.length, 19);
  for (const program of programs) {
    execFileSync(
      process.execPath,
      [...(program.module ? ["--input-type=module"] : []), "--check"],
      {
        input: program.source,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  }
});
