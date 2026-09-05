/** Local UI approval coordinator, not a server authorization or signature verifier.
 * The future SDK transport must verify the prepared transaction matches these
 * details, select this passkey explicitly, and verify its onchain approval.
 * Never translate this state into a trusted `approved: true` API parameter.
 */
export type CustomerTransferReview = Readonly<{
  intentId: string;
  customerId: string;
  walletId: string;
  recipient: string;
  amountMinor: string;
  asset: string;
  network: string;
  feeMinor: string;
  feeAsset: string;
  transactionDigest: string;
  expiresAt: number;
  passkeyId: string;
}>;

export type CustomerTransferApprovalState =
  "review" | "signing" | "submitted" | "cancelled" | "unknown";

/** One instance per immutable, customer-initiated intent. No background retry. */
export function createCustomerTransferApproval(
  review: CustomerTransferReview,
  dependencies: Readonly<{
    now: () => number;
    // Trusted transport boundary: no default device or recovery signer fallback.
    submitWithCustomerPasskey: (
      review: CustomerTransferReview,
    ) => Promise<Readonly<{ transactionId: string }>>;
  }>,
) {
  const { now, submitWithCustomerPasskey } = dependencies;
  const snapshot = Object.freeze({ ...review });
  const keys = [
    "intentId",
    "customerId",
    "walletId",
    "recipient",
    "amountMinor",
    "asset",
    "network",
    "feeMinor",
    "feeAsset",
    "transactionDigest",
    "expiresAt",
    "passkeyId",
  ] as const;
  if (
    Object.keys(snapshot).length !== keys.length ||
    keys.some(
      (key) =>
        key !== "expiresAt" &&
        (typeof snapshot[key] !== "string" ||
          snapshot[key].trim().length === 0),
    ) ||
    !/^[1-9][0-9]*$/u.test(snapshot.amountMinor) ||
    !/^(0|[1-9][0-9]*)$/u.test(snapshot.feeMinor) ||
    !Number.isSafeInteger(snapshot.expiresAt) ||
    !isBeforeExpiry(now(), snapshot.expiresAt)
  )
    throw new Error("Invalid transfer review.");

  let state: CustomerTransferApprovalState = "review";
  return Object.freeze({
    review: snapshot,
    get state() {
      return state;
    },
    cancel() {
      if (state !== "review")
        throw new Error("Transfer is no longer cancellable locally.");
      state = "cancelled";
    },
    async approve(currentReview: CustomerTransferReview) {
      if (state !== "review")
        throw new Error("Transfer requires a new review or reconciliation.");
      const current = { ...currentReview };
      // Includes fees, customer/wallet identity, passkey, and exact transaction digest.
      if (
        Object.keys(current).length !== keys.length ||
        keys.some((key) => current[key] !== snapshot[key]) ||
        !isBeforeExpiry(now(), snapshot.expiresAt)
      ) {
        state = "cancelled";
        throw new Error("Transfer changed or expired. Review it again.");
      }
      state = "signing"; // Set before awaiting to prevent concurrent double clicks.
      try {
        const result = await submitWithCustomerPasskey(snapshot);
        if (
          !result ||
          typeof result.transactionId !== "string" ||
          !result.transactionId.trim()
        ) {
          throw new Error("Missing submission evidence.");
        }
        state = "submitted";
        return Object.freeze({ transactionId: result.transactionId });
      } catch {
        // A transport error may occur after broadcast. Reconcile the same intent;
        // do not reset to review or retry under a new idempotency reference.
        state = "unknown";
        throw new Error(
          "Transfer outcome is unknown. Reconcile before trying again.",
        );
      }
    },
  });
}

function isBeforeExpiry(now: number, expiresAt: number): boolean {
  return Number.isSafeInteger(now) && now >= 0 && now < expiresAt;
}
