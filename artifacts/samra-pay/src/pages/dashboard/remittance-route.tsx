import { useSamraDataMode } from "@/lib/samra-runtime";
import { DashboardRemittance as LegacyDashboardRemittance } from "./remittance";
import { ApiDashboardRemittance } from "./remittance-api";

/**
 * The legacy experience remains the default. API mode is an explicit cutover
 * for this route only; no other dashboard page consumes the new data source.
 */
export function DashboardRemittanceRoute() {
  const mode = useSamraDataMode();
  return mode === "api" ? (
    <ApiDashboardRemittance />
  ) : (
    <LegacyDashboardRemittance />
  );
}
