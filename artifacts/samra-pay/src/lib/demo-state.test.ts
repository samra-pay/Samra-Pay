import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BILL_INFO,
  CHECKING_BASE_BALANCE,
  billRemaining,
  formatUSD,
  type BillState,
} from "./demo-state";

// ─── BILL_INFO constants ─────────────────────────────────────────────────────

describe("BILL_INFO", () => {
  it("charge card has expected amount and minDue", () => {
    expect(BILL_INFO.charge.amount).toBe(1240);
    expect(BILL_INFO.charge.minDue).toBe(35);
  });

  it("airlines has expected amount and minDue", () => {
    expect(BILL_INFO.airlines.amount).toBe(3450);
    expect(BILL_INFO.airlines.minDue).toBe(89);
  });

  it("CHECKING_BASE_BALANCE is 4250", () => {
    expect(CHECKING_BASE_BALANCE).toBe(4250);
  });
});

// ─── billRemaining (pure function) ───────────────────────────────────────────

describe("billRemaining", () => {
  it("returns full amount when bill is unpaid", () => {
    const unpaid: BillState = { paid: false };
    expect(billRemaining("charge", unpaid)).toBe(BILL_INFO.charge.amount);
  });

  it("returns 0 after full payment", () => {
    const fullPaid: BillState = {
      paid: true,
      paidOption: "full",
      paidAmount: BILL_INFO.charge.amount,
    };
    expect(billRemaining("charge", fullPaid)).toBe(0);
  });

  it("returns remaining balance after minimum payment", () => {
    const minPaid: BillState = {
      paid: true,
      paidOption: "min",
      paidAmount: BILL_INFO.charge.minDue,
    };
    const expected = BILL_INFO.charge.amount - BILL_INFO.charge.minDue;
    expect(billRemaining("charge", minPaid)).toBe(expected);
  });

  it("handles missing paidAmount by treating as full payment (remaining = 0)", () => {
    const paidNoPaidAmount: BillState = { paid: true };
    // When paidAmount is undefined, fallback is full bill amount → remaining = 0
    expect(billRemaining("charge", paidNoPaidAmount)).toBe(0);
  });

  it("works for airlines bill too", () => {
    const minPaid: BillState = {
      paid: true,
      paidOption: "min",
      paidAmount: BILL_INFO.airlines.minDue,
    };
    expect(billRemaining("airlines", minPaid)).toBe(
      BILL_INFO.airlines.amount - BILL_INFO.airlines.minDue
    );
  });
});

// ─── payBill state machine ────────────────────────────────────────────────────
// demo-state.ts holds module-level singleton state. We use vi.resetModules() +
// dynamic import to get a fresh singleton for each test.

describe("payBill – full payment", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it("deducts the full bill amount from checking", async () => {
    const { payBill } = await import("./demo-state");
    payBill("charge", "full");

    const raw = sessionStorage.getItem("samra-demo-state");
    const parsed = JSON.parse(raw!);
    expect(parsed.bills.charge.paid).toBe(true);
    expect(parsed.bills.charge.paidOption).toBe("full");
    expect(parsed.bills.charge.paidAmount).toBe(BILL_INFO.charge.amount);
    expect(parsed.checkingDeducted).toBe(BILL_INFO.charge.amount);
  });

  it("deducts the min due amount for a minimum payment", async () => {
    const { payBill } = await import("./demo-state");
    payBill("charge", "min");

    const raw = sessionStorage.getItem("samra-demo-state");
    const parsed = JSON.parse(raw!);
    expect(parsed.bills.charge.paid).toBe(true);
    expect(parsed.bills.charge.paidOption).toBe("min");
    expect(parsed.bills.charge.paidAmount).toBe(BILL_INFO.charge.minDue);
    expect(parsed.checkingDeducted).toBe(BILL_INFO.charge.minDue);
  });

  it("accumulates checkingDeducted across two bill payments", async () => {
    const { payBill } = await import("./demo-state");
    payBill("charge", "full");
    payBill("airlines", "min");

    const raw = sessionStorage.getItem("samra-demo-state");
    const parsed = JSON.parse(raw!);
    expect(parsed.checkingDeducted).toBe(
      BILL_INFO.charge.amount + BILL_INFO.airlines.minDue
    );
  });

  it("ignores a second payBill call for the same bill", async () => {
    const { payBill } = await import("./demo-state");
    payBill("charge", "full");
    payBill("charge", "min"); // should be a no-op

    const raw = sessionStorage.getItem("samra-demo-state");
    const parsed = JSON.parse(raw!);
    expect(parsed.bills.charge.paidOption).toBe("full");
    expect(parsed.checkingDeducted).toBe(BILL_INFO.charge.amount);
  });
});

// ─── sessionStorage persistence round-trip ────────────────────────────────────

describe("sessionStorage persistence round-trip", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  it("serialises paid state to sessionStorage", async () => {
    const { payBill } = await import("./demo-state");
    payBill("airlines", "min");

    const raw = sessionStorage.getItem("samra-demo-state");
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.bills.airlines.paid).toBe(true);
    expect(parsed.bills.airlines.paidOption).toBe("min");
    expect(parsed.bills.airlines.paidAmount).toBe(BILL_INFO.airlines.minDue);
    expect(parsed.checkingDeducted).toBe(BILL_INFO.airlines.minDue);
    // charge should be untouched
    expect(parsed.bills.charge.paid).toBe(false);
  });

  it("a fresh module load restores state written by a prior session", async () => {
    // Write state as if a previous page visit paid the charge bill in full
    const priorState = {
      bills: {
        charge: { paid: true, paidOption: "full", paidAmount: BILL_INFO.charge.amount },
        airlines: { paid: false },
      },
      checkingDeducted: BILL_INFO.charge.amount,
    };
    sessionStorage.setItem("samra-demo-state", JSON.stringify(priorState));

    // Now import fresh — module should read sessionStorage on init
    const { payBill } = await import("./demo-state");

    // Paying airlines now should ADD to the already-deducted amount
    payBill("airlines", "full");

    const raw = sessionStorage.getItem("samra-demo-state");
    const parsed = JSON.parse(raw!);
    expect(parsed.checkingDeducted).toBe(
      BILL_INFO.charge.amount + BILL_INFO.airlines.amount
    );
    // charge should remain paid (not reset)
    expect(parsed.bills.charge.paid).toBe(true);
  });
});

// ─── formatUSD ───────────────────────────────────────────────────────────────

describe("formatUSD", () => {
  it("formats zero as $0.00", () => {
    expect(formatUSD(0)).toBe("$0.00");
  });

  it("formats integer amounts with two decimal places", () => {
    expect(formatUSD(1240)).toBe("$1,240.00");
  });

  it("formats decimal amounts correctly", () => {
    expect(formatUSD(89.5)).toBe("$89.50");
  });
});
