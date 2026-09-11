import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertSharedTestOperatorEnvironment,
  parseSharedTestManifest,
} from "./shared-test-operator";

const manifest = {
  environment: "test",
  operation: "invite",
  operatorAlias: "operator_fixture",
  issuer: "https://test.samra.example/",
  admissionLimit: 5,
  subjects: ["auth0|fixture-a", "auth0|fixture-b"],
  expiresAt: "2026-09-10T12:00:00.000Z",
};
const environment = {
  SAMRA_DEPLOYMENT_ENVIRONMENT: "test",
  GOOGLE_CLOUD_PROJECT: "samra-pay-test",
  SAMRA_RELEASE_PROFILE: "synthetic-shared",
  SAMRA_PERSISTENCE_MODE: "postgres",
  SAMRA_CUSTOMER_AUTH_MODE: "auth0",
  SAMRA_PROVIDER_MODE: "fake",
  SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "fake",
  SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "fake",
  AUTH0_ISSUER_BASE_URL: manifest.issuer,
  SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL:
    "postgresql://operator:fixture@127.0.0.1/samra_test",
};

test("CLI failures never echo private manifest values or connection credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "samra-operator-redaction-"));
  const privateProbe = "PRIVATE_FIXTURE_MUST_NOT_APPEAR";
  try {
    const path = join(directory, "private-manifest.json");
    await writeFile(
      path,
      JSON.stringify({ ...manifest, subjects: [privateProbe] }),
      { mode: 0o600 },
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(
          new URL("./shared-test-operator-cli.ts", import.meta.url),
        ),
        path,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ...environment,
          SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL: `postgresql://operator:${privateProbe}@localhost/samra_test`,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Synthetic setup failed/);
    assert.equal(
      `${result.stdout}${result.stderr}`.includes(privateProbe),
      false,
    );
    assert.equal(result.stdout, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("operator manifests reject expanded rosters, invalid targets, ambiguous input and non-origin issuers", () => {
  assert.equal(parseSharedTestManifest(manifest).operation, "invite");
  for (const change of [
    { environment: "staging" },
    { environment: "production" },
    { admissionLimit: 25 },
    { subjects: ["auth0|a", "auth0|a"] },
    { subjects: ["auth0|a", "auth0|b", "auth0|c"] },
    { subjects: ["auth0|a"] },
    { issuer: "http://test.samra.example/" },
    { issuer: "https://test.samra.example/path" },
    { issuer: "https://user:password@test.samra.example/" },
    { issuer: "https://test.samra.example/?query=secret" },
    { operatorAlias: "person@example.com" },
    { undocumentedOption: true },
  ])
    assert.throws(() => parseSharedTestManifest({ ...manifest, ...change }));
});

test("operator requires matching synthetic settings and a dedicated environment-specific connection", () => {
  const parsed = parseSharedTestManifest(manifest);
  assert.equal(
    assertSharedTestOperatorEnvironment(parsed, environment),
    environment.SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL,
  );
  for (const key of Object.keys(environment)) {
    assert.throws(() =>
      assertSharedTestOperatorEnvironment(parsed, {
        ...environment,
        [key]: undefined,
      }),
    );
  }
  for (const change of [
    { GOOGLE_CLOUD_PROJECT: "samra-pay-staging" },
    { SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE: "persona-sandbox" },
    { SAMRA_CUSTOMER_WALLET_PROVIDER_MODE: "crossmint-sandbox" },
    { AUTH0_ISSUER_BASE_URL: "https://other.samra.example/" },
    {
      SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL:
        "postgresql://operator:fixture@localhost/samra_staging",
    },
    {
      SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL: undefined,
      DATABASE_URL: environment.SAMRA_SYNTHETIC_OPERATOR_DATABASE_URL,
    },
  ])
    assert.throws(() =>
      assertSharedTestOperatorEnvironment(parsed, {
        ...environment,
        ...change,
      }),
    );
});

test("synthetic funding accepts bounded minor units and rejects real provider inputs", () => {
  const funding = {
    environment: "test",
    operation: "fund-synthetic-account",
    operatorAlias: "operator_fixture",
    issuer: manifest.issuer,
    subject: "auth0|fixture",
    amountMinor: "50000",
  };
  assert.equal(
    parseSharedTestManifest(funding).operation,
    "fund-synthetic-account",
  );
  for (const amountMinor of ["0", "-1", "1.5", "100001", "0500", 50000])
    assert.throws(() => parseSharedTestManifest({ ...funding, amountMinor }));
  assert.throws(() =>
    parseSharedTestManifest({ ...funding, provider: "crossmint" }),
  );
});
