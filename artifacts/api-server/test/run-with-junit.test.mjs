import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNodeJunit } from "./run-with-junit.mjs";

test("normalizes Node JUnit into a Qase-compatible test suite", () => {
  const source = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="passes" time="0.1" classname="test" />
  <testcase name="fails" time="0.2" classname="test"><failure>boom</failure></testcase>
</testsuites>`;

  const normalized = normalizeNodeJunit(source, 'PostgreSQL & "ledger"');

  assert.match(
    normalized,
    /<testsuite name="PostgreSQL &amp; &quot;ledger&quot;" tests="2" failures="1" skipped="0">/,
  );
  assert.match(normalized, /<testcase name="passes"/);
  assert.match(normalized, /<failure>boom<\/failure>/);
});

test("rejects an empty Node JUnit report", () => {
  assert.throws(
    () => normalizeNodeJunit("<testsuites></testsuites>", "empty"),
    /contained no test cases/,
  );
});

test("preserves an explicit Qase parent and child suite hierarchy", () => {
  const source = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="CLAUDE-LED-001" time="0.1" classname="test" />
</testsuites>`;

  const normalized = normalizeNodeJunit(
    source,
    "11.01 Ledger - Journal Integrity",
    "11 Claude Ledger Assurance",
  );

  assert.match(
    normalized,
    /<testsuites name="11 Claude Ledger Assurance" tests="1"/,
  );
  assert.match(
    normalized,
    /<testsuite name="11.01 Ledger - Journal Integrity" tests="1"/,
  );
});
