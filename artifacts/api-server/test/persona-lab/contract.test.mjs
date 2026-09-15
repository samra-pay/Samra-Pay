import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PERSONA_SCENARIO_IDS,
  buildPersonaReport,
  renderPersonaSummary,
  validateLocalDatabaseUrl,
  validatePersonaManifest,
} from "./contract.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./personas.json", import.meta.url), "utf8"),
);
const manifest = () => structuredClone(fixture);
const result = (id, status = "passed") => ({
  id,
  title: id.replaceAll("-", " "),
  persona: "both",
  status,
  observations: {
    consistent: true,
    postingCount: 4,
    balanceMinor: "50000",
    transferStatus: "completed",
  },
  ...(status === "passed" ? {} : { errorCode: "PERSONA_SCENARIO_FAILED" }),
});
const input = (results = PERSONA_SCENARIO_IDS.map((id) => result(id))) => ({
  manifest: manifest(),
  runId: "persona-20260914-example",
  sourceSha: "a".repeat(40),
  dirty: true,
  startedAt: "2026-09-14T12:00:00.000Z",
  finishedAt: "2026-09-14T12:00:05.250Z",
  results,
});

test("readable report renders synthetic USD without floating-point rounding", () => {
  const value = input();
  value.results[0].observations.balanceMinor = "-101";
  const markdown = renderPersonaSummary(buildPersonaReport(value));
  assert.match(markdown, /\$500\.00 USD opening synthetic balance/);
  assert.match(markdown, /\$1\.00 USD opening synthetic balance/);
  assert.match(markdown, /balanceMinor: -\$1\.01 USD \(-101 minor units\)/);
});

test("default manifest fixes two synthetic aliases and bounded minor-unit strings", () => {
  const validated = validatePersonaManifest(manifest());
  assert.deepEqual(validated, fixture);
  assert.equal(validated.personas[0].displayName, "Mekdes (synthetic)");
  assert.equal(validated.personas[1].displayName, "Dawit (synthetic)");
  assert.ok(Object.isFrozen(validated) && Object.isFrozen(validated.personas));
  for (const [sender, limited] of [
    ["10000", "1"],
    ["100000", "100"],
  ]) {
    const changed = manifest();
    changed.personas[0].openingBalanceMinor = sender;
    changed.personas[1].openingBalanceMinor = limited;
    assert.doesNotThrow(() => validatePersonaManifest(changed));
  }
});

test("manifest rejects unknown fields, PII, executable configuration and invalid money", () => {
  const mutations = [
    (value) => {
      value.schemaVersion = "1";
    },
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.personas = [];
    },
    (value) => {
      value.personas.push(value.personas[0]);
    },
    (value) => {
      delete value.personas[1];
    },
    (value) => {
      value.personas.command = "do something";
    },
    (value) => {
      value.personas[1].alias = "sender";
    },
    (value) => {
      value.personas[0].alias = "admin";
    },
    (value) => {
      value.personas[0].email = "private@example.invalid";
    },
    (value) => {
      value.personas[0].providerUrl = "https://provider.invalid";
    },
    (value) => {
      value.personas[0].command = "do something";
    },
    (value) => {
      value.personas[0].displayName = "private@example.invalid";
    },
    (value) => {
      value.personas[0].displayName = "Unsafe\nTitle";
    },
    (value) => {
      value.personas[0].displayName = "A".repeat(49);
    },
    (value) => {
      value.personas[0].displayName = "[Name](https://example.invalid)";
    },
    (value) => {
      value.personas[0].displayName = " Leading space";
    },
    ...[
      0,
      50000,
      "0",
      "-1",
      "01",
      "1.5",
      "1e4",
      "9999",
      "100001",
      "999999999999999999999",
    ].map((amount) => (value) => {
      value.personas[0].openingBalanceMinor = amount;
    }),
    (value) => {
      value.personas[1].openingBalanceMinor = "101";
    },
    (value) => {
      Object.defineProperty(value.personas[0], "displayName", {
        get() {
          throw new Error("private-secret");
        },
      });
    },
  ];
  for (const mutate of mutations) {
    const value = manifest();
    mutate(value);
    assert.throws(() => validatePersonaManifest(value), {
      message: "PERSONA_MANIFEST_INVALID",
    });
  }
  for (const value of [
    null,
    false,
    [],
    "manifest",
    Object.create({ schemaVersion: 1 }),
  ]) {
    assert.throws(() => validatePersonaManifest(value), {
      message: "PERSONA_MANIFEST_INVALID",
    });
  }
});

