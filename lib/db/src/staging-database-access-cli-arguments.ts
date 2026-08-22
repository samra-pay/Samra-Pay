export function parseStagingDatabaseAccessActionArguments(
  arguments_: string[],
): string {
  const actions = arguments_.filter((argument) => argument !== "--");
  if (actions.length !== 1) {
    throw new Error(
      "Usage: staging-database-access-cli.ts <bootstrap|finalize|audit-migration|audit-runtime>",
    );
  }
  return actions[0];
}
