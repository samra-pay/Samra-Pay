import type {
  PersonaManifest,
  PersonaReport,
  PersonaReportInput,
} from "./contract.js";

export const PERSONA_SCENARIO_IDS: readonly string[];
export function validatePersonaManifest(value: unknown): PersonaManifest;
export function validateLocalDatabaseUrl(value: unknown): string;
export function buildPersonaReport(input: PersonaReportInput): PersonaReport;
export function renderPersonaSummary(report: PersonaReport): string;
