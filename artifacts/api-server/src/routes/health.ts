import { Router, type IRouter } from "express";
import {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from "@workspace/api-zod";
import type { DemoRuntime } from "../domain/demo-runtime";

export function createHealthRouter(runtime?: DemoRuntime): IRouter {
  const router: IRouter = Router();

  router.use((_req, res, next) => {
    const revision = process.env["K_REVISION"];
    if (revision) res.setHeader("X-Samra-Cloud-Run-Revision", revision);
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/healthz", (_req, res) => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  });

  router.get("/readyz", async (req, res) => {
    try {
      await runtime?.checkReadiness();
      res.json(ReadinessCheckResponse.parse({ status: "ready" }));
    } catch (error) {
      req.log.warn({ err: error }, "Runtime readiness check failed");
      res
        .status(503)
        .json(ReadinessCheckResponse.parse({ status: "not_ready" }));
    }
  });

  return router;
}
