import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createStaticServer,
  loadPublicRuntimeConfig,
  loadServerConfig,
  resolvePublicFile,
  serializePublicRuntimeConfig,
} from "./static-server.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("accepts the Cloud Run port and an HTTPS API origin", () => {
  const config = loadServerConfig({
    PORT: "8080",
    SAMRA_API_ORIGIN: "https://api.example.test",
    SAMRA_PUBLIC_DIRECTORY: "/srv/public",
  });

  assert.equal(config.port, 8080);
  assert.equal(config.apiOrigin.href, "https://api.example.test/");
  assert.equal(config.publicDirectory, "/srv/public");
  assert.deepEqual(config.publicRuntimeConfig, {});

  const loopback = loadServerConfig({
    PORT: "8080",
    SAMRA_API_ORIGIN: "http://127.0.0.1:18080",
  });
  assert.equal(loopback.apiOrigin.href, "http://127.0.0.1:18080/");
});

test("exports only validated public Auth0 runtime identifiers", () => {
  assert.deepEqual(
    loadPublicRuntimeConfig({
      SAMRA_PUBLIC_DATA_MODE: "api",
      SAMRA_PUBLIC_AUTH0_DOMAIN: "login.staging.samrapay.com",
      SAMRA_PUBLIC_AUTH0_CLIENT_ID: "public_client_123",
      SAMRA_PUBLIC_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
      AUTH0_CLIENT_SECRET: "must-never-be-exported",
      PERSONA_API_KEY: "must-never-be-exported",
    }),
    {
      VITE_SAMRA_DATA_MODE: "api",
      VITE_AUTH0_DOMAIN: "login.staging.samrapay.com",
      VITE_AUTH0_CLIENT_ID: "public_client_123",
      VITE_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
    },
  );

  assert.throws(
    () =>
      loadPublicRuntimeConfig({
        SAMRA_PUBLIC_DATA_MODE: "api",
        SAMRA_PUBLIC_AUTH0_DOMAIN: "login.staging.samrapay.com",
      }),
    /Every public Auth0 identifier/,
  );
  assert.throws(
    () =>
      loadPublicRuntimeConfig({
        SAMRA_PUBLIC_AUTH0_DOMAIN: "https://tenant.auth0.com",
        SAMRA_PUBLIC_AUTH0_CLIENT_ID: "public_client_123",
        SAMRA_PUBLIC_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
      }),
    /hostname only/,
  );
  assert.doesNotMatch(
    serializePublicRuntimeConfig(
      loadPublicRuntimeConfig({
        SAMRA_PUBLIC_DATA_MODE: "api",
      }),
    ),
    /SECRET|PERSONA|CROSSMINT/,
  );
});

test("fails closed for invalid ports and API protocols", () => {
  assert.throws(() => loadServerConfig({ PORT: "0" }), /PORT/);
  assert.throws(
    () =>
      loadServerConfig({ PORT: "8080", SAMRA_API_ORIGIN: "file:///tmp/api" }),
    /http or https/,
  );
  assert.throws(
    () =>
      loadServerConfig({
        PORT: "8080",
        SAMRA_API_ORIGIN: "http://api.example.test",
      }),
    /must use https unless it targets loopback/,
  );
});

test("prevents decoded path traversal outside the public directory", () => {
  const root = path.resolve("/srv/public");
  assert.equal(
    resolvePublicFile(root, "/assets/app.js"),
    path.join(root, "assets/app.js"),
  );
  assert.equal(resolvePublicFile(root, "/%2e%2e/secret"), null);
  assert.equal(resolvePublicFile(root, "/%E0%A4%A"), null);
});

test("serves SPA routes and proxies API responses without mock fallback", async () => {
  const publicDirectory = await mkdtemp(path.join(tmpdir(), "samra-web-"));
  await writeFile(
    path.join(publicDirectory, "index.html"),
    "<h1>Samra UI</h1>",
  );

  const upstream = createServer((request, response) => {
    assert.equal(request.url, "/api/healthz?source=manual");
    response.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": "samra_session=synthetic; Path=/; HttpOnly",
    });
    response.end(JSON.stringify({ status: "ok" }));
  });
  const upstreamOrigin = await listen(upstream);
  const web = createStaticServer({
    apiOrigin: new URL(upstreamOrigin),
    port: 0,
    publicRuntimeConfig: Object.freeze({
      VITE_SAMRA_DATA_MODE: "api",
      VITE_AUTH0_DOMAIN: "login.staging.samrapay.com",
      VITE_AUTH0_CLIENT_ID: "public_client_123",
      VITE_AUTH0_AUDIENCE: "https://api.staging.samrapay.com",
    }),
    publicDirectory,
  });
  const webOrigin = await listen(web);

  try {
    const spaResponse = await fetch(`${webOrigin}/dashboard/transfers`);
    assert.equal(spaResponse.status, 200);
    assert.match(await spaResponse.text(), /Samra UI/);

    const runtimeConfigResponse = await fetch(
      `${webOrigin}/samra-runtime-config.js`,
    );
    assert.equal(runtimeConfigResponse.status, 200);
    assert.equal(
      runtimeConfigResponse.headers.get("cache-control"),
      "no-store",
    );
    const runtimeConfig = await runtimeConfigResponse.text();
    assert.match(runtimeConfig, /login\.staging\.samrapay\.com/);
    assert.doesNotMatch(runtimeConfig, /SECRET|PERSONA|CROSSMINT/);

    const apiResponse = await fetch(`${webOrigin}/api/healthz?source=manual`);
    assert.equal(apiResponse.status, 200);
    assert.deepEqual(await apiResponse.json(), { status: "ok" });
    assert.deepEqual(apiResponse.headers.getSetCookie(), [
      "samra_session=synthetic; Path=/; HttpOnly",
    ]);
  } finally {
    await close(web);
    await close(upstream);
    await rm(publicDirectory, { recursive: true, force: true });
  }
});

test("returns an explicit 502 when no API target is configured", async () => {
  const publicDirectory = await mkdtemp(path.join(tmpdir(), "samra-web-"));
  const web = createStaticServer({
    apiOrigin: null,
    port: 0,
    publicRuntimeConfig: Object.freeze({}),
    publicDirectory,
  });
  const webOrigin = await listen(web);

  try {
    const response = await fetch(`${webOrigin}/api/v1/transfers`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      type: "about:blank",
      title: "Samra API unavailable",
      status: 502,
      detail: "SAMRA_API_ORIGIN is not configured for this web service.",
    });
  } finally {
    await close(web);
    await rm(publicDirectory, { recursive: true, force: true });
  }
});
