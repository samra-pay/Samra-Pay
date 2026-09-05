import assert from "node:assert/strict";
import test from "node:test";
import {
  createCustomerTransferApproval,
  type CustomerTransferReview,
} from "@workspace/samra-client/wallet-approval";

const review: CustomerTransferReview = {
  intentId: "intent_1",
  customerId: "customer_1",
  walletId: "wallet_1",
  recipient: "recipient_1",
  amountMinor: "1000000",
  asset: "USDC",
  network: "test-network",
  feeMinor: "0",
  feeAsset: "USDC",
  transactionDigest: "prepared-transaction-digest",
  expiresAt: 200,
  passkeyId: "customer-passkey",
};
function setup() {
  let calls = 0;
  const flow = createCustomerTransferApproval(review, {
    now: () => 100,
    submitWithCustomerPasskey: async (approved) => {
      calls++;
      assert.deepEqual(approved, review);
      assert.ok(Object.isFrozen(approved));
      return { transactionId: "tx_1" };
    },
  });
  return { flow, calls: () => calls };
}

test("review and cancellation cannot submit a transfer", async () => {
  const { flow, calls } = setup();
  assert.equal(calls(), 0);
  flow.cancel();
  await assert.rejects(flow.approve(review));
  assert.equal(calls(), 0);
});

test("approval submits once and concurrent or later duplicates cannot submit", async () => {
  const { flow, calls } = setup();
  const first = flow.approve(review);
  await assert.rejects(flow.approve(review));
  assert.deepEqual(await first, { transactionId: "tx_1" });
  await assert.rejects(flow.approve(review));
  assert.equal(calls(), 1);
  assert.equal(flow.state, "submitted");
});

test("every reviewed field is bound to approval", async () => {
  for (const key of Object.keys(review) as Array<
    keyof CustomerTransferReview
  >) {
    const { flow, calls } = setup();
    const changed = { ...review, [key]: key === "expiresAt" ? 300 : "changed" };
    await assert.rejects(
      flow.approve(changed as CustomerTransferReview),
      /changed or expired/,
    );
    assert.equal(calls(), 0, key);
    assert.equal(flow.state, "cancelled");
  }
});

test("expired approval never reaches signer", async () => {
  let now = 100;
  const flow = createCustomerTransferApproval(review, {
    now: () => now,
    submitWithCustomerPasskey: async () => {
      assert.fail("expired transfer");
    },
  });
  now = 200;
  await assert.rejects(flow.approve(review), /expired/);
});

test("unknown signing or broadcast outcome blocks automatic retry", async () => {
  let calls = 0;
  const flow = createCustomerTransferApproval(review, {
    now: () => 100,
    submitWithCustomerPasskey: async () => {
      calls++;
      throw new Error("sensitive provider error");
    },
  });
  await assert.rejects(flow.approve(review), {
    message: "Transfer outcome is unknown. Reconcile before trying again.",
  });
  await assert.rejects(flow.approve(review));
  assert.equal(flow.state, "unknown");
  assert.equal(calls, 1);
});

test("mutating the source review cannot alter the approved snapshot", async () => {
  const mutable = { ...review };
  const flow = createCustomerTransferApproval(mutable, {
    now: () => 100,
    submitWithCustomerPasskey: async () => {
      assert.fail("changed transfer");
    },
  });
  mutable.recipient = "attacker";
  assert.equal(flow.review.recipient, review.recipient);
  await assert.rejects(flow.approve(mutable), /changed/);
});

test("malformed or expired reviews fail before creating an approval flow", () => {
  for (const invalid of [
    { ...review, amountMinor: "0" },
    { ...review, amountMinor: "1.5" },
    { ...review, feeMinor: "-1" },
    { ...review, recipient: " " },
    { ...review, transactionDigest: "" },
    { ...review, expiresAt: 100 },
    { ...review, expiresAt: Infinity },
    { ...review, extraField: "unreviewed" },
  ]) {
    assert.throws(
      () =>
        createCustomerTransferApproval(invalid, {
          now: () => 100,
          submitWithCustomerPasskey: async () => assert.fail("invalid review"),
        }),
      /Invalid transfer review/,
    );
  }
});

test("an unavailable or invalid clock fails closed at review and approval", async () => {
  for (const invalidTime of [NaN, Infinity, -1, 1.5]) {
    assert.throws(
      () =>
        createCustomerTransferApproval(review, {
          now: () => invalidTime,
          submitWithCustomerPasskey: async () => assert.fail("invalid clock"),
        }),
      /Invalid transfer review/,
    );
    let now = 100;
    const flow = createCustomerTransferApproval(review, {
      now: () => now,
      submitWithCustomerPasskey: async () => assert.fail("invalid clock"),
    });
    now = invalidTime;
    await assert.rejects(flow.approve(review), /changed or expired/);
    assert.equal(flow.state, "cancelled");
  }
});

test("missing provider submission evidence leaves the same intent unknown", async () => {
  for (const result of [undefined, {}, { transactionId: " " }]) {
    let calls = 0;
    const flow = createCustomerTransferApproval(review, {
      now: () => 100,
      submitWithCustomerPasskey: async () => {
        calls++;
        return result as never;
      },
    });
    await assert.rejects(flow.approve(review), /outcome is unknown/);
    assert.equal(flow.state, "unknown");
    await assert.rejects(flow.approve(review));
    assert.equal(calls, 1);
  }
});

test("approval requires its own complete review fields", async () => {
  const { flow, calls } = setup();
  const inherited = Object.assign(
    Object.create({ recipient: review.recipient }),
    review,
  );
  delete inherited.recipient;
  inherited.extraField = "not a recipient";
  await assert.rejects(flow.approve(inherited), /changed or expired/);
  assert.equal(calls(), 0);
});
