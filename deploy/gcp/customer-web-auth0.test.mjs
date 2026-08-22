import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockerfile = await readFile("deploy/gcp/Dockerfile.customer-web", "utf8");

test("customer-web image exposes only public Auth0 build identifiers", () => {
  for (const name of [
    "VITE_AUTH0_DOMAIN",
    "VITE_AUTH0_CLIENT_ID",
    "VITE_AUTH0_AUDIENCE",
  ]) {
    assert.ok(dockerfile.includes(`ARG ${name}=\"\"`), name);
    assert.ok(dockerfile.includes(`ENV ${name}=$${name}`), name);
  }

  assert.doesNotMatch(
    dockerfile,
    /AUTH0_(?:CLIENT_SECRET|MANAGEMENT|ACCESS_TOKEN|REFRESH_TOKEN)|secret versions access|postgres(?:ql)?:\/\//i,
  );
});
