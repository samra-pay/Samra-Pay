import { readCrossmintSandboxWallet } from "../src/domain/crossmint-sandbox-read.mjs";

// Key comes through a pipe, never an argument, file, or printed provider response.
const [address, expectedOwner, mode] = process.argv.slice(2);
const terminalInput = Boolean(process.stdin.isTTY);
try {
  if (mode !== undefined && mode !== "--customer-controlled")
    throw new Error("Unknown sandbox lookup mode.");
  if (terminalInput) process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  let key = "";
  for await (const chunk of process.stdin) {
    key += chunk;
    if (key.includes("\u0003")) throw new Error("Sandbox lookup cancelled.");
    if (key.length > (mode ? 2048 : 512))
      throw new Error("Invalid staging credential input.");
    if (/[\r\n]/.test(key)) break;
  }
  if (terminalInput) process.stdin.setRawMode(false);
  let credentials;
  if (mode) {
    try {
      credentials = JSON.parse(key.trim());
      if (
        !credentials ||
        typeof credentials.apiKey !== "string" ||
        typeof credentials.expectedRecoveryEmail !== "string"
      )
        throw new Error();
    } catch {
      throw new Error("Invalid staging credential input.");
    }
  }
  const result = await readCrossmintSandboxWallet({
    apiKey: credentials?.apiKey ?? key.trim(),
    address,
    expectedOwner,
    expectedRecoveryEmail: credentials?.expectedRecoveryEmail,
  });
  key = "";
  credentials = undefined;
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (terminalInput) process.stdin.setRawMode(false);
}
