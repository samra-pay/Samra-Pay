import { useSyncExternalStore } from "react";

// Client-side demo session state for bill payments.
// Persisted in sessionStorage so it survives navigation but resets per session.

export type BillId = "charge" | "airlines";

export type BillState = {
  paid: boolean;
  paidAt?: string;
};

export type DemoState = {
  bills: Record<BillId, BillState>;
  /** Amount deducted from Checking by demo payments, in dollars */
  checkingDeducted: number;
};

export const BILL_INFO: Record<
  BillId,
  { name: string; amount: number; due: string }
> = {
  charge: { name: "Samra Pay Charge Card", amount: 1240, due: "Jul 2" },
  airlines: { name: "Airlines Premium", amount: 3450, due: "Jul 8" },
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
    return {
      bills: {
        charge: { paid: !!parsed?.bills?.charge?.paid },
        airlines: { paid: !!parsed?.bills?.airlines?.paid },
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

export function payBill(bill: BillId) {
  if (state.bills[bill].paid) return;
  state = {
    ...state,
    bills: {
      ...state.bills,
      [bill]: { paid: true, paidAt: "Today" },
    },
    checkingDeducted: state.checkingDeducted + BILL_INFO[bill].amount,
  };
  emit();
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