test("database URL accepts explicit loopback disposable PostgreSQL fixtures only", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    for (const scheme of ["postgres", "postgresql"]) {
      const value = `${scheme}://fixture:local-pass@${host}:5432/samra_test`;
      assert.equal(validateLocalDatabaseUrl(value), value);
    }
  }
  const escapedPassword =
    "postgresql://fixture:local%3Apass%23%40@localhost:65535/samra_test";
  assert.equal(validateLocalDatabaseUrl(escapedPassword), escapedPassword);
});

test("database rejection is strict and never includes URL or credential input", () => {
  const values = [
    undefined,
    null,
    false,
    "",
    "not-a-url",
    "https://fixture:private-password@localhost:5432/samra_test",
    "postgresql://fixture:private-password@database.example.invalid:5432/samra_test",
    "postgresql://fixture:private-password@10.61.0.3:5432/samra_test",
    "postgresql://fixture:private-password@127.1:5432/samra_test",
    "postgresql://fixture:private-password@2130706433:5432/samra_test",
    "postgresql://fixture:private-password@0x7f000001:5432/samra_test",
    "postgresql://fixture:private-password@127.0.0.2:5432/samra_test",
    "postgresql://fixture:private-password@localhost/samra_test",
    "postgresql://fixture:private-password@localhost:0/samra_test",
    "postgresql://fixture:private-password@localhost:65536/samra_test",
    "postgresql://fixture:private-password@localhost:5432/samra_dev",
    "postgresql://fixture:private-password@localhost:5432/samra_test?host=remote.invalid",
    "postgresql://fixture:private-password@localhost:5432/samra_test?sslmode=require",
    "postgresql://fixture:private-password@localhost:5432/samra_test#secret",
    "postgresql://fixture:private-password@localhost:5432/samra_test/",
    "postgresql://fixture:private-password@localhost:5432/%73amra_test",
    "postgresql://fixture:private-password@local%68ost:5432/samra_test",
    "postgresql://fixture:private-password@localhost.evil.invalid:5432/samra_test",
    "postgresql://fixture:private-password@[::ffff:127.0.0.1]:5432/samra_test",
    "postgresql://fixture:private-password@localhost.:5432/samra_test",
    "postgresql://fixture:private-password@LOCALHOST:5432/samra_test",
    "postgresql://fixture:private-password@localhost:05432/samra_test",
    "postgresql://fixture@localhost:5432/samra_test",
    "postgresql://:private-password@localhost:5432/samra_test",
    "postgresql://fixture:local%00pass@localhost:5432/samra_test",
    "postgresql://fixture:local%ZZpass@localhost:5432/samra_test",
    "postgresql://fixture:private-password@localhost:5432/samra_test\n",
  ];
  for (const value of values) {
    assert.throws(() => validateLocalDatabaseUrl(value), {
      message: "PERSONA_DATABASE_REJECTED",
    });
  }
});

test("all required scenarios and cleanup must pass before the report passes", () => {
  assert.equal(PERSONA_SCENARIO_IDS.length, 14);
  assert.equal(new Set(PERSONA_SCENARIO_IDS).size, 14);
  const complete = buildPersonaReport(input());
  assert.equal(complete.status, "passed");
  assert.deepEqual(complete.summary, {
    total: 14,
    passed: 14,
    failed: 0,
    blocked: 0,
  });
  for (const id of PERSONA_SCENARIO_IDS) {
    const report = buildPersonaReport(
      input(input().results.filter((item) => item.id !== id)),
    );
    assert.equal(report.status, "blocked");
    assert.equal(
      report.results.find((item) => item.id === id).errorCode,
      "PERSONA_SCENARIO_NOT_RUN",
    );
    assert.equal(report.summary.blocked, 1);
  }
  assert.equal(buildPersonaReport(input([])).status, "blocked");
  const mixed = input();
  mixed.results[0] = result("environment", "blocked");
  mixed.results[1] = result("admission", "failed");
  assert.equal(buildPersonaReport(mixed).status, "failed");
});

