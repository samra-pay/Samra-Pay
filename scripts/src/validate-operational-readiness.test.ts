import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import {
  type OperationalReadinessContract,
  type OperationalReadinessValidationInputs,
  validateOperationalReadiness,
} from "./validate-operational-readiness";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const checkedInContract = JSON.parse(
  readFileSync(
    path.join(workspaceRoot, "docs/operations/operational-readiness.json"),
    "utf8",
  ),
) as OperationalReadinessContract;
const checkedInInputs: OperationalReadinessValidationInputs = {
  evidencePathExists: (relativePath) =>
    existsSync(path.join(workspaceRoot, relativePath)),
  backendResilienceWorkflow: readFileSync(
    path.join(workspaceRoot, ".github/workflows/backend-resilience.yml"),
    "utf8",
  ),
  apiPackage: JSON.parse(
    readFileSync(
      path.join(workspaceRoot, "artifacts/api-server/package.json"),
      "utf8",
    ),
  ) as OperationalReadinessValidationInputs["apiPackage"],
  scriptsPackage: JSON.parse(
    readFileSync(path.join(workspaceRoot, "scripts/package.json"), "utf8"),
  ) as OperationalReadinessValidationInputs["scriptsPackage"],
  workspacePackage: JSON.parse(
    readFileSync(path.join(workspaceRoot, "package.json"), "utf8"),
  ) as OperationalReadinessValidationInputs["workspacePackage"],
};

function contractCopy(): OperationalReadinessContract {
  return structuredClone(checkedInContract);
}

