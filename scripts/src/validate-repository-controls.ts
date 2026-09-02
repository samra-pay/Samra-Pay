#!/usr/bin/env tsx

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = path.join(
  WORKSPACE_ROOT,
  "docs/testing/repository-controls.json",
);

type RequiredCheck = Readonly<{
  workflow: string;
  job: string;
  name: string;
  aggregateStep: string;
  dependencies: readonly string[];
}>;

type RepositoryControls = Readonly<{
  version: number;
  protectedBranch: string;
  requiredChecks: readonly RequiredCheck[];
  requiredRepositorySettings: Readonly<{
    requirePullRequest: boolean;
    requireUpToDateBranch: boolean;
    requireMergeQueue: boolean;
    blockForcePushes: boolean;
    blockDeletions: boolean;
  }>;
  boundary: string;
}>;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jobBody(workflow: string, job: string): string {
  const declaration = new RegExp(
    `^  ${escapeRegularExpression(job)}:\\s*$`,
    "m",
  ).exec(workflow);
  if (!declaration || declaration.index === undefined) {
    throw new Error(`Required workflow job ${job} is missing.`);
  }
  const remainder = workflow.slice(declaration.index + declaration[0].length);
  const nextJob = /^  [a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  return nextJob ? remainder.slice(0, nextJob.index) : remainder;
}

function topLevelSectionBody(workflow: string, section: string): string {
  const declaration = new RegExp(
    `^${escapeRegularExpression(section)}:\\s*$`,
    "m",
  ).exec(workflow);
  if (!declaration || declaration.index === undefined) {
    throw new Error(`Workflow is missing top-level ${section}.`);
  }
  const remainder = workflow.slice(declaration.index + declaration[0].length);
  const nextSection = /^[a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  return nextSection ? remainder.slice(0, nextSection.index) : remainder;
}

function topLevelTriggerBody(workflow: string, trigger: string): string {
  const declaration = new RegExp(`^  ${trigger}:\\s*$`, "m").exec(workflow);
  if (!declaration || declaration.index === undefined) {
    throw new Error(`Workflow is missing trigger ${trigger}.`);
  }
  const remainder = workflow.slice(declaration.index + declaration[0].length);
  const nextTrigger = /^  [a-zA-Z0-9_-]+:\s*$/m.exec(remainder);
  return nextTrigger ? remainder.slice(0, nextTrigger.index) : remainder;
}

function jobBlock(body: string, property: string): string {
  const declaration = new RegExp(
    `^    ${escapeRegularExpression(property)}:\\s*$`,
    "m",
  ).exec(body);
  if (!declaration || declaration.index === undefined) {
    throw new Error(`Required job is missing ${property}.`);
  }
  const remainder = body.slice(declaration.index + declaration[0].length);
  const nextProperty = /^    [a-zA-Z0-9_-]+:\s*/m.exec(remainder);
  return nextProperty ? remainder.slice(0, nextProperty.index) : remainder;
}

function aggregateStepBody(body: string, name: string): string {
  const declaration = new RegExp(
    `^      - name: ${escapeRegularExpression(name)}\\s*$`,
    "m",
  ).exec(body);
  if (!declaration || declaration.index === undefined) {
    throw new Error(`Required aggregate step ${name} is missing.`);
  }
  const remainder = body.slice(declaration.index + declaration[0].length);
  const nextStep = /^      - /m.exec(remainder);
  return nextStep ? remainder.slice(0, nextStep.index) : remainder;
}

export function validateRepositoryControls(
  contract: RepositoryControls,
  workflows: Readonly<Record<string, string>>,
): void {
  if (contract.version !== 1 || contract.protectedBranch !== "main") {
    throw new Error("Repository controls must govern main under version 1.");
  }
  if (contract.requiredChecks.length !== 2) {
    throw new Error(
      "Repository controls require exactly CI and security checks.",
    );
  }
  if (
    Object.values(contract.requiredRepositorySettings).some(
      (required) => required !== true,
    )
  ) {
    throw new Error(
      "Every declared repository protection setting must be required.",
    );
  }
  if (!contract.boundary.includes("GitHub must independently enforce")) {
    throw new Error(
      "Repository controls must preserve the external enforcement boundary.",
    );
  }

  for (const check of contract.requiredChecks) {
    const workflow = workflows[check.workflow];
    if (!workflow) {
      throw new Error(`Required workflow ${check.workflow} is missing.`);
    }
    const triggers = topLevelSectionBody(workflow, "on");
    topLevelTriggerBody(triggers, "pull_request");
    topLevelTriggerBody(triggers, "merge_group");
    const pushTrigger = topLevelTriggerBody(triggers, "push");
    if (!/^\s{6}- main\s*$/mu.test(pushTrigger)) {
      throw new Error(`${check.workflow} does not run on pushes to main.`);
    }
    const concurrency = topLevelSectionBody(workflow, "concurrency");
    if (
      !/^  cancel-in-progress:\s*\$\{\{ github\.event_name == 'pull_request' \}\}\s*$/mu.test(
        concurrency,
      )
    ) {
      throw new Error(
        `${check.workflow} may cancel merge-group or main-branch evidence.`,
      );
    }

    const body = jobBody(workflow, check.job);
    if (/^    continue-on-error:/mu.test(body)) {
      throw new Error(`${check.job} must not continue on error.`);
    }
    if (
      !new RegExp(
        `^    name: ${escapeRegularExpression(check.name)}\\s*$`,
        "mu",
      ).test(body)
    ) {
      throw new Error(`${check.job} is missing its exact required name.`);
    }
    const jobConditions = [...body.matchAll(/^    if:\s*(.*?)\s*$/gmu)].map(
      (match) => match[1],
    );
    if (jobConditions.length !== 1 || jobConditions[0] !== "always()") {
      throw new Error(
        `${check.job} must have exactly one job-level if: always().`,
      );
    }

    const declaredDependencies = [
      ...jobBlock(body, "needs").matchAll(/^      - ([a-zA-Z0-9_-]+)\s*$/gmu),
    ].map((match) => match[1]!);
    if (
      declaredDependencies.length !== check.dependencies.length ||
      check.dependencies.some(
        (dependency) => !declaredDependencies.includes(dependency),
      )
    ) {
      throw new Error(
        `${check.job} must declare exactly its contracted needs.`,
      );
    }

    const aggregate = aggregateStepBody(body, check.aggregateStep);
    if (/^        if:/mu.test(aggregate)) {
      throw new Error(`${check.aggregateStep} must not be conditionally skipped.`);
    }
    if (/^        continue-on-error:/mu.test(aggregate)) {
      throw new Error(`${check.aggregateStep} must not continue on error.`);
    }
    for (const dependency of check.dependencies) {
      const resultBinding = new RegExp(
        `^          ([A-Z][A-Z0-9_]*)_RESULT:\\s*\\$\\{\\{\\s*needs\\.${escapeRegularExpression(dependency)}\\.result\\s*\\}\\}\\s*$`,
        "mu",
      ).exec(aggregate);
      if (!resultBinding?.[1]) {
        throw new Error(
          `${check.job} does not bind dependency result ${dependency}.`,
        );
      }
      const resultVariable = `${resultBinding[1]}_RESULT`;
      if (
        !new RegExp(
          `^          test "\\$\\{${resultVariable}\\}" = success\\s*$`,
          "mu",
        ).test(aggregate)
      ) {
        throw new Error(
          `${check.job} does not execute a success predicate for ${dependency}.`,
        );
      }
    }
  }
}

function main(): void {
  const contract = JSON.parse(
    fs.readFileSync(CONTRACT_PATH, "utf8"),
  ) as RepositoryControls;
  const workflows = Object.fromEntries(
    contract.requiredChecks.map(({ workflow }) => [
      workflow,
      fs.readFileSync(path.join(WORKSPACE_ROOT, workflow), "utf8"),
    ]),
  );
  validateRepositoryControls(contract, workflows);
  process.stdout.write(
    `${JSON.stringify({ status: "passed", check: "repository-controls", requiredChecks: contract.requiredChecks.map(({ name }) => name) })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
