import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockerfile = await readFile("deploy/gcp/Dockerfile.customer-web", "utf8");
const server = await readFile("deploy/gcp/static-server.mjs", "utf8");
const index = await readFile("artifacts/samra-pay/index.html", "utf8");

test("customer-web image receives public Auth0 identifiers at runtime", () => {
  for (const name of [
    "SAMRA_PUBLIC_AUTH0_DOMAIN",
    "SAMRA_PUBLIC_AUTH0_CLIENT_ID",
    "SAMRA_PUBLIC_AUTH0_AUDIENCE",
    "SAMRA_PUBLIC_ENVIRONMENT",
  ]) {
    assert.ok(server.includes(name), name);
  }
  assert.match(index, /src="\/samra-runtime-config\.js"/);
  assert.doesNotMatch(dockerfile, /ARG VITE_AUTH0|ENV VITE_AUTH0/);

  assert.doesNotMatch(
    `${dockerfile}\n${server}\n${index}`,
    /AUTH0_(?:CLIENT_SECRET|MANAGEMENT|ACCESS_TOKEN|REFRESH_TOKEN)|secret versions access|postgres(?:ql)?:\/\//i,
  );
  assert.doesNotMatch(index, /replit\.app|worf\.replit/i);
});
