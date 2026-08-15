import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  createContext,
  useContext,
  type PropsWithChildren,
  type ReactElement,
} from "react";

import type {
  ActivityQuery,
  CreateQuoteInput,
  CreateTransferInput,
  SamraDataSource,
  TransferQuery,
  TransferStatus,
} from "./index";

const DataSourceContext = createContext<SamraDataSource | null>(null);

export function SamraDataSourceProvider({
  source,
  children,
}: PropsWithChildren<{ source: SamraDataSource }>): ReactElement {
  return (
    <DataSourceContext.Provider value={source}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useSamraDataSource(): SamraDataSource {
  const source = useContext(DataSourceContext);
  if (!source) {
    throw new Error(
      "SamraDataSourceProvider is missing from the application boundary",
    );
  }
  return source;
}

export const samraQueryKeys = {
  customer: ["samra", "customer"] as const,
  accounts: ["samra", "accounts"] as const,
  activity: (input?: ActivityQuery) =>
    ["samra", "activity", input ?? {}] as const,
  options: ["samra", "remittance", "options"] as const,
  transfers: (input?: TransferQuery) =>
    ["samra", "remittance", "transfers", input ?? {}] as const,
  transfer: (id: string) => ["samra", "remittance", "transfer", id] as const,
};

function retryTransient(failureCount: number, error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

function queryDefaults(queryKey: QueryKey) {
  return {
    queryKey,
    retry: retryTransient,
  };
}

export function useCurrentCustomer() {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.customer),
    queryFn: () => source.getCurrentCustomer(),
  });
}

export function useAccounts() {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.accounts),
    queryFn: () => source.listAccounts(),
  });
}

export function useActivity(input?: ActivityQuery) {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.activity(input)),
    queryFn: () => source.listActivity(input),
  });
}

export function useRemittanceOptions() {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.options),
    queryFn: () => source.getRemittanceOptions(),
  });
}

export function useTransfers(input?: TransferQuery) {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.transfers(input)),
    queryFn: () => source.listTransfers(input),
  });
}

const TERMINAL_TRANSFER_STATES = new Set<TransferStatus>([
  "completed",
  "failed",
  "refunded",
  "cancelled",
]);

export function useTransfer(id: string) {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.transfer(id)),
    queryFn: () => source.getTransfer(id),
    enabled: id.length > 0,
    refetchInterval(query) {
      const transfer = query.state.data;
      if (!transfer || TERMINAL_TRANSFER_STATES.has(transfer.status))
        return false;
      return 1_500;
    },
  });
}

export function useCreateQuote() {
  const source = useSamraDataSource();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) => source.createQuote(input),
    retry: false,
  });
}

async function invalidateFinancialQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: samraQueryKeys.accounts }),
    queryClient.invalidateQueries({ queryKey: ["samra", "activity"] }),
    queryClient.invalidateQueries({
      queryKey: ["samra", "remittance", "transfers"],
    }),
  ]);
}

export function useCreateTransfer() {
  const source = useSamraDataSource();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CreateTransferInput;
      idempotencyKey: string;
    }) => source.createTransfer(input, idempotencyKey),
    retry: false,
    async onSuccess(transfer) {
      queryClient.setQueryData(samraQueryKeys.transfer(transfer.id), transfer);
      await invalidateFinancialQueries(queryClient);
    },
  });
}

export function useCancelTransfer() {
  const source = useSamraDataSource();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transferId,
      idempotencyKey,
    }: {
      transferId: string;
      idempotencyKey: string;
    }) => source.cancelTransfer(transferId, idempotencyKey),
    retry: false,
    async onSuccess(transfer) {
      queryClient.setQueryData(samraQueryKeys.transfer(transfer.id), transfer);
      await invalidateFinancialQueries(queryClient);
    },
  });
}
