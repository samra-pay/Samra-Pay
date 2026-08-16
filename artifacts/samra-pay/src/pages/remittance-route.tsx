import Remittance from "./remittance";
import { ApiDashboardRemittance } from "./dashboard/remittance-api";
import { useSamraDataMode } from "@/lib/samra-runtime";

export function PublicRemittanceRoute() {
  const mode = useSamraDataMode();
  return mode === "api" ? <ApiDashboardRemittance /> : <Remittance />;
}
