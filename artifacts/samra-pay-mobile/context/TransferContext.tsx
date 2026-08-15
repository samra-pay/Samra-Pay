/**
 * In-session transfer history.
 * Transfers added via the Send screen bubble up to the Home screen's
 * Recent Transactions list — no persistence needed for a demo session.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Transaction } from '@/lib/mock-data';

interface TransferContextValue {
  sessionTransfers: Transaction[];
  addTransfer: (tx: Transaction) => void;
}

const TransferContext = createContext<TransferContextValue | undefined>(undefined);

let nextId = 1000; // avoid collisions with mock-data IDs

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [sessionTransfers, setSessionTransfers] = useState<Transaction[]>([]);

  const addTransfer = useCallback((tx: Transaction) => {
    const withId = { ...tx, id: nextId++ };
    setSessionTransfers((prev) => [withId, ...prev]);
  }, []);

  return (
    <TransferContext.Provider value={{ sessionTransfers, addTransfer }}>
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfers(): TransferContextValue {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error('useTransfers must be used within TransferProvider');
  return ctx;
}
