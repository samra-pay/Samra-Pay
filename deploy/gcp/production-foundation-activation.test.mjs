import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonProductionFoundation,
  validateProductionFoundationActivationEnvironment,
} from "./validate-coming-soon-production-foundation.mjs";
import { classifyObservedProductionFoundation } from "./inspect-coming-soon-production-foundation.mjs";

const foundation = readComingSoonProductionFoundation();
const projectId = foundation.productionBoundary.projectId;
const region = foundation.productionBoundary.region;

function accountEmail(boundary) {
  return `${foundation.serviceAccounts[boundary]}@${projectId}.iam.gserviceaccount.com`;
}

function policyForMemberRoles(memberRoles) {
  const roles = new Map();
  for (const [member, role] of memberRoles) {
    const members = roles.get(role) ?? [];
    members.push(member);
    roles.set(role, members);
  }
  return {
    bindings: [...roles.entries()].map(([role, members]) => ({
      role,
      members,
    })),
  };
}

function readyObservation() {
  const serviceAccounts = Object.fromEntries(
    Object.keys(foundation.serviceAccounts).map((boundary) => [
      boundary,
      {
        email: accountEmail(boundary),
        displayName: foundation.serviceAccountDisplayNames[boundary],
        disabled: false,
      },
    ]),
  );
  const projectRoles = Object.entries(foundation.projectRoleBindings).flatMap(
    ([boundary, roles]) =>
      roles.map((role) => [`serviceAccount:${accountEmail(boundary)}`, role]),
  );
  const deployerMember = `serviceAccount:${accountEmail("deployer")}`;
  const runtimeSecret = foundation.secretMetadata[0];
  const migrationSecret = foundation.secretMetadata[1];
  return {
    project: {
      projectId,
      projectNumber: foundation.productionBoundary.projectNumber,
      parent: {
        type: "organization",
        id: foundation.productionBoundary.organizationId,
      },
      lifecycleState: "ACTIVE",
      labels: structuredClone(foundation.projectLabels),
    },
    enabledApis: [...foundation.samraManagedApis],
    repository: {
      name: `projects/${projectId}/locations/${region}/repositories/${foundation.artifactRegistry.repository}`,
      format: "DOCKER",
      description: "Immutable Samra Pay production images",
      dockerConfig: { immutableTags: true },
      labels: {
        environment: "production",
        data_classification: "customer-pii",
      },
    },
    repositoryIamPolicy: policyForMemberRoles([
      [
        `serviceAccount:${accountEmail("build")}`,
        "roles/artifactregistry.writer",
      ],
      [deployerMember, "roles/artifactregistry.reader"],
    ]),
    serviceAccounts,
    userManagedKeys: Object.fromEntries(
      Object.keys(serviceAccounts).map((boundary) => [boundary, []]),
    ),
    projectIamPolicy: policyForMemberRoles(projectRoles),
    serviceAccountIamPolicies: {
      build: { bindings: [] },
      deployer: { bindings: [] },
      api: policyForMemberRoles([
        [deployerMember, "roles/iam.serviceAccountUser"],
      ]),
      customerWeb: policyForMemberRoles([
        [deployerMember, "roles/iam.serviceAccountUser"],
      ]),
      migrations: policyForMemberRoles([
        [deployerMember, "roles/iam.serviceAccountUser"],
      ]),
    },
    secrets: {
      runtime: {
        name: `projects/382465561715/secrets/${runtimeSecret.id}`,
        replication: { userManaged: { replicas: [{ location: region }] } },
        labels: {
          environment: "production",
          data_classification: "customer-pii",
        },
      },
      migrations: {
        name: `projects/382465561715/secrets/${migrationSecret.id}`,
        replication: { userManaged: { replicas: [{ location: region }] } },
        labels: {
          environment: "production",
          data_classification: "customer-pii",
        },
      },
    },
    secretVersions: { runtime: [], migrations: [] },
    secretIamPolicies: {
      runtime: policyForMemberRoles([
        [
          `serviceAccount:${accountEmail("api")}`,
          "roles/secretmanager.secretAccessor",
        ],
      ]),
      migrations: policyForMemberRoles([
        [
          `serviceAccount:${accountEmail("migrations")}`,
          "roles/secretmanager.secretAccessor",
        ],
      ]),
    },
  };
}

