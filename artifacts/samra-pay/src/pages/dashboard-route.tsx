import Dashboard from "./dashboard";
import { ApiDashboard } from "./dashboard-api";
import { useSamraDataMode } from "@/lib/samra-runtime";

export function DashboardHomeRoute() {
  const mode = useSamraDataMode();
  return mode === "api" ? <ApiDashboard /> : <Dashboard />;
}
