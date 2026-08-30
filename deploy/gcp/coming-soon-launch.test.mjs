import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
  validateComingSoonProductionReviewEnvironment,
  validateObservedProductionBilling,
  validateObservedProductionBudgets,
  validateObservedProductionProject,
} from "./validate-coming-soon-launch.mjs";

const productionReview = await readFile(
  "deploy/gcp/review-coming-soon-production.sh",
  "utf8",
);

const reviewEnvironment = {
  SAMRA_GCP_PROJECT_ID: "samra-pay-production",
  SAMRA_GCP_PROJECT_NUMBER: "382465561715",
  SAMRA_GCP_ORGANIZATION_ID: "614833350075",
  SAMRA_GCP_REGION: "us-east4",
  SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
  SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
  SAMRA_GCP_DATA_CLASSIFICATION: "customer-pii",
  SAMRA_GCP_MONTHLY_BUDGET_USD: "25",
  SAMRA_PUBLIC_APEX_DOMAIN: "samrapay.com",
  SAMRA_PUBLIC_CANONICAL_HOST: "www",
};

test("validates the review-only coming-soon launch boundary", () => {
  assert.deepEqual(validateComingSoonLaunch(), {
    schemaVersion: 1,
    status: "validated-review-only",
    launchPhase: "production-coming-soon",
    boundaryStatus: "project-verified-foundation-not-applied",
    projectId: "samra-pay-production",
    canonicalDomain: "www.samrapay.com",
    publicRouteCount: 1,
    productionReviewMode: "read-only",
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
});

test("rejects staging reuse, public product APIs, and unapproved DNS", () => {
  for (const mutate of [
    (value) => (value.productionBoundary.projectId = "samra-pay-staging"),
    (value) =>
      value.services["samra-customer-web"].publicApiRoutes.push(
        "GET /api/v1/me",
      ),
    (value) => (value.data.stagingDatabaseReuseAllowed = true),
    (value) => (value.dnsCutover.changesAuthorized = true),
  ]) {
    const contract = structuredClone(readComingSoonLaunch());
    mutate(contract);
    assert.throws(() => validateComingSoonLaunch(contract));
  }
});

test("rejects vendor activation and lost rollback controls", () => {
  const contract = structuredClone(readComingSoonLaunch());
  contract.services["samra-api"].environment.SAMRA_CUSTOMER_AUTH_MODE = "auth0";
  assert.throws(() => validateComingSoonLaunch(contract), /vendors dormant/);

  const rollbackDrift = structuredClone(readComingSoonLaunch());
  rollbackDrift.release.priorRevisionRequired = false;
  assert.throws(() => validateComingSoonLaunch(rollbackDrift), /rollback/);
});

test("validates exact production review inputs without authorizing a change", () => {
  assert.deepEqual(
    validateComingSoonProductionReviewEnvironment(reviewEnvironment),
    {
      projectId: "samra-pay-production",
      projectNumber: "382465561715",
      organizationId: "614833350075",
      region: "us-east4",
      operator: "me@davidhaile.com",
      expectedSha: "a".repeat(40),
      dataClassification: "customer-pii",
      monthlyBudgetUsd: 25,
      apexDomain: "samrapay.com",
      canonicalHost: "www",
      canonicalDomain: "www.samrapay.com",
    },
  );
  assert.equal(
    validateComingSoonProductionReviewEnvironment({
      ...reviewEnvironment,
      SAMRA_GCP_OPERATOR_ACCOUNT:
        "samra-production-auditor@samra-pay-production.iam.gserviceaccount.com",
    }).operator,
    "samra-production-auditor@samra-pay-production.iam.gserviceaccount.com",
  );
});

test("rejects confirmed production boundary drift", () => {
  for (const [name, value] of [
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-production-alt"],
    ["SAMRA_GCP_PROJECT_ID", "samra-pay-staging"],
    ["SAMRA_GCP_PROJECT_NUMBER", "UNSET"],
    ["SAMRA_GCP_ORGANIZATION_ID", "999999999999"],
    ["SAMRA_GCP_REGION", "us-west1"],
    ["SAMRA_GCP_OPERATOR_ACCOUNT", "founder@gmail.com"],
    ["SAMRA_GCP_EXPECTED_SHA", "abc123"],
    ["SAMRA_GCP_DATA_CLASSIFICATION", "restricted"],
    ["SAMRA_GCP_DATA_CLASSIFICATION", "synthetic"],
    ["SAMRA_GCP_MONTHLY_BUDGET_USD", "0"],
    ["SAMRA_GCP_MONTHLY_BUDGET_USD", "26"],
    ["SAMRA_PUBLIC_APEX_DOMAIN", "example.com"],
    ["SAMRA_PUBLIC_APEX_DOMAIN", "https://samrapay.com"],
    ["SAMRA_PUBLIC_CANONICAL_HOST", "both"],
  ]) {
    assert.throws(
      () =>
        validateComingSoonProductionReviewEnvironment({
          ...reviewEnvironment,
          [name]: value,
        }),
      name,
    );
  }
});

test("validates exact observed project, billing, and project-scoped budget", () => {
  const expected =
    validateComingSoonProductionReviewEnvironment(reviewEnvironment);
  assert.deepEqual(
    validateObservedProductionProject(
      {
        projectId: "samra-pay-production",
        projectNumber: "382465561715",
        lifecycleState: "ACTIVE",
        parent: { type: "organization", id: "614833350075" },
        labels: {
          environment: "production",
          application: "samra-pay",
          data_classification: "customer-pii",
        },
      },
      expected,
    ),
    {
      projectId: "samra-pay-production",
      projectNumber: "382465561715",
      organizationId: "614833350075",
      dataClassification: "customer-pii",
    },
  );
  assert.deepEqual(
    validateObservedProductionBilling(
      {
        billingEnabled: true,
        billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
      },
      {
        billingEnabled: true,
        billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
      },
    ),
    {
      billingAccount: "billingAccounts/ABCDEF-123456-ABCDEF",
      sourceProjectId: "samra-pay-staging",
    },
  );
  assert.deepEqual(
    validateObservedProductionBudgets(
      [
        {
          displayName: "Samra Pay production monthly budget",
          amount: {
            specifiedAmount: { currencyCode: "USD", units: "25" },
          },
          budgetFilter: { projects: ["projects/382465561715"] },
          thresholdRules: [
            { thresholdPercent: 0.5 },
            { thresholdPercent: 0.9 },
            { thresholdPercent: 1 },
          ],
        },
      ],
      expected,
    ),
    {
      displayName: "Samra Pay production monthly budget",
      monthlyBudgetUsd: 25,
      projectResource: "projects/382465561715",
    },
  );
  assert.deepEqual(
    validateObservedProductionBudgets(
      [
        {
          displayName: "Samra Pay production monthly budget",
          amount: {
            specifiedAmount: { currencyCode: "USD", units: "25" },
          },
          budgetFilter: {
            projects: ["projects/samra-pay-production"],
            calendarPeriod: "MONTH",
          },
          thresholdRules: [
            { thresholdPercent: 1 },
            { thresholdPercent: 0.5 },
            { thresholdPercent: 0.9 },
          ],
        },
      ],
      expected,
    ).projectResource,
    "projects/samra-pay-production",
  );
});

test("rejects project drift, disabled billing, and broad or mismatched budgets", () => {
  const expected =
    validateComingSoonProductionReviewEnvironment(reviewEnvironment);
  assert.throws(
    () =>
      validateObservedProductionProject(
        {
          projectId: "samra-pay-production",
          projectNumber: "382465561715",
          lifecycleState: "ACTIVE",
          parent: { type: "organization", id: "614833350075" },
          labels: {
            environment: "staging",
            application: "samra-pay",
            data_classification: "customer-pii",
          },
        },
        expected,
      ),
    /drifted/,
  );
  assert.throws(
    () =>
      validateObservedProductionBilling(
        {
          billingEnabled: false,
          billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
        },
        {
          billingEnabled: true,
          billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
        },
      ),
    /exact account attached/,
  );
  assert.throws(
    () =>
      validateObservedProductionBilling(
        {
          billingEnabled: true,
          billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF",
        },
        {
          billingEnabled: true,
          billingAccountName: "billingAccounts/DIFFER-123456-ABCDEF",
        },
      ),
    /exact account attached/,
  );
  assert.throws(
    () =>
      validateObservedProductionBudgets(
        [
          {
            displayName: "Shared budget",
            amount: {
              specifiedAmount: { currencyCode: "USD", units: "25" },
            },
            budgetFilter: {
              projects: ["projects/382465561715", "projects/999999999999"],
            },
            thresholdRules: [
              { thresholdPercent: 0.5 },
              { thresholdPercent: 0.9 },
              { thresholdPercent: 1 },
            ],
          },
        ],
        expected,
      ),
    /No exact project-scoped approved production budget/,
  );
  assert.throws(
    () =>
      validateObservedProductionBudgets(
        [
          {
            displayName: "Samra Pay production monthly budget",
            amount: {
              specifiedAmount: { currencyCode: "USD", units: "25" },
            },
            budgetFilter: { projects: ["projects/382465561715"] },
            thresholdRules: [
              { thresholdPercent: 0.5 },
              { thresholdPercent: 0.9 },
              { thresholdPercent: 1 },
            ],
          },
          {
            displayName: "Samra Pay production monthly budget",
            amount: {
              specifiedAmount: { currencyCode: "USD", units: "25" },
            },
            budgetFilter: {
              projects: ["projects/samra-pay-production"],
            },
            thresholdRules: [
              { thresholdPercent: 0.5 },
              { thresholdPercent: 0.9 },
              { thresholdPercent: 1 },
            ],
          },
        ],
        expected,
      ),
    /Multiple budgets target/,
  );
  assert.throws(
    () =>
      validateObservedProductionBudgets(
        [
          {
            displayName: "Samra Pay production monthly budget",
            amount: {
              specifiedAmount: { currencyCode: "USD", units: "25" },
            },
            budgetFilter: { projects: ["projects/382465561715"] },
            thresholdRules: [
              { thresholdPercent: 0.5, spendBasis: "CURRENT_SPEND" },
              { thresholdPercent: 0.9, spendBasis: "FORECASTED_SPEND" },
              { thresholdPercent: 1, spendBasis: "CURRENT_SPEND" },
            ],
          },
        ],
        expected,
      ),
    /No exact project-scoped approved production budget/,
  );
});

test("imports the validator without executing its command-line entrypoint", () => {
  const validatorUrl = new URL(
    "./validate-coming-soon-launch.mjs",
    import.meta.url,
  ).href;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "await import(process.argv[1]);",
      validatorUrl,
    ],
    { encoding: "utf8" },
  );

  assert.equal(output, "");
});

