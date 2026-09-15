const SCOPE = Object.freeze({
  environment: "local-disposable-postgres",
  authentication: "simulated",
  humanAcceptance: false,
  providers: "fake",
  realFinancialActivity: false,
  wallet: "synthetic-no-onchain",
});
const STATUSES = new Set(["passed", "failed", "blocked"]);
export const PERSONA_SCENARIO_IDS = Object.freeze([
  "environment",
  "admission",
  "onboarding-sender",
  "onboarding-limited",
  "funding",
  "beneficiaries",
  "transfer-success",
  "duplicate-retry",
  "insufficient-funds",
  "account-isolation",
  "payout-refund",
  "restart-persistence",
  "ledger-integrity",
  "cleanup",
]);
const OBSERVATION_LABELS = new Set([
  "active",
  "approved",
  "blocked",
  "cancelled",
  "completed",
  "created",
  "declined",
  "denied",
  "failed",
  "fake",
  "inactive",
  "insufficient-funds",
  "not-started",
  "passed",
  "pending",
  "provisioned",
  "ready",
  "refunded",
  "rejected",
  "reversed",
  "settled",
  "simulated",
  "stopped",
  "synthetic",
  "unavailable",
  "unfunded",
  "verified",
]);
const SENSITIVE =
  /password|secret|token|credential|authorization|cookie|email|subject|private.?key|connection.?string|database.?url|https?:|postgres(?:ql)?:|@/i;

function requireValue(condition) {
  if (!condition) throw new TypeError("Invalid contract value");
}

function dataRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (entry) => "value" in entry,
    )
  );
}

function dataArray(value) {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every(
      (key) =>
        key === "length" ||
        (typeof key === "string" &&
          /^(?:0|[1-9][0-9]*)$/.test(key) &&
          Number(key) < value.length &&
          "value" in Object.getOwnPropertyDescriptor(value, key)),
    )
  );
}

function exactKeys(value, required, optional = []) {
  requireValue(dataRecord(value));
  const keys = Reflect.ownKeys(value);
  requireValue(required.every((key) => Object.hasOwn(value, key)));
  requireValue(
    keys.every((key) => required.includes(key) || optional.includes(key)),
  );
}

function guarded(code, operation) {
  try {
    return operation();
  } catch {
    // Inputs can contain database credentials or raw failures. Never echo them.
    throw new TypeError(code);
  }
}

/** @returns {import('./contract.ts').PersonaManifest} */
export function validatePersonaManifest(value) {
  return guarded("PERSONA_MANIFEST_INVALID", () => {
    exactKeys(value, ["schemaVersion", "personas"]);
    requireValue(value.schemaVersion === 1);
    requireValue(dataArray(value.personas) && value.personas.length === 2);
    const aliases = new Set();
    const personas = value.personas.map((persona) => {
      exactKeys(persona, ["alias", "displayName", "openingBalanceMinor"]);
      requireValue(
        ["sender", "limited"].includes(persona.alias) &&
          !aliases.has(persona.alias),
      );
      aliases.add(persona.alias);
      requireValue(
        typeof persona.displayName === "string" &&
          persona.displayName.length <= 48 &&
          /^[\p{L}][\p{L} ()-]*$/u.test(persona.displayName) &&
          persona.displayName === persona.displayName.trim() &&
          !SENSITIVE.test(persona.displayName),
      );
      requireValue(
        typeof persona.openingBalanceMinor === "string" &&
          /^[1-9][0-9]{0,5}$/.test(persona.openingBalanceMinor),
      );
      const amount = BigInt(persona.openingBalanceMinor);
      requireValue(
        persona.alias === "sender"
          ? amount >= 10000n && amount <= 100000n
          : amount >= 1n && amount <= 100n,
      );
      return Object.freeze({
        alias: persona.alias,
        displayName: persona.displayName,
        openingBalanceMinor: persona.openingBalanceMinor,
      });
    });
    requireValue(aliases.size === 2);
    return Object.freeze({
      schemaVersion: 1,
      personas: Object.freeze(personas),
    });
  });
}

