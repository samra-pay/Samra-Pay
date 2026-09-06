const operationalErrorCodes = new Set([
  "EACCES",
  "EADDRINUSE",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

// Error messages, stacks, causes and provider properties can contain credentials
// or payloads. Keep only a bounded diagnostic class in operational output.
export function serializeOperationalError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  return {
    type: "Error",
    code:
      typeof code === "string" && operationalErrorCodes.has(code)
        ? code
        : "UNCLASSIFIED",
  };
}
