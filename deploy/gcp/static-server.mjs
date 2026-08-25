import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = path.join(moduleDirectory, "public");
const publicRuntimeConfigPath = "/samra-runtime-config.js";
const cloudRunIdentityEndpoint =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const cloudRunAuthorizationHeader = "x-serverless-authorization";
const identityTokenRefreshSkewSeconds = 300;
const publicCampaignPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const maximumPublicCampaigns = 50;
const maximumProxyRequestBodyBytes = 1_048_576;

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
    !isLoopbackHostname(apiOrigin.hostname)
  ) {
    throw new Error(
      "SAMRA_API_ORIGIN must use https unless it targets loopback testing.",
    );
  }
  if (
    apiOrigin &&
    (apiOrigin.username ||
      apiOrigin.password ||
      apiOrigin.pathname !== "/" ||
      apiOrigin.search ||
      apiOrigin.hash)
  ) {
    throw new Error(
      "SAMRA_API_ORIGIN must contain only an origin without credentials, path, query, or fragment.",
    );
  }

  const apiServiceAuth = loadApiServiceAuthConfig(environment, apiOrigin);

  return Object.freeze({
    apiOrigin,
    apiServiceAuth,
    apiServiceIdentityTokenProvider:
      apiServiceAuth.mode === "cloud-run-iam"
        ? createCloudRunIdentityTokenProvider({
            audience: apiServiceAuth.audience,
          })
        : null,
    port,
    publicRuntimeConfig: loadPublicRuntimeConfig(environment),
    publicTransport: loadPublicTransportConfig(environment),
    publicDirectory:
      environment.SAMRA_PUBLIC_DIRECTORY ?? defaultPublicDirectory,
  });
}

function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "[::1]", "localhost"].includes(hostname);
}

export function loadApiServiceAuthConfig(environment, apiOrigin) {
  const requestedMode = environment.SAMRA_API_SERVICE_AUTH_MODE?.trim();
  const isLocalOrDisconnected =
    !apiOrigin || isLoopbackHostname(apiOrigin.hostname);
  const mode = requestedMode || (isLocalOrDisconnected ? "disabled" : null);

  if (mode === null) {
    throw new Error(
      'SAMRA_API_SERVICE_AUTH_MODE must be "cloud-run-iam" for a non-loopback API origin.',
    );
  }
  if (mode !== "disabled" && mode !== "cloud-run-iam") {
    throw new Error(
      'SAMRA_API_SERVICE_AUTH_MODE must be "disabled" or "cloud-run-iam".',
    );
  }
  if (!isLocalOrDisconnected && mode !== "cloud-run-iam") {
    throw new Error(
      'SAMRA_API_SERVICE_AUTH_MODE must be "cloud-run-iam" for a non-loopback API origin.',
    );
  }
  if (mode === "disabled") {
    return Object.freeze({ mode, audience: null });
  }
  if (!apiOrigin || apiOrigin.protocol !== "https:") {
    throw new Error(
      "Cloud Run API service authentication requires an HTTPS API origin.",
    );
  }

  const rawAudience = environment.SAMRA_API_SERVICE_AUDIENCE?.trim();
  let audience;
  try {
    audience = rawAudience ? new URL(rawAudience) : null;
  } catch {
    audience = null;
  }
  if (
    !audience ||
    audience.protocol !== "https:" ||
    audience.username ||
    audience.password ||
    audience.pathname !== "/" ||
    audience.search ||
    audience.hash
  ) {
    throw new Error(
      "SAMRA_API_SERVICE_AUDIENCE must be the exact HTTPS Cloud Run API origin.",
    );
  }
  if (audience.origin !== apiOrigin.origin) {
    throw new Error(
      "SAMRA_API_SERVICE_AUDIENCE must match SAMRA_API_ORIGIN exactly.",
    );
  }

  return Object.freeze({ mode, audience: audience.origin });
}

function parseIdentityToken(token, audience, nowSeconds) {
  if (
    typeof token !== "string" ||
    token.length > 16_384 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)
  ) {
    throw new Error("Cloud Run service identity returned a malformed token.");
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {
    throw new Error("Cloud Run service identity returned invalid claims.");
  }
  if (
    claims?.aud !== audience ||
    !Number.isInteger(claims?.exp) ||
    claims.exp <= nowSeconds + 60
  ) {
    throw new Error("Cloud Run service identity token claims are invalid.");
  }
  return claims;
}

