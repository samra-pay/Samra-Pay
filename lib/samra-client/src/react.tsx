import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  createContext,
  useEffect,
  useContext,
  type PropsWithChildren,
  type ReactElement,
} from "react";

import type { CustomerAcquisitionClient } from "./acquisition";
import type {
  ActivityQuery,
  CreateQuoteInput,
  CreateTransferInput,
  SamraDataSource,
  SamraDataMode,
  TransferQuery,
  TransferStatus,
} from "./index";
import type {
  CustomerIdentityProviderDecision,
  SamraOnboardingDemoControls,
  SamraOnboardingSource,
  StartCustomerWalletProvisioningInput,
  SubmitCustomerConsentBundleInput,
} from "./onboarding";

const DataSourceContext = createContext<SamraDataSource | null>(null);
const CustomerAcquisitionContext =
  createContext<CustomerAcquisitionClient | null>(null);

type SamraOnboardingRuntime = Readonly<{
  mode: SamraDataMode;
  source: SamraOnboardingSource;
  demoControls: SamraOnboardingDemoControls | null;
}>;

const OnboardingSourceContext = createContext<SamraOnboardingRuntime | null>(
  null,
);

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

export function SamraCustomerAcquisitionProvider({
  client,
  children,
}: PropsWithChildren<{ client: CustomerAcquisitionClient }>): ReactElement {
  return (
    <CustomerAcquisitionContext.Provider value={client}>
      {children}
    </CustomerAcquisitionContext.Provider>
  );
}

export function useSamraCustomerAcquisition(): CustomerAcquisitionClient {
  const client = useContext(CustomerAcquisitionContext);
  if (!client) {
    throw new Error(
      "SamraCustomerAcquisitionProvider is missing from the application boundary",
    );
  }
  return client;
}

export function SamraOnboardingSourceProvider({
  mode,
  source,
  demoControls = null,
  children,
}: PropsWithChildren<{
  mode: SamraDataMode;
  source: SamraOnboardingSource;
  demoControls?: SamraOnboardingDemoControls | null;
}>): ReactElement {
  return (
    <OnboardingSourceContext.Provider value={{ mode, source, demoControls }}>
      {children}
    </OnboardingSourceContext.Provider>
  );
}

export function useSamraOnboardingRuntime(): SamraOnboardingRuntime {
  const runtime = useContext(OnboardingSourceContext);
  if (!runtime) {
    throw new Error(
      "SamraOnboardingSourceProvider is missing from the application boundary",
    );
  }
  return runtime;
}

export const samraQueryKeys = {
  customer: ["samra", "customer"] as const,
  accounts: ["samra", "accounts"] as const,
  beneficiaries: ["samra", "beneficiaries"] as const,
  activity: (input?: ActivityQuery) =>
    ["samra", "activity", input ?? {}] as const,
  options: ["samra", "remittance", "options"] as const,
  transfers: (input?: TransferQuery) =>
    ["samra", "remittance", "transfers", input ?? {}] as const,
  transfer: (id: string) => ["samra", "remittance", "transfer", id] as const,
  onboarding: ["samra", "onboarding"] as const,
  identityCase: ["samra", "onboarding", "identity"] as const,
  wallet: ["samra", "onboarding", "wallet"] as const,
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

export function useBeneficiaries() {
  const source = useSamraDataSource();
  return useQuery({
    ...queryDefaults(samraQueryKeys.beneficiaries),
    queryFn: () => source.listBeneficiaries(),
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

export function useTransfer(id: string) {
  const source = useSamraDataSource();
  const queryClient = useQueryClient();
  const query = useQuery({
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

  useEffect(() => {
    if (!query.data) return;
    void invalidateFinancialQueries(queryClient);
  }, [query.data?.id, query.data?.status, query.data?.updatedAt, queryClient]);

  return query;
}

export function useCreateQuote() {
  const source = useSamraDataSource();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) => source.createQuote(input),
    retry: false,
  });
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

export function useCustomerOnboarding() {
  const { source } = useSamraOnboardingRuntime();
  return useQuery({
    ...queryDefaults(samraQueryKeys.onboarding),
    queryFn: () => source.getOnboarding(),
  });
}

export function useCustomerIdentityCase(enabled: boolean) {
  const { source } = useSamraOnboardingRuntime();
  return useQuery({
    ...queryDefaults(samraQueryKeys.identityCase),
    queryFn: () => source.getIdentityCase(),
    enabled,
  });
}

export function useCustomerWallet(enabled: boolean) {
  const { source } = useSamraOnboardingRuntime();
  return useQuery({
    ...queryDefaults(samraQueryKeys.wallet),
    queryFn: () => source.getWallet(),
    enabled,
  });
}

export function useStartCustomerOnboarding() {
  const { source } = useSamraOnboardingRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      source.startOnboarding(idempotencyKey),
    retry: false,
    onSuccess(snapshot) {
      queryClient.setQueryData(samraQueryKeys.onboarding, snapshot);
    },
  });
}

export function useSubmitCustomerConsents() {
  const { source } = useSamraOnboardingRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: SubmitCustomerConsentBundleInput;
      idempotencyKey: string;
    }) => source.submitConsentBundle(input, idempotencyKey),
    retry: false,
    onSuccess(snapshot) {
      queryClient.setQueryData(samraQueryKeys.onboarding, snapshot);
      queryClient.setQueryData(samraQueryKeys.identityCase, null);
    },
  });
}

export function useStartCustomerIdentityVerification() {
  const { source } = useSamraOnboardingRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      source.startIdentityVerification(idempotencyKey),
    retry: false,
    onSuccess(snapshot) {
      queryClient.setQueryData(samraQueryKeys.identityCase, snapshot);
      void queryClient.invalidateQueries({
        queryKey: samraQueryKeys.onboarding,
      });
    },
  });
}

export function useStartCustomerWalletProvisioning() {
  const { source } = useSamraOnboardingRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: StartCustomerWalletProvisioningInput;
      idempotencyKey: string;
    }) => source.startWalletProvisioning(input, idempotencyKey),
    retry: false,
    async onSuccess(snapshot) {
      queryClient.setQueryData(samraQueryKeys.wallet, snapshot);
      await queryClient.invalidateQueries({
        queryKey: samraQueryKeys.onboarding,
      });
    },
  });
}

export function useAdvanceDemoCustomerIdentity() {
  const { demoControls } = useSamraOnboardingRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      identityCaseId,
      decision,
      idempotencyKey,
    }: {
      identityCaseId: string;
      decision: CustomerIdentityProviderDecision;
      idempotencyKey: string;
    }) => {
      if (!demoControls) {
        throw new Error("Synthetic identity controls are not enabled.");
      }
      return demoControls.advanceIdentity(
        identityCaseId,
        decision,
        idempotencyKey,
      );
    },
    retry: false,
    async onSuccess(snapshot) {
      queryClient.setQueryData(samraQueryKeys.identityCase, snapshot);
      await queryClient.invalidateQueries({
        queryKey: samraQueryKeys.onboarding,
      });
    },
  });
}

export function useResetDemoCustomerOnboarding() {
  const { demoControls } = useSamraOnboardingRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!demoControls?.reset) {
        throw new Error("Synthetic onboarding reset is not enabled.");
      }
      await demoControls.reset();
    },
    retry: false,
    onSuccess() {
      queryClient.setQueryData(samraQueryKeys.onboarding, null);
      queryClient.setQueryData(samraQueryKeys.identityCase, null);
      queryClient.setQueryData(samraQueryKeys.wallet, null);
    },
  });
}
