// Validate the reporting record, independently of engineering pass/fail gates.
export function validateOptionalQaseReporting(reporting, runId, runUrl) {
  const ids = ["qase_create", "qase_upload", "qase_complete"];
  const allowed = ["success", "failure", "cancelled", "skipped", "missing"];
  if (
    !reporting ||
    typeof reporting.enabled !== "boolean" ||
    JSON.stringify(Object.keys(reporting.outcomes ?? {}).sort()) !==
      JSON.stringify([...ids].sort()) ||
    !Object.values(reporting.outcomes).every((value) => allowed.includes(value))
  ) {
    throw new Error("Qase reporting outcomes are invalid");
  }
  const outcomes = reporting.outcomes;
  const hasRun = runId !== null;
  if (
    (hasRun &&
      (typeof runId !== "string" ||
        !/^[1-9][0-9]*$/.test(runId) ||
        runUrl !== `https://app.qase.io/run/SAMP/dashboard/${runId}`)) ||
    (hasRun && ["skipped", "missing"].includes(outcomes.qase_create)) ||
    (!hasRun && runUrl !== null) ||
    (!reporting.enabled &&
      (hasRun || ids.some((id) => outcomes[id] !== "skipped"))) ||
    (!hasRun &&
      (outcomes.qase_create === "success" ||
        outcomes.qase_upload !== "skipped" ||
        outcomes.qase_complete !== "skipped"))
  ) {
    throw new Error("Qase reporting identity or outcomes are inconsistent");
  }
  return reporting;
}

export function qaseReportingFromEnvironment(environment = process.env) {
  if (!["true", "false"].includes(environment.QASE_REPORTING_ENABLED)) {
    throw new Error("QASE_REPORTING_ENABLED must explicitly be true or false");
  }
  const reporting = {
    enabled: environment.QASE_REPORTING_ENABLED === "true",
    outcomes: JSON.parse(environment.QASE_REPORTING_RESULTS ?? "null"),
  };
  const runId = environment.QASE_RUN_ID?.trim() || null;
  const runUrl = runId
    ? `https://app.qase.io/run/SAMP/dashboard/${runId}`
    : null;
  validateOptionalQaseReporting(reporting, runId, runUrl);
  return { reporting, runId, runUrl };
}
