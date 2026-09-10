import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyObservedProductionBilling,
  classifyObservedProductionBudgets,
  classifyObservedProductionProject,
  classifyObservedProductionProjectInventory,
  readComingSoonProductionProject,
  validateComingSoonProductionProject,
  validateProductionProjectControllerEnvironment,
  validateSourceBillingAccount,
  validateSourceBillingProject,
} from "./validate-coming-soon-production-project.mjs";

const controllerScript = await readFile(
  "deploy/gcp/provision-coming-soon-production-project.sh",
  "utf8",
);
const controllerValidator = await readFile(
  "deploy/gcp/validate-coming-soon-production-project.mjs",
  "utf8",
);
const controllerSource = `${controllerScript}\n${controllerValidator}`;

const exactProject = {
  projectId: "samra-pay-production",
  name: "Samra Pay Production",
  projectNumber: "382465561715",
  lifecycleState: "ACTIVE",
  parent: { type: "organization", id: "993968777863" },
  labels: {
    application: "samra-pay",
    data_classification: "customer-pii",
    environment: "production",
  },
};

const exactBudget = (projectResource = "projects/samra-pay-production") => ({
  displayName: "Samra Pay production monthly budget",
  amount: {
    specifiedAmount: { currencyCode: "USD", units: "25", nanos: 0 },
  },
  budgetFilter: { projects: [projectResource], calendarPeriod: "MONTH" },
  thresholdRules: [
    { thresholdPercent: 0.5 },
    { thresholdPercent: 0.9 },
    { thresholdPercent: 1 },
  ],
});

