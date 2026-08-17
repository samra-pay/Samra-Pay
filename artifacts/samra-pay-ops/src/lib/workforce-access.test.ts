import { describe, expect, it } from "vitest";

import { OPERATIONS_ROUTES, visibleOperationsRoutes } from "./workforce-access";

describe("workforce navigation access", () => {
  it("shows Support only customer, transfer, and case investigation routes", () => {
    expect(visibleOperationsRoutes("support_readonly")).toEqual([
      "/",
      "/customers",
      "/transfers",
      "/cases",
    ]);
  });

  it("shows Operations operational surfaces without the immutable audit log", () => {
    expect(visibleOperationsRoutes("operations_analyst")).toEqual([
      "/",
      "/customers",
      "/transfers",
      "/cases",
      "/money-flow",
      "/reconciliation",
      "/worker-operations",
      "/reports",
      "/system-health",
    ]);
  });

  it("shows Compliance only summary, transfers, reconciliation, and audit", () => {
    expect(visibleOperationsRoutes("compliance_readonly")).toEqual([
      "/",
      "/transfers",
      "/reconciliation",
      "/audit-log",
    ]);
  });

  it("shows Administrator every operations route", () => {
    expect(visibleOperationsRoutes("administrator")).toEqual(
      OPERATIONS_ROUTES,
    );
  });
});