/** Validate only a disposable loopback fixture, without exposing its credentials. */
export function validateLocalDatabaseUrl(value) {
  return guarded("PERSONA_DATABASE_REJECTED", () => {
    requireValue(
      typeof value === "string" &&
        value.length <= 1024 &&
        !/[\s\\\u0000-\u001f\u007f]/u.test(value),
    );
    // Match the authority explicitly: URL normalization must not admit alternate
    // numeric addresses, missing ports, encoded hosts, or socket query options.
    requireValue(
      /^postgres(?:ql)?:\/\/[^/?#@]+@(?:127\.0\.0\.1|localhost|\[::1\]):[1-9][0-9]{0,4}\/samra_test$/.test(
        value,
      ),
    );
    const parsed = new URL(value);
    requireValue(["postgres:", "postgresql:"].includes(parsed.protocol));
    requireValue(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
    requireValue(Number(parsed.port) >= 1 && Number(parsed.port) <= 65535);
    requireValue(
      parsed.pathname === "/samra_test" && !parsed.search && !parsed.hash,
    );
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    requireValue(/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(username));
    requireValue(
      password.length >= 1 &&
        password.length <= 128 &&
        /^[\x21-\x7e]+$/.test(password),
    );
    return value;
  });
}

function timestamp(value) {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value),
  );
  const milliseconds = Date.parse(value);
  requireValue(Number.isFinite(milliseconds));
  // Date.parse normalizes impossible dates, such as February 30.
  requireValue(
    new Date(milliseconds).toISOString().replace(/\.000Z$/, "Z") ===
      value
        .replace(/(?:\.0{1,3})?Z$/, "Z")
        .replace(/\.(\d{1,2})Z$/, (_, digits) => `.${digits.padEnd(3, "0")}Z`),
  );
  return milliseconds;
}

function scenario(value) {
  exactKeys(
    value,
    ["id", "title", "persona", "status", "observations"],
    ["errorCode"],
  );
  requireValue(
    typeof value.id === "string" &&
      /^[a-z][a-z0-9-]{0,63}$/.test(value.id) &&
      PERSONA_SCENARIO_IDS.includes(value.id),
  );
  requireValue(
    typeof value.title === "string" &&
      /^[\p{L}\p{N}][\p{L}\p{N} (),/-]{0,119}$/u.test(value.title) &&
      !SENSITIVE.test(value.title),
  );
  requireValue(
    ["sender", "limited", "both"].includes(value.persona) &&
      STATUSES.has(value.status),
  );
  requireValue(
    dataRecord(value.observations) &&
      Reflect.ownKeys(value.observations).length <= 32,
  );
  const observations = {};
  for (const key of Reflect.ownKeys(value.observations)) {
    requireValue(
      typeof key === "string" &&
        /^[a-zA-Z][a-zA-Z0-9]{0,47}$/.test(key) &&
        !["constructor", "prototype", "__proto__"].includes(key) &&
        !SENSITIVE.test(key),
    );
    const observation = value.observations[key];
    requireValue(
      typeof observation === "boolean" ||
        (typeof observation === "number" &&
          Number.isSafeInteger(observation)) ||
        (typeof observation === "string" &&
          (/^-?(?:0|[1-9][0-9]{0,23})$/.test(observation) ||
            OBSERVATION_LABELS.has(observation))),
    );
    observations[key] = observation;
  }
  if (Object.hasOwn(value, "errorCode")) {
    requireValue(
      typeof value.errorCode === "string" &&
        /^PERSONA_[A-Z_]{1,55}$/.test(value.errorCode) &&
        !SENSITIVE.test(value.errorCode),
    );
    requireValue(value.status !== "passed");
  }
  return {
    id: value.id,
    title: value.title,
    persona: value.persona,
    status: value.status,
    observations,
    ...(Object.hasOwn(value, "errorCode")
      ? { errorCode: value.errorCode }
      : {}),
  };
}

/** @param {import('./contract.ts').PersonaReportInput} input
 * @returns {import('./contract.ts').PersonaReport} */
