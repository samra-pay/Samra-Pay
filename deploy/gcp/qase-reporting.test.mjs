import assert from "node:assert/strict";
import test from "node:test";
import {
  qaseReportingFromEnvironment,
  validateOptionalQaseReporting,
} from "./qase-reporting.mjs";

const disabled = {
  enabled: false,
  outcomes: {
    qase_create: "skipped",
    qase_upload: "skipped",
    qase_complete: "skipped",
  },
};

test("records disabled, quota-limited, uploaded, and incomplete reporting without inventing success", () => {
  for (const reporting of [
    disabled,
    {
      enabled: true,
      outcomes: {
        qase_create: "success",
        qase_upload: "skipped",
        qase_complete: "skipped",
      },
    },
    {
      enabled: true,
      outcomes: {
        qase_create: "failure",
        qase_upload: "skipped",
        qase_complete: "skipped",
      },
    },
    {
      enabled: true,
      outcomes: {
        qase_create: "cancelled",
        qase_upload: "skipped",
        qase_complete: "skipped",
      },
    },
  ])
    assert.equal(
      validateOptionalQaseReporting(reporting, null, null),
      reporting,
    );
  for (const upload of ["success", "failure", "cancelled", "skipped"]) {
    for (const complete of ["success", "failure", "cancelled", "skipped"]) {
      validateOptionalQaseReporting(
        {
          enabled: true,
          outcomes: {
            qase_create: "success",
            qase_upload: upload,
            qase_complete: complete,
          },
        },
        "9",
        "https://app.qase.io/run/SAMP/dashboard/9",
      );
    }
  }
});

test("rejects malformed or contradictory reporting metadata", () => {
  for (const [reporting, id, url] of [
    [null, null, null],
    [{}, null, null],
    [{ ...disabled, outcomes: {} }, null, null],
    [
      { ...disabled, outcomes: { ...disabled.outcomes, unknown: "success" } },
      null,
      null,
    ],
    [
      {
        ...disabled,
        outcomes: { ...disabled.outcomes, qase_create: "passed" },
      },
      null,
      null,
    ],
    [
      {
        ...disabled,
        outcomes: { ...disabled.outcomes, qase_create: "success" },
      },
      null,
      null,
    ],
    [disabled, "9", "https://app.qase.io/run/SAMP/dashboard/9"],
    [
      { ...disabled, enabled: true },
      "9",
      "https://app.qase.io/run/SAMP/dashboard/9",
    ],
    [disabled, null, "https://app.qase.io/run/SAMP/dashboard/9"],
    [
      {
        enabled: true,
        outcomes: {
          qase_create: "success",
          qase_upload: "success",
          qase_complete: "success",
        },
      },
      "9",
      "https://other.invalid/9",
    ],
  ])
    assert.throws(() => validateOptionalQaseReporting(reporting, id, url));
  assert.throws(() => qaseReportingFromEnvironment({}), /explicitly/);
  assert.deepEqual(
    qaseReportingFromEnvironment({
      QASE_REPORTING_ENABLED: "false",
      QASE_REPORTING_RESULTS: JSON.stringify(disabled.outcomes),
    }),
    { reporting: disabled, runId: null, runUrl: null },
  );
});

test("a successful create action without an ID records no delivery and cannot fabricate upload", () => {
  const outcomes = {
    qase_create: "success",
    qase_upload: "skipped",
    qase_complete: "skipped",
  };
  const record = qaseReportingFromEnvironment({
    QASE_REPORTING_ENABLED: "true",
    QASE_REPORTING_RESULTS: JSON.stringify(outcomes),
    QASE_RUN_ID: "",
  });
  assert.deepEqual(record, {
    reporting: { enabled: true, outcomes },
    runId: null,
    runUrl: null,
  });
  for (const key of ["qase_upload", "qase_complete"]) {
    assert.throws(() =>
      validateOptionalQaseReporting(
        { enabled: true, outcomes: { ...outcomes, [key]: "success" } },
        null,
        null,
      ),
    );
  }
});
