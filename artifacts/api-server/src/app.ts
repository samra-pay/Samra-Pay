import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { Logger } from "pino";
import { createApiRouter } from "./routes";
import { loadApiRuntimeConfig, type ApiRuntimeConfig } from "./config";
import { logger } from "./lib/logger";
import { createHttpLogger } from "./lib/http-logger";
import { AuthorizationDeniedError, problemHandler } from "./lib/problem";
import { DemoRuntime } from "./domain/demo-runtime";
import { createConfiguredDemoRuntime } from "./domain/create-demo-runtime";
import { startDemoWorker } from "./domain/demo-worker";
import { DomainError } from "@workspace/remittance";

export function createApp(
  config: ApiRuntimeConfig = loadApiRuntimeConfig(),
  demoRuntime?: DemoRuntime,
  dependencies: Readonly<{
    customerAccessTokenMiddleware?: RequestHandler;
    requestLogger?: Logger;
  }> = {},
): Express {
  const app: Express = express();
  const runtime =
    config.backendMode === "demo" && config.providerMode === "fake"
      ? (demoRuntime ?? createConfiguredDemoRuntime(config))
      : undefined;

  app.set("trust proxy", config.trustedProxies ?? false);
  app.use(createHttpLogger(dependencies.requestLogger ?? logger));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      xContentTypeOptions: true,
      xFrameOptions: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  const allowedOrigins = new Set(config.allowedOrigins ?? []);
  app.use(
    cors({
      origin(origin, callback) {
        // Origin-less server/native calls still require the route's authentication.
        if (origin === undefined) return callback(null, false);
        if (allowedOrigins.has(origin)) return callback(null, true);
        callback(
          new AuthorizationDeniedError("The request origin is not allowed."),
        );
      },
    }),
  );
  app.use(cookieParser());
  app.post(
    "/api/v1/provider-events/persona",
    express.raw({ type: "application/json", limit: "1mb" }),
    (req, res, next) => {
      void (async () => {
        if (!runtime?.personaWebhookService) {
          throw new DomainError("NOT_FOUND", "The route was not found.");
        }
        if (!Buffer.isBuffer(req.body)) {
          throw new DomainError(
            "INVALID_ARGUMENT",
            "The provider webhook body must be JSON.",
          );
        }
        const receipt = await runtime.personaWebhookService.process({
          rawBody: req.body,
          signatureHeader: req.header("persona-signature"),
        });
        if (receipt.ignored) {
          res.status(204).end();
          return;
        }
        res.status(200).json({
          received: true,
          replayed: receipt.result.replayed,
          disposition: receipt.result.disposition,
        });
      })().catch(next);
    },
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", createApiRouter(config, runtime, dependencies));
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
