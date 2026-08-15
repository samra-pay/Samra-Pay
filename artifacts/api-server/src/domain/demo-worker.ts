import { logger } from "../lib/logger";
import type { DemoRuntime } from "./demo-runtime";

const WORKER_BATCH_LIMIT = 25;

export function startDemoWorker(
  runtime: DemoRuntime,
  intervalMilliseconds = 1_000,
): NodeJS.Timeout {
  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    void runtime
      .advanceWorkerBatch(WORKER_BATCH_LIMIT)
      .catch((error: unknown) => {
        logger.error({ err: error }, "Demo remittance worker tick failed");
      })
      .finally(() => {
        running = false;
      });
  }, intervalMilliseconds);
  timer.unref();
  return timer;
}