test("report rejects missing status, duplicate or unknown cases and invalid source metadata", () => {
  const mutations = [
    (value) => {
      delete value.results[0].status;
    },
    (value) => {
      value.results[0].status = "skipped";
    },
    (value) => {
      value.results[0].persona = "admin";
    },
    (value) => {
      value.results[0].extra = true;
    },
    (value) => {
      value.results.push(value.results[0]);
    },
    (value) => {
      delete value.results[0];
    },
    (value) => {
      value.results.command = "do something";
    },
    (value) => {
      value.results[0].id = "unknown-case";
    },
    (value) => {
      value.results[0].errorCode = "PERSONA_SCENARIO_FAILED";
    },
    (value) => {
      value.results[0].observations.count = NaN;
    },
    (value) => {
      value.results[0].observations.count = Number.MAX_SAFE_INTEGER + 1;
    },
    (value) => {
      value.results[0].observations.count = 1.2;
    },
    (value) => {
      value.results[0].observations.payload = {};
    },
    (value) => {
      value.sourceSha = "main";
    },
    (value) => {
      value.dirty = "false";
    },
    (value) => {
      value.startedAt = "2026-09-15T12:00:00Z";
    },
    (value) => {
      value.startedAt = "2026-02-30T12:00:00Z";
    },
    (value) => {
      value.startedAt = "2026-09-14T12:00:00";
    },
    (value) => {
      value.startedAt = "not-a-date";
    },
    (value) => {
      value.status = "passed";
    },
  ];
  for (const mutate of mutations) {
    const value = input();
    mutate(value);
    assert.throws(() => buildPersonaReport(value), {
      message: "PERSONA_REPORT_INVALID",
    });
  }
});

test("unsafe evidence is rejected without leaking secrets into reports or errors", () => {
  const privateValue =
    "postgresql://fixture:private-password@remote.invalid:5432/production";
  const mutations = [
    (value) => {
      value.databaseUrl = privateValue;
    },
    (value) => {
      value.runId = privateValue;
    },
    (value) => {
      value.results[0].title = privateValue;
    },
    (value) => {
      value.results[0].observations.detail = privateValue;
    },
    (value) => {
      value.results[0].observations.email = "private@example.invalid";
    },
    (value) => {
      value.results[0].observations.accessToken = "opaque";
    },
    (value) => {
      value.results[0].observations.detail =
        "eyJhbGciOiJub25lIn0.payload.signature";
    },
    (value) => {
      value.results[0].observations.raw = "Unexpected internal customer record";
    },
    (value) => {
      value.results[0].status = "failed";
      value.results[0].errorCode = privateValue;
    },
    (value) => {
      Object.defineProperty(value, "results", {
        get() {
          throw new Error(privateValue);
        },
      });
    },
  ];
  for (const mutate of mutations) {
    const value = input();
    mutate(value);
    assert.throws(
      () => buildPersonaReport(value),
      (error) => {
        assert.equal(error.message, "PERSONA_REPORT_INVALID");
        assert.ok(!String(error).includes("private-password"));
        assert.ok(!String(error).includes("remote.invalid"));
        return true;
      },
    );
  }
});

test("Markdown states synthetic scope and revalidates result and metadata claims", () => {
  const value = input();
  value.results[0].title = "Simulated consent, identity and durable wallet";
  const report = buildPersonaReport(value);
  const rendered = renderPersonaSummary(report);
  assert.match(rendered, /Authentication is simulated/);
  assert.match(rendered, /Human acceptance: false/);
  assert.match(rendered, /Providers are fake/);
  assert.match(rendered, /synthetic funds/);
  assert.match(rendered, /no on-chain activity/);
  assert.match(rendered, /does not certify cloud readiness/);
  assert.match(rendered, /Mekdes \(synthetic\)/);
  assert.match(rendered, /cleanup \(both\): passed/);
  const mutations = [
    (value) => {
      value.scope.humanAcceptance = true;
    },
    (value) => {
      value.scope.authentication = "auth0";
    },
    (value) => {
      value.scope.realFinancialActivity = true;
    },
    (value) => {
      value.status = "failed";
    },
    (value) => {
      value.summary.passed = 999;
    },
    (value) => {
      value.results[0].observations.url = "https://private.invalid";
    },
    (value) => {
      value.extra = "private-password";
    },
    (value) => {
      delete value.scope;
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(report);
    mutate(changed);
    assert.throws(() => renderPersonaSummary(changed), {
      message: "PERSONA_REPORT_INVALID",
    });
  }
});
