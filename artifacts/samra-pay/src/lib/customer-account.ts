import { useQuery } from "@tanstack/react-query";
import { useSamraOnboardingRuntime } from "@workspace/samra-client/react";

export function useCustomerAccount() {
  const { source, mode } = useSamraOnboardingRuntime();
  return useQuery({
    queryKey: ["samra", "onboarding", "account-access", mode],
    queryFn: () => source.getOnboarding(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
}
