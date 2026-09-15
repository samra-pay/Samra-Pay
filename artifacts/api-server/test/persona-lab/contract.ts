export type PersonaAlias = "sender" | "limited";

export interface PersonaDefinition {
  alias: PersonaAlias;
  displayName: string;
  openingBalanceMinor: string;
}

export interface PersonaManifest {
  schemaVersion: 1;
  personas: readonly PersonaDefinition[];
}

export type ScenarioStatus = "passed" | "failed" | "blocked";

export interface ScenarioResult {
  id: string;
  title: string;
  persona: PersonaAlias | "both";
  status: ScenarioStatus;
  observations: Record<string, string | number | boolean>;
  errorCode?: string;
}

export interface PersonaReportInput {
  manifest: PersonaManifest;
  runId: string;
  sourceSha: string;
  dirty: boolean;
  startedAt: string;
  finishedAt: string;
  results: readonly ScenarioResult[];
}

export interface PersonaReport extends PersonaReportInput {
  schemaVersion: 1;
  kind: "local-synthetic-persona-lab";
  status: ScenarioStatus;
  scope: {
    environment: "local-disposable-postgres";
    authentication: "simulated";
    humanAcceptance: false;
    providers: "fake";
    realFinancialActivity: false;
    wallet: "synthetic-no-onchain";
  };
  summary: { total: number; passed: number; failed: number; blocked: number };
}
