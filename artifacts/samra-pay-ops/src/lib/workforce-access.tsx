import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { WorkforceSession } from "./workforce-auth";

export type WorkforceRole = WorkforceSession["role"];

export const OPERATIONS_ROUTES = Object.freeze([
  "/",
  "/customers",
  "/transfers",
  "/cases",
  "/money-flow",
  "/reconciliation",
  "/worker-operations",
  "/audit-log",
  "/reports",
  "/system-health",
] as const);

export type OperationsRoute = (typeof OPERATIONS_ROUTES)[number];

const OPERATIONS_ROUTE_SET: ReadonlySet<string> = new Set(OPERATIONS_ROUTES);

const ROUTES_BY_ROLE: Readonly<
  Record<WorkforceRole, ReadonlySet<OperationsRoute>>
> = Object.freeze({
  support_readonly: new Set<OperationsRoute>([
    "/",
    "/customers",
    "/transfers",
    "/cases",
  ]),
  operations_analyst: new Set<OperationsRoute>([
    "/",
    "/customers",
    "/transfers",
    "/cases",
    "/money-flow",
    "/reconciliation",
    "/worker-operations",
    "/reports",
    "/system-health",
  ]),
  compliance_readonly: new Set<OperationsRoute>([
    "/",
    "/transfers",
    "/reconciliation",
    "/audit-log",
  ]),
  administrator: new Set<OperationsRoute>(OPERATIONS_ROUTES),
});

export function canAccessOperationsRoute(
  role: WorkforceRole,
  route: OperationsRoute,
): boolean {
  return ROUTES_BY_ROLE[role].has(route);
}

export function isOperationsRoute(value: string): value is OperationsRoute {
  return OPERATIONS_ROUTE_SET.has(value);
}

export function visibleOperationsRoutes(
  role: WorkforceRole,
): readonly OperationsRoute[] {
  return OPERATIONS_ROUTES.filter((route) =>
    canAccessOperationsRoute(role, route),
  );
}

const WorkforceRoleContext = createContext<WorkforceRole | null>(null);

export function WorkforceRoleProvider({
  role,
  children,
}: {
  role: WorkforceRole;
  children: ReactNode;
}) {
  return (
    <WorkforceRoleContext.Provider value={role}>
      {children}
    </WorkforceRoleContext.Provider>
  );
}

export function useWorkforceRole(): WorkforceRole {
  const role = useContext(WorkforceRoleContext);
  if (!role) {
    throw new Error("A workforce role is required inside the operations portal.");
  }
  return role;
}
