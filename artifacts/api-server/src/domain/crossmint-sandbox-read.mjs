const ORIGIN = "https://staging.crossmint.com/api/2025-06-09/wallets/";
const MAX_BYTES = 64 * 1024;

// Connection evidence only. Never attaches a provider mapping or grants capability.
export async function readCrossmintSandboxWallet(
  { apiKey, address, expectedOwner, expectedRecoveryEmail },
  { fetch: request = fetch } = {},
) {
  if (!/^sk_staging_[A-Za-z0-9]{16,480}$/.test(apiKey ?? "")) {
    throw new Error("A staging server API key is required.");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
    throw new Error("An EVM wallet address is required.");
  }
  if (!/^userId:[a-zA-Z0-9_-]{1,128}$/.test(expectedOwner ?? "")) {
    throw new Error("An opaque expected wallet owner is required.");
  }
  if (
    expectedRecoveryEmail !== undefined &&
    (typeof expectedRecoveryEmail !== "string" ||
      expectedRecoveryEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedRecoveryEmail))
  )
    throw new Error("A valid expected recovery email is required.");
  let response;
  try {
    response = await request(new URL(address, ORIGIN), {
      method: "GET",
      headers: { Accept: "application/json", "X-API-KEY": apiKey },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new Error("Crossmint sandbox connection failed.");
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(
      `Crossmint sandbox lookup returned HTTP ${response.status}.`,
    );
  }
  let wallet;
  try {
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      await response.body?.cancel();
      throw new Error();
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_BYTES) throw new Error();
      chunks.push(chunk);
    }
    wallet = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Crossmint sandbox returned an invalid wallet response.");
  }
  if (
    wallet?.chainType !== "evm" ||
    typeof wallet.address !== "string" ||
    wallet.address.toLowerCase() !== address.toLowerCase() ||
    wallet.owner !== expectedOwner ||
    !["smart", "mpc"].includes(wallet.type)
  ) {
    throw new Error("Crossmint sandbox wallet identity did not match.");
  }
  // Email recovery is necessary for this selected model, but does not prove
  // device enrollment, absence of delegated server access, or user confirmation.
  if (
    expectedRecoveryEmail !== undefined &&
    (wallet.type !== "smart" ||
      wallet.config?.adminSigner?.type !== "email" ||
      wallet.config.adminSigner.email !== expectedRecoveryEmail)
  )
    throw new Error(
      "Crossmint sandbox recovery does not match the customer-controlled policy.",
    );
  return Object.freeze({
    environment: "staging",
    apiVersion: "2025-06-09",
    address: address.toLowerCase(),
    chainType: "evm",
    walletType: wallet.type,
    ownerVerified: true,
    customerRecoveryVerified: expectedRecoveryEmail !== undefined,
    operationalSignersVerified: false,
    transactionApprovalVerified: false,
    runtimeConnected: false,
    financialCapabilityEnabled: false,
  });
}
