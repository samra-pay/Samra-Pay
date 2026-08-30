import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  readComingSoonLaunch,
  validateComingSoonLaunch,
} from "./validate-coming-soon-launch.mjs";
import {
  readComingSoonProductionFoundation,
  validateComingSoonProductionFoundation,
} from "./validate-coming-soon-production-foundation.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironmentValue(environment, name) {
  const value = String(environment[name] ?? "").trim();
  assert(value.length > 0, `${name} is required`);
  return value;
}

function canonicalThresholds(rules = []) {
  return rules
    .map((rule) => Number(rule?.thresholdPercent))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function projectResources(projectId, projectNumber) {
  const resources = [`projects/${projectId}`];
  if (projectNumber) resources.push(`projects/${projectNumber}`);
  return new Set(resources);
}

export function readComingSoonProductionProject() {
  return JSON.parse(
    readFileSync(
      new URL("./coming-soon-production-project.json", import.meta.url),
      "utf8",
    ),
  );
}

export function validateComingSoonProductionProject(
  controller = readComingSoonProductionProject(),
  launch = readComingSoonLaunch(),
  foundation = readComingSoonProductionFoundation(),
) {
  const validatedLaunch = validateComingSoonLaunch(launch);
  const validatedFoundation = validateComingSoonProductionFoundation(
    foundation,
    launch,
  );

  assert(
    controller.schemaVersion === 1 &&
      controller.status === "applied-verified" &&
      controller.phase === "coming-soon-production-project" &&
      controller.applyAuthorized === false,
    "The production project controller must remain applied and independently verified",
  );
  assert(
    controller.linkedLaunchContract === "deploy/gcp/coming-soon-launch.json" &&
      controller.linkedFoundationContract ===
        "deploy/gcp/coming-soon-production-foundation.json" &&
      validatedLaunch.deploymentAuthorized === false &&
      validatedLaunch.dnsAuthorized === false &&
      validatedFoundation.cloudMutationAuthorized === false,
    "The controller must remain linked to the non-deployment production contracts",
  );

  const project = controller.project;
  assert(
    project.id === launch.productionBoundary.projectId &&
      project.id === foundation.productionBoundary.projectId &&
      project.number === launch.productionBoundary.projectNumber &&
      project.number === foundation.productionBoundary.projectNumber &&
      project.name === "Samra Pay Production" &&
      project.organizationId === launch.productionBoundary.organizationId &&
      project.organizationId === foundation.productionBoundary.organizationId &&
      project.sourceBillingProjectId ===
        launch.productionBoundary.billingAccountSourceProjectId &&
      project.sourceBillingProjectId ===
        foundation.productionBoundary.billingAccountSourceProjectId &&
      project.id !== launch.productionBoundary.mustNotEqualProjectId &&
      project.createWithCloudApisEnabled === false,
    "The exact production project identity or minimal-creation boundary drifted",
  );
  assert(
    JSON.stringify(project.labels) ===
      JSON.stringify(launch.productionReview.requiredProjectLabels) &&
      JSON.stringify(project.labels) ===
        JSON.stringify(foundation.projectLabels),
    "The exact production project labels drifted",
  );

  assert(
    controller.billing.mustMatchSourceProject === true &&
      controller.billing.accountMustBeOpen === true &&
      controller.billing.moveFromDifferentAccountAllowed === false,
    "Billing must remain pinned to the open staging billing account",
  );

  const budget = controller.budget;
  assert(
    budget.displayName === "Samra Pay production monthly budget" &&
      budget.currency === launch.productionReview.budget.currency &&
      budget.amount === launch.productionReview.budget.approvedMonthlyAmount &&
      budget.amount === foundation.productionBoundary.monthlyBudgetUsd &&
      budget.calendarPeriod === "MONTH" &&
      budget.projectFilter === `projects/${project.id}` &&
      JSON.stringify(budget.thresholdPercents) ===
        JSON.stringify(launch.productionReview.budget.thresholdPercents) &&
      budget.thresholdSpendBasis === "CURRENT_SPEND" &&
      budget.budgetIsSpendingCap === false &&
      budget.duplicateAllowed === false,
    "The project-scoped USD 25 monthly budget boundary drifted",
  );

  const verification = controller.verification;
  assert(
    verification.status === "passed-read-only" &&
      verification.sourceSha === "7a28fb4df556a4a32f882544b9446275817b1c4f" &&
      verification.verifiedOn === "2026-08-30" &&
      verification.projectLifecycle === "ACTIVE" &&
      verification.billingAccountMatchesSourceProject === true &&
      verification.budgetMatchesContract === true &&
      verification.cloudOrDnsChangesMadeByVerification === false,
    "The independent production project verification drifted",
  );

  assert(
    controller.modes.plan === "local-only" &&
      controller.modes.review === "read-only" &&
      controller.modes.applyAuthorizationEnvironment ===
        "SAMRA_GCP_PRODUCTION_PROJECT_APPLY" &&
      controller.modes.applyAuthorizationValue ===
        "AUTHORIZED_COMING_SOON_PRODUCTION_PROJECT",
    "The controller modes or exact apply authorization drifted",
  );
  assert(
    controller.applyCreatesOnly.length === 3 &&
      controller.applyNeverCreates.length === 9 &&
      controller.applyNeverCreates.includes(
        "Cloud Run service, job, revision, or traffic",
      ) &&
      controller.applyNeverCreates.includes(
        "Squarespace DNS record or registrar change",
      ) &&
      controller.applyNeverCreates.includes(
        "customer record, waitlist submission, or production data",
      ) &&
      controller.remainingAuthorizationGates.length === 4 &&
      !controller.remainingAuthorizationGates.some((gate) =>
        /production project, billing, and budget apply/iu.test(gate),
      ),
    "The bounded create scope or remaining authorization gates drifted",
  );

  const source = JSON.stringify(controller);
  assert(
    !/postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH) PRIVATE KEY|api[_-]?key|password|versions\/latest/iu.test(
      source,
    ),
    "The production project controller contains a credential or secret",
  );

  return Object.freeze({
    schemaVersion: controller.schemaVersion,
    status: "validated-applied-verified",
    phase: controller.phase,
    projectId: project.id,
    projectNumber: project.number,
    projectName: project.name,
    organizationId: project.organizationId,
    sourceBillingProjectId: project.sourceBillingProjectId,
    monthlyBudgetUsd: budget.amount,
    thresholdPercents: budget.thresholdPercents,
    projectCreationAuthorized: false,
    billingMutationAuthorized: false,
    budgetMutationAuthorized: false,
    infrastructureAuthorized: false,
    deploymentAuthorized: false,
    dnsAuthorized: false,
  });
}