export function buildPersonaReport(input) {
  return guarded("PERSONA_REPORT_INVALID", () => {
    exactKeys(input, [
      "manifest",
      "runId",
      "sourceSha",
      "dirty",
      "startedAt",
      "finishedAt",
      "results",
    ]);
    const manifest = validatePersonaManifest(input.manifest);
    requireValue(
      typeof input.runId === "string" &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(input.runId) &&
        !SENSITIVE.test(input.runId),
    );
    requireValue(
      typeof input.sourceSha === "string" &&
        /^[a-f0-9]{40}$/.test(input.sourceSha),
    );
    requireValue(typeof input.dirty === "boolean");
    requireValue(timestamp(input.finishedAt) >= timestamp(input.startedAt));
    requireValue(
      dataArray(input.results) &&
        input.results.length <= PERSONA_SCENARIO_IDS.length,
    );
    const provided = input.results.map(scenario);
    requireValue(
      new Set(provided.map((result) => result.id)).size === provided.length,
    );
    const byId = new Map(provided.map((result) => [result.id, result]));
    const results = PERSONA_SCENARIO_IDS.map(
      (id) =>
        byId.get(id) ?? {
          id,
          title: id.replaceAll("-", " "),
          persona:
            id === "onboarding-sender"
              ? "sender"
              : id === "onboarding-limited"
                ? "limited"
                : "both",
          status: "blocked",
          observations: {},
          errorCode: "PERSONA_SCENARIO_NOT_RUN",
        },
    );
    const summary = { total: results.length, passed: 0, failed: 0, blocked: 0 };
    for (const result of results) summary[result.status] += 1;
    const status =
      summary.failed > 0
        ? "failed"
        : summary.blocked > 0 || summary.total === 0
          ? "blocked"
          : "passed";
    return {
      schemaVersion: 1,
      kind: "local-synthetic-persona-lab",
      runId: input.runId,
      sourceSha: input.sourceSha,
      dirty: input.dirty,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      status,
      scope: { ...SCOPE },
      manifest,
      results,
      summary,
    };
  });
}

/** Render only a validated report; caller-supplied status/scope cannot override it. */
export function renderPersonaSummary(report) {
  return guarded("PERSONA_REPORT_INVALID", () => {
    exactKeys(report, [
      "schemaVersion",
      "kind",
      "runId",
      "sourceSha",
      "dirty",
      "startedAt",
      "finishedAt",
      "status",
      "scope",
      "manifest",
      "results",
      "summary",
    ]);
    const expected = buildPersonaReport({
      manifest: report.manifest,
      runId: report.runId,
      sourceSha: report.sourceSha,
      dirty: report.dirty,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      results: report.results,
    });
    requireValue(
      report.schemaVersion === 1 &&
        report.kind === expected.kind &&
        report.status === expected.status,
    );
    exactKeys(report.scope, Object.keys(SCOPE));
    requireValue(
      Object.entries(SCOPE).every(
        ([key, value]) => report.scope[key] === value,
      ),
    );
    exactKeys(report.summary, Object.keys(expected.summary));
    requireValue(
      Object.entries(expected.summary).every(
        ([key, value]) => report.summary[key] === value,
      ),
    );
    const lines = [
      "# Local synthetic persona lab",
      "",
      `Result: ${expected.status}`,
      "",
      `Run: ${expected.runId}`,
      `Source: ${expected.sourceSha}`,
      `Uncommitted changes: ${expected.dirty ? "yes" : "no"}`,
      `Started: ${expected.startedAt}`,
      `Finished: ${expected.finishedAt}`,
      "",
      "Authentication is simulated. Human acceptance: false. Providers are fake.",
      "Financial activity uses synthetic funds. Wallets are synthetic with no on-chain activity.",
      "This report covers a disposable local PostgreSQL run and does not certify cloud readiness.",
      "",
      "## Personas",
      "",
      ...expected.manifest.personas.map(
        (persona) =>
          `- ${persona.displayName} (${persona.alias}): ${displayUsd(persona.openingBalanceMinor)} opening synthetic balance.`,
      ),
      "",
      "## Scenarios",
      "",
      `Passed: ${expected.summary.passed}. Failed: ${expected.summary.failed}. Blocked: ${expected.summary.blocked}.`,
      "",
    ];
    if (
      expected.results.every(
        (result) => result.errorCode === "PERSONA_SCENARIO_NOT_RUN",
      )
    ) {
      lines.push("No scenarios ran. The result is blocked.", "");
    }
    for (const result of expected.results) {
      lines.push(`- ${result.title} (${result.persona}): ${result.status}.`);
      if (result.errorCode) lines.push(`  Error code: ${result.errorCode}.`);
      for (const [key, value] of Object.entries(result.observations)) {
        const readable =
          key.endsWith("Minor") &&
          typeof value === "string" &&
          /^-?[0-9]+$/.test(value)
            ? `${displayUsd(value)} (${value} minor units)`
            : value;
        lines.push(`  ${key}: ${readable}.`);
      }
    }
    return `${lines.join("\n")}\n`;
  });
}

// All monetary observations in this first lab are synthetic USD. Preserve
// integer arithmetic in reports as well as the ledger; never round floats.
function displayUsd(value) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}$${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")} USD`;
}
