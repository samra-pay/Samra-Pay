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
import { setBaseUrl } from "@workspace/api-client-react";
import { Platform, Text, View } from "react-native";

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
  listBeneficiaries: unavailableLegacyMethod,
  getRemittanceOptions: unavailableLegacyMethod,
  createQuote: unavailableLegacyMethod,
  createTransfer: unavailableLegacyMethod,
  getTransfer: unavailableLegacyMethod,
  listTransfers: unavailableLegacyMethod,
  cancelTransfer: unavailableLegacyMethod,
};

function createApiSource() {
  return new ApiSamraDataSource(createGeneratedSamraTransport());
}

export function resolveMobileApiOrigin(
  explicitOrigin: string | undefined,
  replitDomain: string | undefined,
  platform: typeof Platform.OS,
): string {
  const explicit = explicitOrigin?.trim() ?? "";
  if (explicit) return explicit.replace(/\/+$/, "");

  const domain = replitDomain?.trim() ?? "";
  if (domain) {
    return (
      domain.startsWith("http://") || domain.startsWith("https://")
        ? domain
        : "https://" + domain
    ).replace(/\/+$/, "");
  }

  if (platform === "web") return "";
  throw new Error(
    "EXPO_PUBLIC_API_ORIGIN is required for native API mode when EXPO_PUBLIC_DOMAIN is unavailable.",
  );
}

export function SamraRuntimeProvider({
  children,
}: PropsWithChildren): ReactElement {
  const runtime = useMemo<RuntimeResolution>(() => {
    try {
      const mode = parseSamraDataMode(
        process.env.EXPO_PUBLIC_SAMRA_DATA_MODE,
        "EXPO_PUBLIC_SAMRA_DATA_MODE",
      );
      if (mode === "api") {
        const apiOrigin = resolveMobileApiOrigin(
          process.env.EXPO_PUBLIC_API_ORIGIN,
          process.env.EXPO_PUBLIC_DOMAIN,
          Platform.OS,
        );
        setBaseUrl(apiOrigin);
      }

      const source = mode === "api" ? createApiSource() : legacyMockBoundary;
      return { mode, source };
    } catch (error) {
      return { error: toError(error) };
    }
  }, []);

  if (runtime.error) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <Text>Invalid Samra data configuration</Text>
        <Text>{runtime.error.message}</Text>
      </View>
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