test("validates the applied and independently verified production project controller", () => {
  assert.deepEqual(validateComingSoonProductionProject(), {
    schemaVersion: 1,
    status: "validated-applied-verified",
    phase: "coming-soon-production-project",
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    projectName: "Samra Pay Production",
    organizationId: "993968777863",
    sourceBillingProjectId: "samra-pay-staging",
    monthlyBudgetUsd: 25,
    thresholdPercents: [0.5, 0.9, 1],
    projectCreationAuthorized: false,
    billingMutationAuthorized: false,
    budgetMutationAuthorized: false,
    infrastructureAuthorized: false,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
});

test("rejects project, billing, budget, and scope drift", () => {
  for (const mutate of [
    (value) => (value.status = "prepared-not-applied"),
    (value) => (value.applyAuthorized = true),
    (value) => (value.project.id = "samra-pay-staging"),
    (value) => (value.project.name = "Another Production"),
    (value) => (value.project.createWithCloudApisEnabled = true),
    (value) => (value.project.labels.data_classification = "synthetic"),
    (value) => (value.billing.moveFromDifferentAccountAllowed = true),
    (value) => (value.budget.amount = 26),
    (value) => (value.budget.thresholdSpendBasis = "FORECASTED_SPEND"),
    (value) => value.budget.thresholdPercents.push(1.2),
    (value) => (value.budget.duplicateAllowed = true),
    (value) => value.applyNeverCreates.pop(),
  ]) {
    const controller = structuredClone(readComingSoonProductionProject());
    mutate(controller);
    assert.throws(() => validateComingSoonProductionProject(controller));
  }
});

test("requires one exact administrator and full Git SHA", () => {
  const environment = {
    SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
    SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
  };
  assert.deepEqual(
    validateProductionProjectControllerEnvironment(environment),
    {
      operator: "me@davidhaile.com",
      expectedSha: "a".repeat(40),
    },
  );
  assert.throws(
    () =>
      validateProductionProjectControllerEnvironment({
        ...environment,
        SAMRA_GCP_OPERATOR_ACCOUNT: "founder@gmail.com",
      }),
    /administrator/,
  );
  assert.throws(
    () =>
      validateProductionProjectControllerEnvironment({
        ...environment,
        SAMRA_GCP_EXPECTED_SHA: "abc123",
      }),
    /full lowercase Git SHA/,
  );
});

test("requires the staging billing source project to be active in the reviewed organization", () => {
  const sourceProject = {
    projectId: "samra-pay-staging",
    lifecycleState: "ACTIVE",
    parent: { type: "organization", id: "993968777863" },
  };
  assert.deepEqual(validateSourceBillingProject(sourceProject), {
    projectId: "samra-pay-staging",
    organizationId: "993968777863",
    state: "ready",
  });

  for (const mutate of [
    (value) => (value.projectId = "samra-pay-production"),
    (value) => (value.lifecycleState = "DELETE_REQUESTED"),
    (value) => (value.parent.id = "999999999999"),
  ]) {
    const observed = structuredClone(sourceProject);
    mutate(observed);
    assert.throws(
      () => validateSourceBillingProject(observed),
      /staging billing source project/,
    );
  }
});

test("requires the concrete staging billing account to be open", () => {
  assert.deepEqual(
    validateSourceBillingAccount(
      {
        billingEnabled: true,
        billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
      },
      { name: "billingAccounts/ABCDEF-123456-ABCDEF", open: true },
    ),
    {
      sourceProjectId: "samra-pay-staging",
      billingAccount: "billingAccounts/ABCDEF-123456-ABCDEF",
      billingAccountId: "ABCDEF-123456-ABCDEF",
      open: true,
    },
  );
  assert.throws(
    () =>
      validateSourceBillingAccount(
        {
          billingEnabled: true,
          billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
        },
        { name: "billingAccounts/ABCDEF-123456-ABCDEF", open: false },
      ),
    /must exist and be open/,
  );
});

test("classifies a missing or exact project and rejects existing drift", () => {
  assert.deepEqual(classifyObservedProductionProject(null), {
    state: "missing",
  });
  assert.deepEqual(classifyObservedProductionProject(exactProject), {
    state: "ready",
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
  });

  for (const mutate of [
    (value) => (value.name = "Wrong name"),
    (value) => (value.lifecycleState = "DELETE_REQUESTED"),
    (value) => (value.parent.id = "999999999999"),
    (value) => (value.labels.environment = "staging"),
    (value) => (value.labels.extra = "unexpected"),
  ]) {
    const observed = structuredClone(exactProject);
    mutate(observed);
    assert.throws(
      () => classifyObservedProductionProject(observed),
      /Existing production project .* drifted/,
    );
  }
});

test("uses exact organization inventory when Google masks an absent project as permission denied", () => {
  assert.deepEqual(classifyObservedProductionProjectInventory([]), {
    state: "missing",
  });
  assert.deepEqual(classifyObservedProductionProjectInventory([exactProject]), {
    state: "ready",
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
  });
  assert.throws(
    () =>
      classifyObservedProductionProjectInventory([exactProject, exactProject]),
    /more than one exact project ID/,
  );
});

test("classifies only an absent or exact production billing link", () => {
  const account = "billingAccounts/ABCDEF-123456-ABCDEF";
  assert.deepEqual(
    classifyObservedProductionBilling(
      { billingEnabled: false, billingAccountName: "" },
      account,
    ),
    { state: "missing" },
  );
  assert.deepEqual(
    classifyObservedProductionBilling(
      { billingEnabled: true, billingAccountName: account },
      account,
    ),
    { state: "ready", billingAccount: account },
  );
  assert.throws(
    () =>
      classifyObservedProductionBilling(
        {
          billingEnabled: true,
          billingAccountName: "billingAccounts/DIFFER-123456-ABCDEF",
        },
        account,
      ),
    /different account/,
  );
});

test("accepts project-ID or project-number budget scope and rejects drift", () => {
  assert.deepEqual(classifyObservedProductionBudgets([], "382465561715"), {
    state: "missing",
  });
  assert.deepEqual(
    classifyObservedProductionBudgets(
      [exactBudget("projects/samra-pay-production")],
      "382465561715",
    ),
    {
      state: "ready",
      displayName: "Samra Pay production monthly budget",
      projectResource: "projects/samra-pay-production",
      monthlyBudgetUsd: 25,
    },
  );
  assert.deepEqual(
    classifyObservedProductionBudgets(
      [exactBudget("projects/382465561715")],
      "382465561715",
    ).state,
    "ready",
  );

  for (const budgets of [
    [
      {
        ...exactBudget(),
        displayName: "Wrong budget",
      },
    ],
    [
      {
        ...exactBudget(),
        budgetFilter: {
          projects: [
            "projects/samra-pay-production",
            "projects/another-project",
          ],
          calendarPeriod: "MONTH",
        },
      },
    ],
    [
      {
        ...exactBudget(),
        thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 1 }],
      },
    ],
    [
      {
        ...exactBudget(),
        thresholdRules: [
          { thresholdPercent: 0.5, spendBasis: "CURRENT_SPEND" },
          { thresholdPercent: 0.9, spendBasis: "FORECASTED_SPEND" },
          { thresholdPercent: 1, spendBasis: "CURRENT_SPEND" },
        ],
      },
    ],
  ]) {
    assert.throws(
      () => classifyObservedProductionBudgets(budgets, "382465561715"),
      /differs from the exact/,
    );
  }
  assert.throws(
    () =>
      classifyObservedProductionBudgets(
        [exactBudget(), exactBudget("projects/382465561715")],
        "382465561715",
      ),
    /Multiple budgets/,
  );
});

