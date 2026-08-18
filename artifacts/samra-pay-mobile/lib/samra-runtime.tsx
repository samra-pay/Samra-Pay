import React, {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import {
  ApiSamraDataSource,
  type SamraDataSource,
} from "@workspace/samra-client";
import { createGeneratedSamraTransport } from "@workspace/samra-client/generated-transport";
import { SamraDataSourceProvider } from "@workspace/samra-client/react";

import type { MobileDataMode, MobileRuntimeConfig } from "@/lib/runtime-config";

const MobileDataModeContext = createContext<MobileDataMode | null>(null);

function unavailableLegacyMethod(): Promise<never> {
  return Promise.reject(
    new Error(
      "The legacy mobile UI does not expose mock financial data through SamraDataSource.",
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

export function MobileSamraRuntimeProvider({
  config,
  children,
}: PropsWithChildren<{ config: MobileRuntimeConfig }>) {
  const source = useMemo(
    () =>
      config.dataMode === "api"
        ? new ApiSamraDataSource(createGeneratedSamraTransport())
        : legacyMockBoundary,
    [config.dataMode],
  );

  return (
    <MobileDataModeContext.Provider value={config.dataMode}>
      <SamraDataSourceProvider source={source}>
        {children}
      </SamraDataSourceProvider>
    </MobileDataModeContext.Provider>
  );
}

export function useMobileDataMode(): MobileDataMode {
  const mode = useContext(MobileDataModeContext);
  if (!mode)
    throw new Error(
      "MobileSamraRuntimeProvider is missing from the application boundary.",
    );
  return mode;
}
