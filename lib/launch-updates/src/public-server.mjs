import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createPublicWaitlistService } from "./public-waitlist-service.mjs";

export function startPublicWaitlistServer({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const service = createPublicWaitlistService({ env, fetchImpl });
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PUBLIC_WAITLIST_PORT_INVALID");

  const server = createServer(async (incoming, outgoing) => {
    try {
      const method = incoming.method ?? "GET";
      const request = new Request(
        `https://${incoming.headers.host ?? "invalid"}${incoming.url ?? "/"}`,
        {
          method,
          headers: incoming.headers,
          ...(!["GET", "HEAD"].includes(method)
            ? { body: Readable.toWeb(incoming), duplex: "half" }
            : {}),
        },
      );
      const response = await service.handle(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      outgoing.end('{"accepted":false,"code":"WAITLIST_UNAVAILABLE"}');
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.listen(port, "0.0.0.0");
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startPublicWaitlistServer();
}