describe("operational readiness contract", () => {
  it("validates the checked-in contract, evidence paths, and workflow wiring", () => {
    expect(() =>
      validateOperationalReadiness(checkedInContract, checkedInInputs),
    ).not.toThrow();
  });

  it("rejects production approval and non-synthetic scope drift", () => {
    expect(() =>
      validateOperationalReadiness(
        { ...contractCopy(), productionApproval: "approved" },
        checkedInInputs,
      ),
    ).toThrow(/production-blocked/);
    expect(() =>
      validateOperationalReadiness(
        { ...contractCopy(), scope: "Production operations are live." },
        checkedInInputs,
      ),
    ).toThrow(/synthetic, non-production/);
  });

  it("rejects telemetry backend, exporter, browser, payload, and cardinality activation", () => {
    const runtimeOutput = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...runtimeOutput,
          telemetry: {
            ...runtimeOutput.telemetry,
            runtimeOutput: "plain-text-file",
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/structured JSON stdout/);

    const backend = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...backend,
          telemetry: { ...backend.telemetry, backend: "vendor.example" },
        },
        checkedInInputs,
      ),
    ).toThrow(/vendor-neutral/);

    const browser = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...browser,
          telemetry: {
            ...browser.telemetry,
            browserRuntimeDependencies: ["vendor-browser-sdk"],
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/browser dependencies/);

    const payload = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...payload,
          telemetry: { ...payload.telemetry, customerDataAllowed: true },
        },
        checkedInInputs,
      ),
    ).toThrow(/payload or cardinality/);

    const cardinality = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...cardinality,
          telemetry: {
            ...cardinality.telemetry,
            allowedMetricDimensions: [
              ...cardinality.telemetry.allowedMetricDimensions,
              "customerId",
            ],
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/metric dimensions/);
  });

  it("rejects staffed-response and service-level claims without activation evidence", () => {
    const incident = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...incident,
          incidentResponse: {
            ...incident.incidentResponse,
            acknowledgementMinutes: 15,
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/must not claim unstaffed coverage/);

    const owner = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...owner,
          incidentResponse: {
            ...owner.incidentResponse,
            roles: owner.incidentResponse.roles.map((role) =>
              role.id === "incident-commander"
                ? { ...role, owner: "unapproved-owner" }
                : role,
            ),
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/remain unassigned/);

    const objective = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...objective,
          serviceLevels: {
            ...objective.serviceLevels,
            objectives: objective.serviceLevels.objectives.map((item) =>
              item.id === "api-availability" ? { ...item, target: 99.9 } : item,
            ),
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/must not claim an unapproved target/);
  });

  it("rejects cloud recovery, retained dump, and production RPO claims", () => {
    for (const mutate of [
      (contract: OperationalReadinessContract) => ({
        ...contract.dataRecovery,
        cloudRestore: "tested",
      }),
      (contract: OperationalReadinessContract) => ({
        ...contract.dataRecovery,
        dumpRetentionAllowed: true,
      }),
      (contract: OperationalReadinessContract) => ({
        ...contract.dataRecovery,
        productionRpoMinutes: 15,
      }),
    ]) {
      const contract = contractCopy();
      expect(() =>
        validateOperationalReadiness(
          { ...contract, dataRecovery: mutate(contract) },
          checkedInInputs,
        ),
      ).toThrow(/must not claim cloud proof/);
    }
  });

  it("rejects provider fail-open and automatic retry authorization", () => {
    const failOpen = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...failOpen,
          providerResilience: {
            ...failOpen.providerResilience,
            states: failOpen.providerResilience.states.map((state) =>
              state.id === "unknown"
                ? { ...state, allowNewEconomicCommands: true }
                : state,
            ),
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/unknown has an unsafe/);

    const retry = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...retry,
          providerResilience: {
            ...retry.providerResilience,
            retryPolicy: {
              ...retry.providerResilience.retryPolicy,
              state: "authorized",
            },
          },
        },
        checkedInInputs,
      ),
    ).toThrow(/retry must remain unauthorized/);
  });

  it("rejects hard-stop removal, authorization, and semantic inversion", () => {
    const missing = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...missing,
          hardStops: missing.hardStops.filter(
            ({ id }) => id !== "customer-data",
          ),
        },
        checkedInInputs,
      ),
    ).toThrow(/hard-stop IDs must be exact/);

    const authorized = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...authorized,
          hardStops: authorized.hardStops.map((hardStop) =>
            hardStop.id === "live-provider"
              ? { ...hardStop, state: "allowed" }
              : hardStop,
          ),
        },
        checkedInInputs,
      ),
    ).toThrow(/must remain blocked with its exact governed condition/);

    const inverted = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...inverted,
          hardStops: inverted.hardStops.map((hardStop) =>
            hardStop.id === "customer-data"
              ? { ...hardStop, condition: "Customer data is approved." }
              : hardStop,
          ),
        },
        checkedInInputs,
      ),
    ).toThrow(/must remain blocked with its exact governed condition/);
  });

  it("rejects missing, traversing, or drifted evidence and runbook paths", () => {
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        evidencePathExists: (relativePath) =>
          relativePath !== "docs/operations/runbooks/api-outage.md",
      }),
    ).toThrow(/unavailable evidence path/);

    const traversal = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...traversal,
          pillars: traversal.pillars.map((pillar) =>
            pillar.id === "telemetry"
              ? { ...pillar, evidencePaths: ["../outside.md"] }
              : pillar,
          ),
        },
        { ...checkedInInputs, evidencePathExists: () => true },
      ),
    ).toThrow(/unavailable evidence path/);

    const runbook = contractCopy();
    expect(() =>
      validateOperationalReadiness(
        {
          ...runbook,
          incidentResponse: {
            ...runbook.incidentResponse,
            runbooks: runbook.incidentResponse.runbooks.map((item) =>
              item.id === "api-outage"
                ? { ...item, path: "docs/operations/runbooks/renamed.md" }
                : item,
            ),
          },
        },
        { ...checkedInInputs, evidencePathExists: () => true },
      ),
    ).toThrow(/must use governed path/);
  });

  it("rejects missing recovery execution, evidence, and fail-closed workflow controls", () => {
    const mutations = [
      checkedInInputs.backendResilienceWorkflow.replace(
        "    runs-on: ubuntu-24.04",
        "    runs-on: ubuntu-24.04\n    if: false",
      ),
      checkedInInputs.backendResilienceWorkflow.replace(
        "run: pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit",
        "run: echo skipped",
      ),
      checkedInInputs.backendResilienceWorkflow.replace(
        "        run: pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit",
        "        run: pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit\n        continue-on-error: true",
      ),
      checkedInInputs.backendResilienceWorkflow.replace(
        "SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION: I_UNDERSTAND_THIS_DROPS_DISPOSABLE_LOCAL_DATABASES",
        "SAMRA_DISPOSABLE_BACKUP_RESTORE_CONFIRMATION: weak",
      ),
      checkedInInputs.backendResilienceWorkflow.replace(
        "artifacts/api-server/test-results/weekly-backup-restore.xml",
        "artifacts/api-server/test-results/omitted.xml",
      ),
      checkedInInputs.backendResilienceWorkflow.replace(
        "artifacts/api-server/test-results/weekly-backup-restore.json",
        "artifacts/api-server/test-results/omitted.json",
      ),
    ];
    for (const backendResilienceWorkflow of mutations) {
      expect(() =>
        validateOperationalReadiness(checkedInContract, {
          ...checkedInInputs,
          backendResilienceWorkflow,
        }),
      ).toThrow();
    }

    const warningUpload = checkedInInputs.backendResilienceWorkflow.replace(
      /(- name: Preserve synthetic recovery evidence[\s\S]*?)if-no-files-found: error/u,
      "$1if-no-files-found: warn",
    );
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        backendResilienceWorkflow: warningUpload,
      }),
    ).toThrow(/must fail closed/);
  });

  it("rejects commented and inert recovery workflow decoys", () => {
    const requiredCommand =
      "pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit";
    const commandDecoy = checkedInInputs.backendResilienceWorkflow.replace(
      `        run: ${requiredCommand}`,
      `        run: echo skipped\n        # ${requiredCommand}`,
    );
    expect(commandDecoy).toContain(`# ${requiredCommand}`);
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        backendResilienceWorkflow: commandDecoy,
      }),
    ).toThrow(/missing or inert command/);

    const requiredJsonPath =
      "artifacts/api-server/test-results/weekly-backup-restore.json";
    const pathDecoy = checkedInInputs.backendResilienceWorkflow.replace(
      `          path: ${requiredJsonPath}`,
      `          path: artifacts/api-server/test-results/omitted.json\n          # ${requiredJsonPath}`,
    );
    expect(pathDecoy).toContain(`# ${requiredJsonPath}`);
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        backendResilienceWorkflow: pathDecoy,
      }),
    ).toThrow(/upload must fail closed/);

    const quotedJobIf = checkedInInputs.backendResilienceWorkflow.replace(
      "    timeout-minutes: 45",
      '    timeout-minutes: 45\n    "if": false',
    );
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        backendResilienceWorkflow: quotedJobIf,
      }),
    ).toThrow(/canonical unquoted mapping keys/);

    const quotedContinueOnError =
      checkedInInputs.backendResilienceWorkflow.replace(
        "        run: pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit",
        '        "continue-on-error": true\n        run: pnpm --filter @workspace/api-server run test:weekly-backup-restore:junit',
      );
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        backendResilienceWorkflow: quotedContinueOnError,
      }),
    ).toThrow(/canonical unquoted mapping keys/);

    const inertQase = checkedInInputs.backendResilienceWorkflow
      .replace(
        "        run: |\n          for report in \\",
        "        run: |\n          if false; then\n          for report in \\",
      )
      .replace(
        "          done\n\n      - name: Create Qase weekly resilience run",
        "          done\n          fi\n\n      - name: Create Qase weekly resilience run",
      );
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        backendResilienceWorkflow: inertQase,
      }),
    ).toThrow(/missing executable weekly recovery JUnit checks/);
  });

  it("rejects package-script drift", () => {
    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        apiPackage: {
          scripts: {
            ...checkedInInputs.apiPackage.scripts,
            "test:weekly-backup-restore:junit": "echo skipped",
          },
        },
      }),
    ).toThrow(/JUnit script drifted/);

    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        scriptsPackage: {
          scripts: {
            ...checkedInInputs.scriptsPackage.scripts,
            "validate-operational-readiness": "echo skipped",
          },
        },
      }),
    ).toThrow(/Scripts package operational-readiness command drifted/);

    expect(() =>
      validateOperationalReadiness(checkedInContract, {
        ...checkedInInputs,
        workspacePackage: {
          scripts: {
            ...checkedInInputs.workspacePackage.scripts,
            "test:operational-readiness": "echo skipped",
          },
        },
      }),
    ).toThrow(/Workspace operational-readiness command drifted/);
  });
});