test("classifies only the complete exact production foundation as ready", () => {
  assert.deepEqual(
    classifyObservedProductionFoundation(readyObservation(), foundation, {
      requireReady: true,
    }),
    {
      schemaVersion: 1,
      status: "ready",
      projectId: "samra-pay-production",
      projectNumber: "382465561715",
      region: "us-east4",
      repository: "samra-production",
      serviceAccountCount: 5,
      secretMetadataCount: 2,
      secretVersionCount: 0,
      missingCount: 0,
      missing: {
        apis: [],
        labels: [],
        repository: [],
        serviceAccounts: [],
        projectBindings: [],
        repositoryBindings: [],
        serviceAccountBindings: [],
        secrets: [],
        secretBindings: [],
      },
      deferredPrivateApiInvoker: true,
      cloudMutation: false,
    },
  );
});

test("reports absent exact state without treating it as drift", () => {
  const observed = readyObservation();
  observed.enabledApis.pop();
  delete observed.project.labels.application;
  observed.repository = null;
  observed.repositoryIamPolicy = null;
  observed.serviceAccounts.build = null;
  observed.secrets.runtime = null;
  observed.secretIamPolicies.runtime = null;
  observed.projectIamPolicy.bindings =
    observed.projectIamPolicy.bindings.filter(
      (binding) => binding.role !== "roles/logging.logWriter",
    );
  const result = classifyObservedProductionFoundation(observed);
  assert.equal(result.status, "missing-exact-state");
  assert.ok(result.missingCount >= 7);
  assert.deepEqual(result.missing.labels, ["application"]);
  assert.deepEqual(result.missing.repository, ["samra-production"]);
  assert.deepEqual(result.missing.serviceAccounts, ["build"]);
  assert.deepEqual(result.missing.secrets, ["runtime"]);
  assert.throws(
    () =>
      classifyObservedProductionFoundation(observed, foundation, {
        requireReady: true,
      }),
    /not fully applied/,
  );
});

test("rejects mutable images, privilege drift, keys, secret values, and public IAM", () => {
  for (const [mutate, message] of [
    [
      (observed) => (observed.repository.dockerConfig.immutableTags = false),
      /immutable tags/,
    ],
    [
      (observed) =>
        observed.projectIamPolicy.bindings.push({
          role: "roles/owner",
          members: [`serviceAccount:${accountEmail("deployer")}`],
        }),
      /unreviewed roles/,
    ],
    [
      (observed) => observed.userManagedKeys.api.push({ name: "key" }),
      /user-managed key/,
    ],
    [
      (observed) =>
        observed.secretVersions.runtime.push({ name: "versions/1" }),
      /contains a version/,
    ],
    [
      (observed) =>
        observed.repositoryIamPolicy.bindings.push({
          role: "roles/artifactregistry.reader",
          members: ["allUsers"],
        }),
      /public IAM/,
    ],
    [
      (observed) =>
        observed.repositoryIamPolicy.bindings[1].members.push(
          "user:unreviewed@example.com",
        ),
      /unreviewed members/,
    ],
    [
      (observed) =>
        observed.serviceAccountIamPolicies.api.bindings.push({
          role: "roles/iam.serviceAccountTokenCreator",
          members: ["user:unreviewed@example.com"],
        }),
      /unreviewed role/,
    ],
    [
      (observed) =>
        observed.secretIamPolicies.runtime.bindings[0].members.push(
          `serviceAccount:${accountEmail("customerWeb")}`,
        ),
      /unreviewed members/,
    ],
    [
      (observed) =>
        observed.secretIamPolicies.runtime.bindings.push({
          role: "roles/secretmanager.viewer",
          members: ["user:unreviewed@example.com"],
        }),
      /unreviewed role/,
    ],
  ]) {
    const observed = readyObservation();
    mutate(observed);
    assert.throws(
      () => classifyObservedProductionFoundation(observed),
      message,
    );
  }
});

