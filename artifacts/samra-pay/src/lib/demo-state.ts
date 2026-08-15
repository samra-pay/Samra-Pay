import { useSyncExternalStore } from "react";

// Client-side demo session state for bill payments.
// Persisted in sessionStorage so it survives navigation but resets per session.

export type BillId = "charge" | "airlines";

export type PaymentOption = "full" | "min";

export type BillState = {
  paid: boolean;
  paidAt?: string;
  /** Which option was used when paid */
  paidOption?: PaymentOption;
  /** Amount actually paid, in dollars */
  paidAmount?: number;
};

export type DemoState = {
  bills: Record<BillId, BillState>;
  /** Amount deducted from Checking by demo payments, in dollars */
  checkingDeducted: number;
};

export const BILL_INFO: Record<
  BillId,
  { name: string; amount: number; minDue: number; due: string }
> = {
  charge: { name: "Samra Pay Charge Card", amount: 1240, minDue: 35, due: "Jul 2" },
  airlines: { name: "Airlines Premium", amount: 3450, minDue: 89, due: "Jul 8" },
};

export const CHECKING_BASE_BALANCE = 4250;

const STORAGE_KEY = "samra-demo-state";

const defaultState: DemoState = {
  bills: {
    charge: { paid: false },
    airlines: { paid: false },
  },
  checkingDeducted: 0,
};

function loadState(): DemoState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    const parseBill = (id: BillId): BillState => {
      const b = parsed?.bills?.[id];
      const paidOption: PaymentOption | undefined =
        b?.paidOption === "min" ? "min" : b?.paidOption === "full" ? "full" : undefined;
      return {
        paid: !!b?.paid,
        paidOption,
        paidAmount: Number(b?.paidAmount) || undefined,
      };
    };
    return {
      bills: {
        charge: parseBill("charge"),
        airlines: parseBill("airlines"),
      },
      checkingDeducted: Number(parsed?.checkingDeducted) || 0,
    };
  } catch {
    return defaultState;
  }
}

let state: DemoState = loadState();
const listeners = new Set<() => void>();

function emit() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable; state still works in-memory
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DemoState {
  return state;
}

export function payBill(bill: BillId, option: PaymentOption = "full") {
  if (state.bills[bill].paid) return;
  const amount = option === "min" ? BILL_INFO[bill].minDue : BILL_INFO[bill].amount;
  state = {
    ...state,
    bills: {
      ...state.bills,
      [bill]: { paid: true, paidAt: "Today", paidOption: option, paidAmount: amount },
    },
    checkingDeducted: state.checkingDeducted + amount,
  };
  emit();
}

/** Remaining balance on a card after any demo payment */
export function billRemaining(bill: BillId, billState: BillState): number {
  if (!billState.paid) return BILL_INFO[bill].amount;
  return BILL_INFO[bill].amount - (billState.paidAmount ?? BILL_INFO[bill].amount);
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function formatUSD(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
