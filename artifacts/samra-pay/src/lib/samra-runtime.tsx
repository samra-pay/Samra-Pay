import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import {
  ApiSamraDataSource,
  parseSamraDataMode,
  type SamraDataMode,
  type SamraDataSource,
} from "@workspace/samra-client";
import { createGeneratedSamraTransport } from "@workspace/samra-client/generated-transport";
import { SamraDataSourceProvider } from "@workspace/samra-client/react";

const DataModeContext = createContext<SamraDataMode | null>(null);

type RuntimeResolution =
  | Readonly<{ mode: SamraDataMode; source: SamraDataSource; error?: never }>
  | Readonly<{ error: Error; mode?: never; source?: never }>;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function unavailableLegacyMethod(): Promise<never> {
  return Promise.reject(
    new Error(
      "The legacy mock UI does not expose financial data through SamraDataSource.",
    ),
  );
}

const legacyMockBoundary: SamraDataSource = {
  getCurrentCustomer: unavailableLegacyMethod,
  listAccounts: unavailableLegacyMethod,
  listActivity: unavailableLegacyMethod,
  getRemittanceOptions: unavailableLegacyMethod,
  createQuote: unavailableLegacyMethod,
  createTransfer: unavailableLegacyMethod,
  getTransfer: unavailableLegacyMethod,
  listTransfers: unavailableLegacyMethod,
  cancelTransfer: unavailableLegacyMethod,
};

export function SamraRuntimeProvider({
  children,
}: PropsWithChildren): ReactElement {
  const runtime = useMemo<RuntimeResolution>(() => {
    try {
      const mode = parseSamraDataMode(
        import.meta.env.VITE_SAMRA_DATA_MODE,
        "VITE_SAMRA_DATA_MODE",
      );
      const source =
        mode === "api"
          ? new ApiSamraDataSource(createGeneratedSamraTransport())
          : legacyMockBoundary;
      return { mode, source };
    } catch (error) {
      return { error: toError(error) };
    }
  }, []);

  if (runtime.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6"
        >
          <h1 className="text-xl font-semibold">
            Invalid Samra data configuration
          </h1>
          <p className="mt-2 break-words text-sm text-muted-foreground">
            {runtime.error.message}
          </p>
        </div>
      </main>
    );
  }

  return (
    <DataModeContext.Provider value={runtime.mode}>
      <SamraDataSourceProvider source={runtime.source}>
        {children}
      </SamraDataSourceProvider>
    </DataModeContext.Provider>
  );
}

export function useSamraDataMode(): SamraDataMode {
  const mode = useContext(DataModeContext);
  if (!mode) {
    throw new Error(
      "SamraRuntimeProvider is missing from the application boundary",
    );
  }
  return mode;
}