test("runs a local plan before any cloud command is required", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/provision-coming-soon-production-project.sh", "--plan"],
    { encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  assert.match(output, /COMING-SOON PRODUCTION PROJECT PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /Cloud state read: no/);
  assert.match(output, /no automatic Cloud APIs/);
  assert.match(output, /open billing account already attached/);
  assert.match(output, /project-only USD 25 monthly budget alert/);
  assert.match(output, /alert, not a spending cap/);
  assert.match(output, /cannot\n.*enable an API/);
  assert.match(output, /PLAN COMPLETE — NO CLOUD OR DNS CHANGES/);

  const invalidMode = spawnSync(
    "bash",
    ["deploy/gcp/provision-coming-soon-production-project.sh", "--destroy"],
    { encoding: "utf8" },
  );
  assert.equal(invalidMode.status, 2);
  assert.match(invalidMode.stderr, /--plan\|--review\|--apply/);
});

test("keeps every mutation after exact account, Git, state, and authorization guards", () => {
  for (const evidence of [
    "STOP: wrong Google account",
    "STOP: set the active Google Cloud project to ${SOURCE_BILLING_PROJECT_ID}",
    'gcloud projects describe "${SOURCE_BILLING_PROJECT_ID}"',
    "gcloud projects list",
    "parent.type=organization AND parent.id=${ORGANIZATION_ID} AND projectId=${PROJECT_ID}",
    "source commit does not match the reviewed SHA",
    "source working tree is not clean",
    "The billing account attached",
    "Existing production project identity",
    "Existing production billing is disabled or attached to a different account",
    "Multiple budgets target the production project",
    "REVIEW COMPLETE — NO CLOUD OR DNS CHANGES",
    '[[ "${SAMRA_GCP_PRODUCTION_PROJECT_APPLY}" == "${AUTHORIZATION}" ]]',
    "--no-enable-cloud-apis",
    '--billing-account="${SOURCE_BILLING_ACCOUNT_ID}"',
    '--filter-projects="projects/${PROJECT_ID}"',
    '--budget-amount="${BUDGET_AMOUNT}"',
    "--threshold-rule=percent=0.50",
    "--threshold-rule=percent=0.90",
    "--threshold-rule=percent=1.00",
    "APPLY COMPLETE — POST-AUDIT REQUIRED",
  ]) {
    assert.ok(controllerSource.includes(evidence), evidence);
  }

  const authorizationIndex = controllerScript.indexOf(
    '[[ "${SAMRA_GCP_PRODUCTION_PROJECT_APPLY}" == "${AUTHORIZATION}" ]]',
  );
  const gitGuardIndex = controllerScript.indexOf(
    'git -C "${ROOT_DIR}" status --porcelain',
  );
  for (const mutation of [
    'gcloud projects create "${PROJECT_ID}"',
    'gcloud billing projects link "${PROJECT_ID}"',
    "gcloud billing budgets create",
  ]) {
    const mutationIndex = controllerScript.indexOf(mutation);
    assert.ok(mutationIndex > authorizationIndex, mutation);
    assert.ok(mutationIndex > gitGuardIndex, mutation);
    assert.equal(controllerScript.indexOf(mutation, mutationIndex + 1), -1);
  }

  assert.doesNotMatch(
    controllerScript,
    /gcloud (?:services enable|artifacts repositories create|iam service-accounts create|secrets create|sql instances create|run deploy|compute .* create|dns .* create|projects delete|billing projects unlink|billing budgets (?:update|delete))/u,
  );
  assert.doesNotMatch(
    controllerScript,
    /--allow-unauthenticated|gcloud secrets versions|curl |terraform|pulumi|kubectl/iu,
  );
  assert.doesNotMatch(
    controllerScript,
    /gcloud projects describe "\$\{PROJECT_ID\}"/u,
  );

  const syntax = spawnSync(
    "bash",
    ["-n", "deploy/gcp/provision-coming-soon-production-project.sh"],
    { encoding: "utf8" },
  );
  assert.equal(syntax.status, 0, syntax.stderr);
});