export function createCloudRunIdentityTokenProvider({
  audience,
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMilliseconds = 2_000,
}) {
  if (typeof audience !== "string" || audience.length === 0) {
    throw new Error("A Cloud Run service audience is required.");
  }

  let cachedToken = null;
  return async function getCloudRunIdentityToken() {
    const nowSeconds = Math.floor(now() / 1_000);
    if (
      cachedToken &&
      cachedToken.expiresAt > nowSeconds + identityTokenRefreshSkewSeconds
    ) {
      return cachedToken.value;
    }

    const endpoint = new URL(cloudRunIdentityEndpoint);
    endpoint.searchParams.set("audience", audience);
    const response = await fetchImpl(endpoint, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    if (!response.ok) {
      throw new Error("Cloud Run service identity token is unavailable.");
    }

    const value = (await response.text()).trim();
    const claims = parseIdentityToken(value, audience, nowSeconds);
    cachedToken = Object.freeze({ value, expiresAt: claims.exp });
    return value;
  };
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

  const campaigns = parsePublicCampaignAllowlist(
    environment.SAMRA_PUBLIC_ACQUISITION_CAMPAIGNS,
  );

  return Object.freeze({
    ...(dataMode ? { VITE_SAMRA_DATA_MODE: dataMode } : {}),
    ...(auth0.domain
      ? {
          VITE_AUTH0_DOMAIN: auth0.domain,
          VITE_AUTH0_CLIENT_ID: auth0.clientId,
          VITE_AUTH0_AUDIENCE: auth0.audience,
        }
      : {}),
    ...(campaigns.length > 0
      ? { VITE_SAMRA_ACQUISITION_CAMPAIGNS: campaigns.join(",") }
      : {}),
  });
}

export function parsePublicCampaignAllowlist(value) {
  if (value === undefined || value.trim() === "") return Object.freeze([]);
  const campaigns = value.split(",").map((campaign) => campaign.trim());
  if (
    campaigns.length > maximumPublicCampaigns ||
    new Set(campaigns).size !== campaigns.length ||
    campaigns.some((campaign) => !publicCampaignPattern.test(campaign))
  ) {
    throw new Error(
      `SAMRA_PUBLIC_ACQUISITION_CAMPAIGNS must contain at most ${maximumPublicCampaigns} unique lowercase slugs.`,
    );
  }
  return Object.freeze(campaigns);
}

export function loadPublicTransportConfig(environment = process.env) {
  const searchIndexing =
    environment.SAMRA_PUBLIC_SEARCH_INDEXING?.trim() || "disabled";
  if (!["disabled", "enabled"].includes(searchIndexing)) {
    throw new Error(
      'SAMRA_PUBLIC_SEARCH_INDEXING must be "disabled" or "enabled".',
    );
  }
  const httpsOnly = environment.SAMRA_PUBLIC_HTTPS_ONLY?.trim() || "false";
  if (!["false", "true"].includes(httpsOnly)) {
    throw new Error('SAMRA_PUBLIC_HTTPS_ONLY must be "true" or "false".');
  }
  return Object.freeze({
    httpsOnly: httpsOnly === "true",
    searchIndexing,
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

function applySecurityHeaders(response, transport = {}) {
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (transport.searchIndexing !== "enabled") {
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  if (transport.httpsOnly === true) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
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

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(
  request,
  maximumBytes = maximumProxyRequestBodyBytes,
) {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError();
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maximumBytes) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

function proxyRequestHeaders(request, serviceIdentityToken) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    const lowerName = name.toLowerCase();
    if (
      hopByHopHeaders.has(lowerName) ||
      lowerName === cloudRunAuthorizationHeader ||
      value === undefined
    )
      continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  headers.set("x-forwarded-host", request.headers.host ?? "");
  headers.set("x-forwarded-proto", "https");
  if (serviceIdentityToken) {
    headers.set(cloudRunAuthorizationHeader, `Bearer ${serviceIdentityToken}`);
  }
  return headers;
}

async function proxyApiRequest(request, response, config) {
  const { apiOrigin } = config;
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
  let body;
  try {
    body =
      method === "GET" || method === "HEAD"
        ? undefined
        : await readRequestBody(request);
  } catch (error) {
    if (!(error instanceof RequestBodyTooLargeError)) throw error;
    response.writeHead(413, {
      "cache-control": "no-store",
      "content-type": "application/problem+json",
    });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Request body too large",
        status: 413,
        detail: "The request body exceeds the 1 MiB customer-web limit.",
      }),
    );
    return;
  }

  let serviceIdentityToken;
  if (config.apiServiceAuth?.mode === "cloud-run-iam") {
    try {
      serviceIdentityToken = await config.apiServiceIdentityTokenProvider?.();
      if (!serviceIdentityToken) throw new Error("Missing identity token");
    } catch {
      response.writeHead(502, { "content-type": "application/problem+json" });
      response.end(
        JSON.stringify({
          type: "about:blank",
          title: "Samra API authentication unavailable",
          status: 502,
          detail:
            "The web service could not authenticate its request to the Samra API.",
        }),
      );
      return;
    }
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      body,
      headers: proxyRequestHeaders(request, serviceIdentityToken),
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
  response.setHeader("cache-control", "no-store");
  response.statusCode = upstream.status;
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

function cacheControlFor(filePath) {
  const basename = path.basename(filePath);
  if (basename === "index.html") return "no-store";
  return /-[A-Za-z0-9_-]{8,}\.[^.]+$/u.test(basename)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
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
  response.setHeader("cache-control", cacheControlFor(filePath));
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
    applySecurityHeaders(response, config.publicTransport);
    const url = new URL(request.url ?? "/", "http://samra.local");

    if (url.pathname === "/healthz") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, {
          allow: "GET, HEAD",
          "cache-control": "no-store",
          "content-type": "application/problem+json",
        });
        response.end(
          JSON.stringify({
            type: "about:blank",
            title: "Method not allowed",
            status: 405,
          }),
        );
        return;
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        request.method === "HEAD"
          ? undefined
          : JSON.stringify({ status: "ok" }),
      );
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
      await proxyApiRequest(request, response, config);
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
