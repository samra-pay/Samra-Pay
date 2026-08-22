import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = path.join(moduleDirectory, "public");
const publicRuntimeConfigPath = "/samra-runtime-config.js";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function loadServerConfig(environment = process.env) {
  const port = Number(environment.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be a valid positive integer.");
  }

  const apiOrigin = environment.SAMRA_API_ORIGIN
    ? new URL(environment.SAMRA_API_ORIGIN)
    : null;
  if (apiOrigin && !["http:", "https:"].includes(apiOrigin.protocol)) {
    throw new Error("SAMRA_API_ORIGIN must use http or https.");
  }
  if (
    apiOrigin?.protocol === "http:" &&
    !["127.0.0.1", "[::1]", "localhost"].includes(apiOrigin.hostname)
  ) {
    throw new Error(
      "SAMRA_API_ORIGIN must use https unless it targets loopback testing.",
    );
  }

  return Object.freeze({
    apiOrigin,
    port,
    publicRuntimeConfig: loadPublicRuntimeConfig(environment),
    publicDirectory:
      environment.SAMRA_PUBLIC_DIRECTORY ?? defaultPublicDirectory,
  });
}

export function loadPublicRuntimeConfig(environment = process.env) {
  const dataMode = environment.SAMRA_PUBLIC_DATA_MODE?.trim();
  if (dataMode !== undefined && dataMode !== "api" && dataMode !== "mock") {
    throw new Error('SAMRA_PUBLIC_DATA_MODE must be "api" or "mock".');
  }

  const auth0 = {
    domain: environment.SAMRA_PUBLIC_AUTH0_DOMAIN?.trim(),
    clientId: environment.SAMRA_PUBLIC_AUTH0_CLIENT_ID?.trim(),
    audience: environment.SAMRA_PUBLIC_AUTH0_AUDIENCE?.trim(),
  };
  const auth0Values = Object.values(auth0);
  const configuredAuth0Values = auth0Values.filter(Boolean);
  if (
    configuredAuth0Values.length !== 0 &&
    configuredAuth0Values.length !== auth0Values.length
  ) {
    throw new Error(
      "Every public Auth0 identifier is required when Auth0 runtime configuration is present.",
    );
  }

  if (configuredAuth0Values.length > 0) {
    assertPublicHostname(auth0.domain, "SAMRA_PUBLIC_AUTH0_DOMAIN");
    if (!/^[A-Za-z0-9_-]{8,512}$/u.test(auth0.clientId)) {
      throw new Error(
        "SAMRA_PUBLIC_AUTH0_CLIENT_ID must be an opaque public identifier.",
      );
    }
    assertPublicHttpsIdentifier(auth0.audience, "SAMRA_PUBLIC_AUTH0_AUDIENCE");
  }

  return Object.freeze({
    ...(dataMode ? { VITE_SAMRA_DATA_MODE: dataMode } : {}),
    ...(auth0.domain
      ? {
          VITE_AUTH0_DOMAIN: auth0.domain,
          VITE_AUTH0_CLIENT_ID: auth0.clientId,
          VITE_AUTH0_AUDIENCE: auth0.audience,
        }
      : {}),
  });
}

function assertPublicHostname(value, name) {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
      value,
    )
  ) {
    throw new Error(`${name} must be a lowercase HTTPS hostname only.`);
  }
}

function assertPublicHttpsIdentifier(value, name) {
  let identifier;
  try {
    identifier = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS identifier.`);
  }
  if (
    identifier.protocol !== "https:" ||
    identifier.username ||
    identifier.password ||
    identifier.search ||
    identifier.hash ||
    value.length > 512
  ) {
    throw new Error(`${name} must be an absolute HTTPS identifier.`);
  }
}

export function serializePublicRuntimeConfig(config) {
  const json = JSON.stringify(config).replaceAll("<", "\\u003c");
  return `globalThis.__SAMRA_RUNTIME_CONFIG__ = Object.freeze(${json});\n`;
}

export function resolvePublicFile(publicDirectory, requestPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestPathname);
  } catch {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const candidate = path.resolve(publicDirectory, relativePath);
  const relative = path.relative(publicDirectory, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return candidate;
}

function applySecurityHeaders(response) {
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}

function servePublicRuntimeConfig(request, response, config) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      allow: "GET, HEAD",
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed");
    return;
  }

  const body = serializePublicRuntimeConfig(config);
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(body)),
    "content-type": "text/javascript; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

function proxyRequestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (hopByHopHeaders.has(name.toLowerCase()) || value === undefined)
      continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  headers.set("x-forwarded-host", request.headers.host ?? "");
  headers.set("x-forwarded-proto", "https");
  return headers;
}

async function proxyApiRequest(request, response, apiOrigin) {
  if (!apiOrigin) {
    response.writeHead(502, { "content-type": "application/problem+json" });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Samra API unavailable",
        status: 502,
        detail: "SAMRA_API_ORIGIN is not configured for this web service.",
      }),
    );
    return;
  }

  const target = new URL(request.url ?? "/api", apiOrigin);
  const method = request.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await readRequestBody(request);

  let upstream;
  try {
    upstream = await fetch(target, {
      body,
      headers: proxyRequestHeaders(request),
      method,
      redirect: "manual",
    });
  } catch {
    response.writeHead(502, { "content-type": "application/problem+json" });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Samra API unavailable",
        status: 502,
        detail: "The web service could not reach the Samra API.",
      }),
    );
    return;
  }

  for (const [name, value] of upstream.headers) {
    if (
      !hopByHopHeaders.has(name.toLowerCase()) &&
      name.toLowerCase() !== "set-cookie"
    ) {
      response.setHeader(name, value);
    }
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    response.appendHeader("set-cookie", cookie);
  }
  response.statusCode = upstream.status;
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function serveFile(response, filePath, requestMethod) {
  const file = await stat(filePath).catch(() => null);
  if (!file?.isFile()) return false;

  response.statusCode = 200;
  response.setHeader(
    "content-type",
    contentTypes.get(path.extname(filePath).toLowerCase()) ??
      "application/octet-stream",
  );
  response.setHeader(
    "cache-control",
    path.basename(filePath) === "index.html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  );
  response.setHeader("content-length", String(file.size));
  if (requestMethod === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

export function createStaticServer(config) {
  return createServer(async (request, response) => {
    applySecurityHeaders(response);
    const url = new URL(request.url ?? "/", "http://samra.local");

    if (url.pathname === "/healthz") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname === publicRuntimeConfigPath) {
      servePublicRuntimeConfig(
        request,
        response,
        config.publicRuntimeConfig ?? Object.freeze({}),
      );
      return;
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      await proxyApiRequest(request, response, config.apiOrigin);
      return;
    }

    const requestedFile = resolvePublicFile(
      config.publicDirectory,
      url.pathname,
    );
    if (
      requestedFile &&
      (await serveFile(response, requestedFile, request.method))
    )
      return;

    const indexFile = path.join(config.publicDirectory, "index.html");
    if (await serveFile(response, indexFile, request.method)) return;

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = loadServerConfig();
  createStaticServer(config).listen(config.port, "0.0.0.0", () => {
    console.log(
      JSON.stringify({ event: "web_server_started", port: config.port }),
    );
  });
}
