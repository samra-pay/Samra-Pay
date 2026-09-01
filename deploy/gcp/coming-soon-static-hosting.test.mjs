import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonStaticHosting,
  readFirebaseHostingConfig,
  validateComingSoonStaticHosting,
  validateStaticHostingEnvironment,
} from "./validate-coming-soon-static-hosting.mjs";

const validEnvironment = {
  SAMRA_GCP_PROJECT_ID: "samra-pay-production",
  SAMRA_GCP_PROJECT_NUMBER: "382465561715",
  SAMRA_GCP_ORGANIZATION_ID: "614833350075",
  SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
  SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
};

test("locks the approved static informational launch boundary", () => {
  assert.deepEqual(validateComingSoonStaticHosting(), {
    schemaVersion: 1,
    status: "validated-approved-not-applied",
    phase: "coming-soon-static-informational-launch",
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    siteId: "samra-pay-production",
    defaultUrl: "https://samra-pay-production.web.app",
    canonicalDomain: "www.samrapay.com",
    informationalOnly: true,
    emailCollectionAllowed: false,
    publicApiRouteCount: 0,
    databaseAccess: false,
    expectedIncrementalMonthlyCostUsd: 0,
    existingInfrastructureGuardedEstimateUsd: 81.92,
    monthlyInfrastructureHardStopUsd: 100,
    applyAuthorized: false,
    standingDnsAuthorization: false,
  });
});

test("rejects data collection, product activation, cost, and DNS drift", () => {
  for (const mutate of [
    (value) => (value.status = "applied"),
    (value) => (value.productionBoundary.projectId = "samra-pay-staging"),
    (value) => (value.productionBoundary.monthlyInfrastructureHardStopUsd = 101),
    (value) => (value.hosting.provider = "cloud-run"),
    (value) => (value.hosting.projectAliasFileAllowed = true),
    (value) => (value.publicBoundary.formsAllowed = true),
    (value) => (value.publicBoundary.emailCollectionAllowed = true),
    (value) => value.publicBoundary.apiRoutes.push("POST /waitlist"),
    (value) => (value.publicBoundary.databaseAccess = true),
    (value) => (value.publicBoundary.analytics = true),
    (value) => (value.publicBoundary.customerAuthentication = true),
    (value) => (value.publicBoundary.kyc = true),
    (value) => (value.publicBoundary.vendorActivation = true),
    (value) => (value.providerManagedEffects.firestoreDatabaseAllowed = true),
    (value) => (value.cost.expectedIncrementalMonthlyCostUsd = 1),
    (value) => (value.cost.spendingCap = true),
    (value) => (value.domain.dnsOwner = "Google Cloud DNS"),
    (value) => (value.domain.preserveUnrelatedRecords = false),
    (value) => (value.decision.standingApplyAuthorization = true),
  ]) {
    const contract = structuredClone(readComingSoonStaticHosting());
    mutate(contract);
    assert.throws(() => validateComingSoonStaticHosting(contract));
  }
});

test("enforces the exact production identity, SHA, and apply sentinel", () => {
  assert.deepEqual(validateStaticHostingEnvironment(validEnvironment), {
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    organizationId: "614833350075",
    operator: "me@davidhaile.com",
    expectedSha: "a".repeat(40),
  });
  assert.throws(() =>
    validateStaticHostingEnvironment({
      ...validEnvironment,
      SAMRA_GCP_PROJECT_ID: "samra-pay-staging",
    }),
  );
  assert.throws(() =>
    validateStaticHostingEnvironment(validEnvironment, {
      requireApplyAuthorization: true,
    }),
  );
  assert.doesNotThrow(() =>
    validateStaticHostingEnvironment(
      {
        ...validEnvironment,
        SAMRA_GCP_STATIC_HOSTING_APPLY:
          "AUTHORIZED_COMING_SOON_STATIC_HOSTING",
      },
      { requireApplyAuthorization: true },
    ),
  );
});

test("serves one SPA with security headers and no project alias", () => {
  const firebase = readFirebaseHostingConfig();
  assert.equal(firebase.hosting.public, "artifacts/samra-pay/dist/public");
  assert.deepEqual(firebase.hosting.rewrites, [
    { source: "**", destination: "/index.html" },
  ]);
  const headers = new Map(
    firebase.hosting.headers
      .flatMap((rule) => rule.headers)
      .map((header) => [header.key, header.value]),
  );
  assert.match(headers.get("Content-Security-Policy"), /connect-src 'none'/u);
  assert.match(headers.get("Content-Security-Policy"), /form-action 'none'/u);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Strict-Transport-Security"), "max-age=31536000");
});

test("keeps the public source informational and free of signup controls", async () => {
  const sourceFiles = await Promise.all(
    [
      "../../artifacts/samra-pay/src/pages/home.tsx",
      "../../artifacts/samra-pay/src/pages/faq.tsx",
      "../../artifacts/samra-pay/src/pages/blog.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const source = sourceFiles.join("\n");
  assert.doesNotMatch(source, /<form\b|type=["']email["']/iu);
  assert.doesNotMatch(source, /\/api\/v1\/waitlist\/subscriptions/iu);
  assert.doesNotMatch(source, /Preview Alpha signup/iu);
  assert.match(source, /informational only/iu);
});

test("generates platform-specific image derivatives outside release source", async () => {
  const [ignore, packageJson, optimizer] = await Promise.all([
    readFile(new URL("../../.gitignore", import.meta.url), "utf8"),
    readFile(
      new URL("../../artifacts/samra-pay/package.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL(
        "../../artifacts/samra-pay/scripts/optimize-public-images.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    ignore,
    /artifacts\/samra-pay\/src\/assets\/coming-soon\/generated\//u,
  );
  for (const script of [
    "dev",
    "dev:legacy",
    "build",
    "build:legacy",
    "typecheck",
    "test",
  ]) {
    assert.match(packageJson.scripts[script], /prepare:public-images/u);
  }
  assert.match(optimizer, /generatedCacheIsCurrent/u);
  assert.match(optimizer, /sharp: sharp\.versions/u);
});

test("keeps planning local and rejects unrecognized modes", async () => {
  const script = "deploy/gcp/activate-coming-soon-static-hosting.sh";
  const output = execFileSync("bash", [script, "--plan"], {
    encoding: "utf8",
  });
  assert.match(output, /STATIC INFORMATIONAL HOSTING PLAN PASS/);
  assert.match(output, /Plan cost: USD 0 per month/);
  assert.match(output, /Cloud or DNS state read: no/);
  assert.match(output, /AUTHORIZED_COMING_SOON_STATIC_HOSTING/);
  assert.match(
    output,
    /PLAN COMPLETE — NO CLOUD, DNS, DATA, API, OR VENDOR CHANGES/,
  );

  const rejected = spawnSync("bash", [script, "--destroy"], {
    encoding: "utf8",
  });
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /Usage:/u);
  execFileSync("bash", ["-n", script]);

  const source = await readFile(script, "utf8");
  assert.match(source, /firebase deploy --only hosting/u);
  assert.match(source, /public build changed tracked release source/u);
  assert.doesNotMatch(
    source,
    /run deploy|sql users create|sql databases create|secrets versions add|firestore databases create|database:instances:create|auth:import/iu,
  );
});
