import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { loadMarketingRuntime } from "./marketing-runtime.mjs";
export async function runMarketingEntry({
  env = process.env,
  mode = process.argv[2],
  load = loadMarketingRuntime,
} = {}) {
  if (!["server", "worker", "metrics"].includes(mode))
    throw new Error("MARKETING_ENTRY_MODE_REQUIRED");
  const app = await load({ env });
  if (mode !== "server") {
    try {
      const result =
        mode === "worker" ? await app.workOnce() : await app.metrics();
      process.stdout.write(JSON.stringify(result) + "\n");
    } finally {
      await app.close();
    }
    return;
  }
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    await app.close();
    throw new Error("INVALID_PORT");
  }
  const server = createServer(async (req, res) => {
    try {
      // Dedicated service exposes only the application allowlist. Forwarded hosts are never trusted.
      const url = new URL(req.url ?? "/", "https://www.samrapay.com");
      const method = req.method ?? "GET";
      const request = new Request(url, {
        method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(method)
          ? { body: Readable.toWeb(req), duplex: "half" }
          : {}),
      });
      const result = await app.handle(request);
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end('{"accepted":false}');
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.listen(port, "0.0.0.0");
  server.on("close", () => void app.close());
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runMarketingEntry().catch(() => {
    process.stderr.write("MARKETING_RUNTIME_FAILED\n");
    process.exitCode = 1;
  });
}
