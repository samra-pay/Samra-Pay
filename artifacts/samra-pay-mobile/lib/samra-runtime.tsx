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
import {
  CustomerAcquisitionTracker,
  DISABLED_CUSTOMER_ACQUISITION_CLIENT,
  directCustomerAcquisitionAttribution,
} from "@workspace/samra-client/acquisition";
import { SyntheticSamraOnboardingSource } from "@workspace/samra-client/onboarding";
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

import type { MobileDataMode, MobileRuntimeConfig } from "@/lib/runtime-config";
import { createMobileAcquisitionSessionStore } from "@/lib/acquisition-session";

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
  const onboardingSource = useMemo(
    () =>
      config.dataMode === "api"
        ? new GeneratedSamraOnboardingSource()
        : new SyntheticSamraOnboardingSource(),
    [config.dataMode],
  );
  const acquisitionClient = useMemo(
    () =>
      config.dataMode === "api"
        ? new CustomerAcquisitionTracker({
            platform: "mobile",
            attribution: directCustomerAcquisitionAttribution(),
            transport: new GeneratedCustomerAcquisitionTransport(),
            sessionStore: createMobileAcquisitionSessionStore(),
          })
        : DISABLED_CUSTOMER_ACQUISITION_CLIENT,
    [config.dataMode],
  );

  return (
    <MobileDataModeContext.Provider value={config.dataMode}>
      <SamraCustomerAcquisitionProvider client={acquisitionClient}>
        <SamraDataSourceProvider source={source}>
          <SamraOnboardingSourceProvider
            mode={config.dataMode}
            source={onboardingSource}
            demoControls={config.dataMode === "mock" ? onboardingSource : null}
          >
            {children}
          </SamraOnboardingSourceProvider>
        </SamraDataSourceProvider>
      </SamraCustomerAcquisitionProvider>
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
