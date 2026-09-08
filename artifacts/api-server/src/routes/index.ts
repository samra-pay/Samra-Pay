import { Router, type IRouter, type RequestHandler } from "express";
import { createHealthRouter } from "./health";
import type { ApiRuntimeConfig } from "../config";
import type { DemoRuntime } from "../domain/demo-runtime";
import { createUnavailableV1Router, createV1Router } from "./v1";
import { DomainError } from "@workspace/remittance";

export function createApiRouter(
  config: ApiRuntimeConfig,
  demoRuntime?: DemoRuntime,
  dependencies: Readonly<{
    customerAccessTokenMiddleware?: RequestHandler;
  }> = {},
): IRouter {
  const router: IRouter = Router();
  const runtime =
    config.backendMode === "demo" && config.providerMode === "fake"
      ? demoRuntime
      : undefined;
  if (config.backendMode === "demo" && !runtime) {
    throw new Error(
      "The API router requires an explicitly configured runtime.",
    );
  }
  router.use(createHealthRouter(runtime));
  if (!runtime) {
    router.use("/v1/dev", (_req, _res, next) =>
      next(new DomainError("NOT_FOUND", "The route was not found.")),
    );
  }
  router.use(
    "/v1",
    runtime
      ? createV1Router(runtime, config, dependencies)
      : createUnavailableV1Router(),
  );
  return router;
}