test("requires the exact human-admin activation boundary and full source SHA", () => {
  const environment = {
    SAMRA_GCP_PROJECT_ID: "samra-pay-production",
    SAMRA_GCP_PROJECT_NUMBER: "382465561715",
    SAMRA_GCP_ORGANIZATION_ID: "993968777863",
    SAMRA_GCP_REGION: "us-east4",
    SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
    SAMRA_GCP_DATA_CLASSIFICATION: "customer-pii",
    SAMRA_GCP_MONTHLY_BUDGET_USD: "25",
  };
  assert.equal(
    validateProductionFoundationActivationEnvironment(environment).operator,
    "me@davidhaile.com",
  );
  for (const [key, value] of [
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-staging"],
    ["SAMRA_GCP_PROJECT_NUMBER", "1"],
    ["SAMRA_GCP_ORGANIZATION_ID", "1"],
    ["SAMRA_GCP_REGION", "us-west1"],
    ["SAMRA_GCP_OPERATOR_ACCOUNT", "external@example.com"],
    ["SAMRA_GCP_EXPECTED_SHA", "abc123"],
    ["SAMRA_GCP_DATA_CLASSIFICATION", "synthetic"],
    ["SAMRA_GCP_MONTHLY_BUDGET_USD", "26"],
  ]) {
    assert.throws(() =>
      validateProductionFoundationActivationEnvironment({
        ...environment,
        [key]: value,
      }),
    );
  }
});

test("keeps review, apply, and post-audit separate and fail closed", async () => {
  const activation = await readFile(
    "deploy/gcp/activate-coming-soon-production-foundation.sh",
    "utf8",
  );
  const audit = await readFile(
    "deploy/gcp/audit-coming-soon-production-foundation.sh",
    "utf8",
  );
  const inspector = await readFile(
    "deploy/gcp/inspect-coming-soon-production-foundation.mjs",
    "utf8",
  );
  const output = execFileSync(
    "bash",
    ["deploy/gcp/activate-coming-soon-production-foundation.sh", "--plan"],
    { encoding: "utf8" },
  );
  assert.match(output, /ACTIVATION PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /rejects drift before mutation/);
  assert.match(output, /no GitHub apply workflow/);
  assert.match(output, /PLAN COMPLETE — NO CLOUD OR DNS CHANGES/);

  const review = activation.indexOf(
    "READ-ONLY COMING-SOON PRODUCTION FOUNDATION ACTIVATION REVIEW PASS",
  );
  const authorization = activation.indexOf(
    '[[ "${SAMRA_GCP_PRODUCTION_FOUNDATION_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  const firstMutation = activation.indexOf("gcloud services enable");
  assert.ok(
    review >= 0 && authorization > review && firstMutation > authorization,
  );
  assert.ok(
    activation.indexOf(
      'inspect-coming-soon-production-foundation.mjs" --require-ready',
    ) > firstMutation,
  );
  assert.ok(
    activation.indexOf("audit-coming-soon-production-foundation.sh") >
      firstMutation,
  );

  for (const evidence of [
    "AUTHORIZED_COMING_SOON_PRODUCTION_FOUNDATION",
    "gcloud services enable",
    "--immutable-tags",
    "gcloud iam service-accounts create",
    "roles/artifactregistry.writer",
    "roles/artifactregistry.reader",
    "roles/run.admin",
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "Secret versions created: 0",
  ]) {
    assert.ok(activation.includes(evidence), evidence);
  }
  assert.doesNotMatch(
    activation,
    /projects create|billing projects link|billing budgets (?:create|update|delete)|secrets versions add|run deploy|sql instances create|compute networks create|dns record-sets|allow-unauthenticated|auth0|persona|crossmint/iu,
  );
  assert.doesNotMatch(
    audit,
    /services enable|projects update|repositories create|service-accounts create|add-iam-policy-binding|secrets create|secrets versions add|run deploy|sql instances create|dns record-sets/iu,
  );
  assert.match(audit, /--require-ready/);
  assert.match(audit, /AUDIT COMPLETE — NO CLOUD OR DNS CHANGES/);
  assert.match(inspector, /--managed-by=user/);
  assert.match(
    inspector,
    /enabledApis\.includes\("artifactregistry\.googleapis\.com"\)/,
  );
  assert.match(
    inspector,
    /enabledApis\.includes\("secretmanager\.googleapis\.com"\)/,
  );
  assert.doesNotMatch(
    inspector,
    /services enable|projects update|repositories create|service-accounts create|add-iam-policy-binding|secrets create|secrets versions add|run deploy|sql instances create|dns record-sets/iu,
  );
  execFileSync("bash", [
    "-n",
    "deploy/gcp/activate-coming-soon-production-foundation.sh",
  ]);
  execFileSync("bash", [
    "-n",
    "deploy/gcp/audit-coming-soon-production-foundation.sh",
  ]);
});
