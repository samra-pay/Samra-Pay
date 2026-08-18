import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { createApiRouter } from "./routes";
import { loadApiRuntimeConfig, type ApiRuntimeConfig } from "./config";
import { logger } from "./lib/logger";
import { problemHandler } from "./lib/problem";
import { DemoRuntime } from "./domain/demo-runtime";
import { createConfiguredDemoRuntime } from "./domain/create-demo-runtime";
import { startDemoWorker } from "./domain/demo-worker";
import { DomainError } from "@workspace/remittance";

export function createApp(
  config: ApiRuntimeConfig = loadApiRuntimeConfig(),
  demoRuntime?: DemoRuntime,
): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const runtime =
    config.backendMode === "demo" && config.providerMode === "fake"
      ? (demoRuntime ?? createConfiguredDemoRuntime(config))
      : undefined;
  app.use("/api", createApiRouter(config, runtime));
  if (runtime && config.runWorker) {
    app.locals["demoWorkerTimer"] = startDemoWorker(
      runtime,
      config.workerIntervalMilliseconds,
    );
  }
  if (runtime) {
    app.locals["demoRuntime"] = runtime;
  }
  app.use((_req, _res, next) =>
    next(new DomainError("NOT_FOUND", "The route was not found.")),
  );
  app.use(problemHandler);
  return app;
}

export default createApp();