export function validateProductionProjectControllerEnvironment(
  environment = process.env,
  controller = readComingSoonProductionProject(),
) {
  validateComingSoonProductionProject(controller);
  const operator = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_OPERATOR_ACCOUNT",
  );
  const expectedSha = requiredEnvironmentValue(
    environment,
    "SAMRA_GCP_EXPECTED_SHA",
  );
  assert(
    /^[^@\s]+@davidhaile\.com$/u.test(operator),
    "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
  );
  assert(
    /^[0-9a-f]{40}$/u.test(expectedSha),
    "SAMRA_GCP_EXPECTED_SHA must be a full lowercase Git SHA",
  );
  return Object.freeze({ operator, expectedSha });
}

export function validateSourceBillingAccount(
  sourceProjectBilling,
  billingAccount,
  controller = readComingSoonProductionProject(),
) {
  validateComingSoonProductionProject(controller);
  const accountName = String(sourceProjectBilling?.billingAccountName ?? "");
  assert(
    sourceProjectBilling?.billingEnabled === true &&
      /^billingAccounts\/[A-Z0-9-]+$/u.test(accountName) &&
      billingAccount?.name === accountName &&
      billingAccount?.open === true,
    `The billing account attached to ${controller.project.sourceBillingProjectId} must exist and be open`,
  );
  return Object.freeze({
    sourceProjectId: controller.project.sourceBillingProjectId,
    billingAccount: accountName,
    billingAccountId: accountName.replace(/^billingAccounts\//u, ""),
    open: true,
  });
}

export function validateSourceBillingProject(
  observed,
  controller = readComingSoonProductionProject(),
) {
  validateComingSoonProductionProject(controller);
  assert(
    observed?.projectId === controller.project.sourceBillingProjectId &&
      observed?.lifecycleState === "ACTIVE" &&
      observed?.parent?.type === "organization" &&
      String(observed?.parent?.id ?? "") === controller.project.organizationId,
    "The staging billing source project must be active in the reviewed organization",
  );
  return Object.freeze({
    projectId: observed.projectId,
    organizationId: String(observed.parent.id),
    state: "ready",
  });
}

export function classifyObservedProductionProject(
  observed,
  controller = readComingSoonProductionProject(),
) {
  validateComingSoonProductionProject(controller);
  if (observed == null) return Object.freeze({ state: "missing" });

  const labels = observed.labels ?? {};
  const expectedLabels = controller.project.labels;
  assert(
    observed.projectId === controller.project.id &&
      observed.name === controller.project.name &&
      String(observed.projectNumber ?? "") === controller.project.number &&
      observed.lifecycleState === "ACTIVE" &&
      observed.parent?.type === "organization" &&
      String(observed.parent?.id ?? "") === controller.project.organizationId &&
      JSON.stringify(Object.keys(labels).sort()) ===
        JSON.stringify(Object.keys(expectedLabels).sort()) &&
      Object.entries(expectedLabels).every(
        ([key, value]) => labels[key] === value,
      ),
    "Existing production project identity, organization, lifecycle, name, or labels drifted",
  );
  return Object.freeze({
    state: "ready",
    projectId: observed.projectId,
    projectNumber: String(observed.projectNumber),
  });
}

export function classifyObservedProductionProjectInventory(
  observed,
  controller = readComingSoonProductionProject(),
) {
  validateComingSoonProductionProject(controller);
  assert(
    Array.isArray(observed),
    "Production project inventory must be a list",
  );
  assert(
    observed.length <= 1,
    "Production project inventory returned more than one exact project ID",
  );
  return classifyObservedProductionProject(observed[0] ?? null, controller);
}

export function classifyObservedProductionBilling(
  observed,
  expectedBillingAccount,
) {
  const billingAccountName = String(observed?.billingAccountName ?? "");
  if (observed?.billingEnabled === false && billingAccountName.length === 0) {
    return Object.freeze({ state: "missing" });
  }
  assert(
    observed?.billingEnabled === true &&
      billingAccountName === expectedBillingAccount,
    "Existing production billing is disabled or attached to a different account",
  );
  return Object.freeze({
    state: "ready",
    billingAccount: billingAccountName,
  });
}

export function classifyObservedProductionBudgets(
  observed,
  projectNumber,
  controller = readComingSoonProductionProject(),
) {
  validateComingSoonProductionProject(controller);
  assert(
    Array.isArray(observed),
    "Production budget observation must be a list",
  );
  const acceptedResources = projectResources(
    controller.project.id,
    projectNumber,
  );
  const candidates = observed.filter((budget) => {
    const projects =
      budget?.budgetFilter?.projects ?? budget?.filter?.projects ?? [];
    return projects.some((project) => acceptedResources.has(project));
  });
  if (candidates.length === 0) return Object.freeze({ state: "missing" });
  assert(
    candidates.length === 1,
    "Multiple budgets target the production project",
  );

  const budget = candidates[0];
  const filter = budget?.budgetFilter ?? budget?.filter ?? {};
  const projects = filter.projects ?? [];
  const amount = budget?.amount?.specifiedAmount ?? {};
  const thresholdRules = budget?.thresholdRules ?? [];
  assert(
    projects.length === 1 &&
      acceptedResources.has(projects[0]) &&
      budget.displayName === controller.budget.displayName &&
      amount.currencyCode === controller.budget.currency &&
      Number(amount.units ?? 0) === controller.budget.amount &&
      Number(amount.nanos ?? 0) === 0 &&
      (filter.calendarPeriod === undefined ||
        filter.calendarPeriod === controller.budget.calendarPeriod) &&
      thresholdRules.length === controller.budget.thresholdPercents.length &&
      thresholdRules.every(
        (rule) =>
          rule?.spendBasis === undefined ||
          rule.spendBasis === controller.budget.thresholdSpendBasis,
      ) &&
      JSON.stringify(canonicalThresholds(thresholdRules)) ===
        JSON.stringify(controller.budget.thresholdPercents),
    "Existing production budget differs from the exact project-scoped USD 25 monthly alert",
  );
  return Object.freeze({
    state: "ready",
    displayName: budget.displayName,
    projectResource: projects[0],
    monthlyBudgetUsd: controller.budget.amount,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateComingSoonProductionProject())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Production project controller rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
