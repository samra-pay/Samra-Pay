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
import {
  CustomerAcquisitionTracker,
  DISABLED_CUSTOMER_ACQUISITION_CLIENT,
  deriveWebCustomerAcquisitionAttribution,
  type CustomerAcquisitionClient,
} from "@workspace/samra-client/acquisition";
import {
  SyntheticSamraOnboardingSource,
  type SamraOnboardingDemoControls,
  type SamraOnboardingSource,
} from "@workspace/samra-client/onboarding";
import {
  createGeneratedSamraTransport,
  GeneratedCustomerAcquisitionTransport,
  GeneratedSamraOnboardingSource,
} from "@workspace/samra-client/generated-transport";
import {
  SamraCustomerAcquisitionProvider,
  SamraDataSourceProvider,
  SamraOnboardingSourceProvider,
} from "@workspace/samra-client/react";
import { resolveWebPublicEnvironment } from "./public-runtime-config";

const DataModeContext = createContext<SamraDataMode | null>(null);

type RuntimeResolution =
  | Readonly<{
      mode: SamraDataMode;
      source: SamraDataSource;
      acquisitionClient: CustomerAcquisitionClient;
      onboardingSource: SamraOnboardingSource;
      onboardingDemoControls: SamraOnboardingDemoControls | null;
      error?: never;
    }>
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
  listBeneficiaries: unavailableLegacyMethod,
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
      const publicEnvironment = resolveWebPublicEnvironment(import.meta.env);
      const configuredDataMode = publicEnvironment.VITE_SAMRA_DATA_MODE;
      const mode = parseSamraDataMode(
        typeof configuredDataMode === "string" ? configuredDataMode : undefined,
        "VITE_SAMRA_DATA_MODE",
      );
      const source =
        mode === "api"
          ? new ApiSamraDataSource(createGeneratedSamraTransport())
          : legacyMockBoundary;
      const onboardingSource =
        mode === "api"
          ? new GeneratedSamraOnboardingSource()
          : new SyntheticSamraOnboardingSource();
      const acquisitionClient =
        mode === "api"
          ? new CustomerAcquisitionTracker({
              platform: "web",
              attribution: deriveWebCustomerAcquisitionAttribution({
                search: window.location.search,
                referrer: document.referrer,
                currentOrigin: window.location.origin,
              }),
              transport: new GeneratedCustomerAcquisitionTransport(),
              allowCookieSession: true,
            })
          : DISABLED_CUSTOMER_ACQUISITION_CLIENT;
      return {
        mode,
        source,
        acquisitionClient,
        onboardingSource,
        onboardingDemoControls: mode === "mock" ? onboardingSource : null,
      };
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
      <SamraCustomerAcquisitionProvider client={runtime.acquisitionClient}>
        <SamraDataSourceProvider source={runtime.source}>
          <SamraOnboardingSourceProvider
            mode={runtime.mode}
            source={runtime.onboardingSource}
            demoControls={runtime.onboardingDemoControls}
          >
            {children}
          </SamraOnboardingSourceProvider>
        </SamraDataSourceProvider>
      </SamraCustomerAcquisitionProvider>
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
