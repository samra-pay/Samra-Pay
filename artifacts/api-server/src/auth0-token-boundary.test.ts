import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { createAuth0AccessTokenMiddleware } from "./lib/customer-access-token";

// Real middleware and RSA signatures; discovery/JWKS are loopback-only.
// This proves the token boundary, not an Auth0 tenant login or configuration.
const keys = ["current", "next", "unknown"].map((kid) => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    ...pair,
    kid,
    jwk: {
      ...pair.publicKey.export({ format: "jwk" }),
      kid,
      alg: "RS256",
      use: "sig",
    },
  };
});
const audience = "https://api.example.test";

async function fixture(
  run: (context: {
    origin: string;
    token: (claims?: Record<string, unknown>, keyIndex?: number) => string;
    outage: () => void;
  }) => Promise<void>,
) {
  const app = express();
  let unavailable = false;
  let origin = "";
  app.get("/.well-known/openid-configuration", (_req, res) => {
    if (unavailable) {
      res.sendStatus(503);
      return;
    }
    res.json({
      issuer: origin,
      jwks_uri: `${origin}/jwks`,
      id_token_signing_alg_values_supported: ["RS256"],
    });
  });
  app.get("/jwks", (_req, res) => {
    if (unavailable) {
      res.sendStatus(503);
      return;
    }
    res.json({ keys: keys.slice(0, 2).map(({ jwk }) => jwk) });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  app.get(
    "/protected",
    createAuth0AccessTokenMiddleware({
      mode: "auth0",
      issuerBaseUrl: origin,
      audience,
      tokenSigningAlgorithm: "RS256",
    }),
    (req, res) => res.json({ subject: req.auth?.payload.sub }),
  );
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(401).json({ code: "TOKEN_REJECTED" });
    },
  );
  const token = (claims: Record<string, unknown> = {}, keyIndex = 0) => {
    const key = keys[keyIndex]!;
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const payload = `${encode({ alg: "RS256", typ: "JWT", kid: key.kid })}.${encode({ iss: origin, aud: audience, sub: "auth0|synthetic", iat: now, exp: now + 300, ...claims })}`;
    return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), key.privateKey).toString("base64url")}`;
  };
  try {
    await run({
      origin,
      token,
      outage: () => {
        unavailable = true;
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("Auth0 token boundary accepts valid RSA tokens from current and prepublished rotation keys", async () => {
  await fixture(async ({ origin, token }) => {
    for (const keyIndex of [0, 1]) {
      const result = await fetch(`${origin}/protected`, {
        headers: { authorization: `Bearer ${token({}, keyIndex)}` },
      });
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { subject: "auth0|synthetic" });
    }
  });
});

for (const [label, claims] of Object.entries({
  "wrong issuer": { iss: "https://untrusted.example.test" },
  "wrong audience": { aud: "https://other-api.example.test" },
  "expired token": { exp: 1 },
  "future not-before": { nbf: 4102444800 },
  "missing subject": { sub: undefined },
  "empty subject": { sub: "" },
  "oversized subject": { sub: "a".repeat(256) },
})) {
  test(`Auth0 token boundary rejects ${label}`, async () => {
    await fixture(async ({ origin, token }) => {
      const result = await fetch(`${origin}/protected`, {
        headers: { authorization: `Bearer ${token(claims)}` },
      });
      assert.equal(result.status, 401);
    });
  });
}

test("Auth0 token boundary rejects missing, malformed, unsigned, forged, and unknown-key tokens", async () => {
  await fixture(async ({ origin, token }) => {
    const valid = token();
    const [header, payload] = valid.split(".");
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${payload}.`;
    for (const bearer of [
      undefined,
      "not-a-jwt",
      unsigned,
      `${header}.${payload}.${Buffer.alloc(256).toString("base64url")}`,
      token({}, 2),
    ]) {
      const result = await fetch(`${origin}/protected`, {
        headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      });
      assert.equal(result.status, 401);
    }
  });
});

test("Auth0 token boundary fails closed when discovery is unavailable without cached trust", async () => {
  await fixture(async ({ origin, token, outage }) => {
    outage();
    const result = await fetch(`${origin}/protected`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    assert.equal(result.status, 401);
  });
});