test("plans locally and contains no cloud, deployment, data, or DNS mutation", () => {
  const output = execFileSync(
    "bash",
    ["deploy/gcp/review-coming-soon-production.sh", "--plan"],
    { encoding: "utf8" },
  );
  assert.match(output, /Plan only\. No Google Cloud, Squarespace DNS/);
  assert.match(output, /USD 25 monthly alert/);
  assert.match(output, /same concrete account as samra-pay-staging/);
  assert.match(output, /cannot create a project or budget/);
  assert.match(output, /activate Auth0\/Persona\/Crossmint/);

  for (const evidence of [
    "STOP: wrong Google account",
    "STOP: wrong Google Cloud project",
    "source commit does not match the reviewed SHA",
    "source working tree is not clean",
    "READ-ONLY COMING-SOON PRODUCTION FOUNDATION REVIEW PASS",
    "this is not a spending cap",
    'gcloud billing projects describe "${SOURCE_BILLING_PROJECT_ID}"',
    '--data-urlencode "scope=projects/${SAMRA_GCP_PROJECT_NUMBER}"',
    '--header "X-Goog-User-Project: ${SAMRA_GCP_QUOTA_PROJECT_ID}"',
    "Billing account: verified exact source-project match",
    "Billing source project: ${SOURCE_BILLING_PROJECT_ID}",
    "remain unauthorized",
    "REVIEW COMPLETE — NO CLOUD OR DNS CHANGES",
  ]) {
    assert.ok(productionReview.includes(evidence), evidence);
  }
  assert.equal(
    productionReview.match(
      /--data-urlencode "scope=projects\/\$\{SAMRA_GCP_PROJECT_NUMBER\}"/gu,
    )?.length,
    1,
    "only the budget inventory uses the exact production project scope",
  );
  assert.doesNotMatch(
    productionReview,
    /gcloud (?:projects create|billing projects link|billing budgets create|services enable|artifacts repositories create|sql instances create|run deploy|compute .* create|dns .* create)/,
  );
  assert.doesNotMatch(
    productionReview,
    /--allow-unauthenticated|gcloud secrets versions access|gcloud secrets versions add|curl .*squarespace|POST .*waitlist/iu,
  );
  assert.doesNotMatch(
    productionReview,
    /gcloud services enable|gcloud billing budgets (?:create|update|delete)/iu,
  );
});
