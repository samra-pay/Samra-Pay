import { Router, type IRouter } from "express";
import healthRouter from "./health";
import type { ApiRuntimeConfig } from "../config";
import { DemoRuntime } from "../domain/demo-runtime";
import { createUnavailableV1Router, createV1Router } from "./v1";
import { DomainError } from "@workspace/remittance";

export function createApiRouter(
  config: ApiRuntimeConfig,
  demoRuntime?: DemoRuntime,
): IRouter {
  const router: IRouter = Router();
  router.use(healthRouter);
  const runtime =
    config.backendMode === "demo" && config.providerMode === "fake"
      ? (demoRuntime ?? new DemoRuntime())
      : undefined;
  if (!runtime) {
    router.use("/v1/dev", (_req, _res, next) =>
      next(new DomainError("NOT_FOUND", "The route was not found.")),
    );
  }
  router.use(
    "/v1",
    runtime ? createV1Router(runtime, config) : createUnavailableV1Router(),
  );
  return router;
}
