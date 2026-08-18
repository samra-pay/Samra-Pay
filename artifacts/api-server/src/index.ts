import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

let shutdownPromise: Promise<void> | undefined;

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  shutdownPromise ??= (async () => {
    logger.info({ signal }, "Graceful shutdown started");
    const workerTimer = app.locals["demoWorkerTimer"] as
      | NodeJS.Timeout
      | undefined;
    if (workerTimer) clearInterval(workerTimer);

    const timeout = setTimeout(() => server.closeAllConnections(), 10_000);
    timeout.unref();
    try {
      await closeHttpServer();
      const runtime = app.locals["demoRuntime"] as
        | { close(): Promise<void> }
        | undefined;
      await runtime?.close();
      logger.info({ signal }, "Graceful shutdown completed");
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    await shutdownPromise;
    process.exit(0);
  } catch (error) {
    logger.error({ err: error, signal }, "Graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
