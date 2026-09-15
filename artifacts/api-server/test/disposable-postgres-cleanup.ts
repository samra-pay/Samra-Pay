import type { DatabaseConnection } from "@workspace/db";

export async function closeDisposableConnection(
  connection: Pick<DatabaseConnection, "pool"> | undefined,
  timeoutMs = 60_000,
): Promise<void> {
  if (!connection) return;
  const pool = connection.pool;
  let remaining = pool.totalCount;
  let disconnected: () => void = () => undefined;
  const physicalDisconnects = new Promise<void>((resolve) => {
    disconnected = resolve;
    if (remaining === 0) resolve();
  });
  const onRemove = (): void => {
    remaining -= 1;
    if (remaining === 0) disconnected();
  };
  // pg-pool can empty its inventory and resolve end() before client end
  // callbacks emit remove. DROP ... FORCE must wait for those disconnects.
  pool.on("remove", onRemove);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          "Timed out waiting for disposable database connections to close.",
        ),
      );
    }, timeoutMs);
  });
  try {
    await Promise.race([
      Promise.all([pool.end(), physicalDisconnects]),
      deadline,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    pool.off("remove", onRemove);
  }
}
