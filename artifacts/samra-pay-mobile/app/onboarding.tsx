import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildOnboardingJourneyView,
  getCustomerConsentPresentation,
  SYNTHETIC_WALLET_PROVISIONING_INPUT,
  type CustomerConsentType,
  type CustomerIdentityProviderDecision,
  type CustomerWalletSnapshot,
} from "@workspace/samra-client/onboarding";
import { parseSamraLegalPath } from "@workspace/samra-client/legal";
import {
  useAdvanceDemoCustomerIdentity,
  useCustomerIdentityCase,
  useCustomerOnboarding,
  useCustomerWallet,
  useResetDemoCustomerOnboarding,
  useSamraCustomerAcquisition,
  useSamraOnboardingRuntime,
  useStartCustomerIdentityVerification,
  useStartCustomerOnboarding,
  useStartCustomerWalletProvisioning,
  useSubmitCustomerConsents,
} from "@workspace/samra-client/react";
import { Button } from "@workspace/samra-pay-ds/components/native";
import { useColors } from "@workspace/samra-pay-ds/hooks/use-colors";
import { nativeTheme } from "@workspace/samra-pay-ds/lib/native-theme";

import { SamraLogo } from "@/components/SamraLogo";

const IDENTITY_STATES = new Set([
  "identity_in_progress",
  "identity_review",
  "identity_approved",
  "restricted",
]);

const WALLET_STATES = new Set([
  "identity_approved",
  "wallet_consent_pending",
  "wallet_provisioning",
  "wallet_ready",
  "restricted",
]);

export default function CustomerOnboardingScreen() {
  const colors = useColors("dark");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const runtime = useSamraOnboardingRuntime();
  const acquisition = useSamraCustomerAcquisition();
  const onboardingQuery = useCustomerOnboarding();
  const onboarding = onboardingQuery.data ?? null;
  const identityQuery = useCustomerIdentityCase(
    Boolean(onboarding && IDENTITY_STATES.has(onboarding.state)),
  );
  const identityCase = identityQuery.data ?? null;
  const walletQuery = useCustomerWallet(
    Boolean(onboarding && WALLET_STATES.has(onboarding.state)),
  );
  const wallet = walletQuery.data ?? null;
  const journey = buildOnboardingJourneyView(onboarding, identityCase, wallet);
  const [accepted, setAccepted] = useState<
    Partial<Record<CustomerConsentType, boolean>>
  >({});
  const [walletDisclosureAccepted, setWalletDisclosureAccepted] =
    useState(false);
  const commandKeys = useRef(new Map<string, string>());

  const startOnboarding = useStartCustomerOnboarding();
  const submitConsents = useSubmitCustomerConsents();
  const startIdentity = useStartCustomerIdentityVerification();
  const startWallet = useStartCustomerWalletProvisioning();
  const advanceIdentity = useAdvanceDemoCustomerIdentity();
  const resetDemo = useResetDemoCustomerOnboarding();
  const queryError =
    onboardingQuery.error ?? identityQuery.error ?? walletQuery.error;
  const mutationError =
    startOnboarding.error ??
    submitConsents.error ??
    startIdentity.error ??
    startWallet.error ??
    advanceIdentity.error ??
    resetDemo.error;

  useEffect(() => {
    void acquisition.recordOnce("signup_started");
  }, [acquisition]);

  useEffect(() => {
    setAccepted({});
  }, [onboarding?.consentBundle.bundleVersion]);

  useEffect(() => {
    setWalletDisclosureAccepted(false);
  }, [wallet?.walletId]);

  useEffect(() => {
    if (onboardingQuery.isLoading || walletQuery.isLoading || queryError)
      return;
    void AccessibilityInfo.announceForAccessibility(
      `${journey.title}. ${journey.description}`,
    );
  }, [
    journey.description,
    journey.title,
    onboardingQuery.isLoading,
    queryError,
    walletQuery.isLoading,
  ]);

  const documents = onboarding?.consentBundle.documents ?? [];
  const allAccepted =
    documents.length > 0 &&
    documents.every((document) => accepted[document.consentType] === true);
  if (onboardingQuery.isLoading || walletQuery.isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator
          accessibilityElementsHidden
          color={colors.primary}
          size="large"
        />
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.loadingText, { color: colors.mutedForeground }]}
        >
          Resuming your onboarding…
        </Text>
      </View>
    );
  }

  if (queryError) {
    return (
      <MobileOnboardingFailure
        error={queryError}
        retrying={
          onboardingQuery.isFetching ||
          identityQuery.isFetching ||
          walletQuery.isFetching
        }
        onRetry={() => {
          const retries: Promise<unknown>[] = [onboardingQuery.refetch()];
          if (identityQuery.error) retries.push(identityQuery.refetch());
          if (walletQuery.error) retries.push(walletQuery.refetch());
          void Promise.all(retries);
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <SamraLogo size="md" />
          <View
            style={[
              styles.modeBadge,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
          >
            <Text style={[styles.modeBadgeText, { color: colors.primary }]}>
              {runtime.mode === "mock" ? "SYNTHETIC" : "API"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.progressHeader}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
              {journey.eyebrow}
            </Text>
            <Text style={[styles.progressValue, { color: colors.primary }]}>
              {journey.progressPercent}%
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Customer onboarding progress"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: journey.progressPercent,
            }}
            style={[styles.progressTrack, { backgroundColor: colors.muted }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${journey.progressPercent}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>

          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={[styles.title, { color: colors.foreground }]}
          >
            {journey.title}
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {journey.description}
          </Text>

          {mutationError ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={[
                styles.errorPanel,
                {
                  borderColor: colors.destructive,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <Feather
                name="alert-triangle"
                size={18}
                color={colors.destructiveForeground}
              />
              <Text
                style={[
                  styles.errorText,
                  { color: colors.destructiveForeground },
                ]}
              >
                {safeCustomerError(mutationError)}
              </Text>
            </View>
          ) : null}

          <View
            accessibilityState={{
              busy:
                startOnboarding.isPending ||
                submitConsents.isPending ||
                startIdentity.isPending ||
                startWallet.isPending ||
                advanceIdentity.isPending ||
                resetDemo.isPending,
            }}
            style={styles.stageContent}
          >
            {journey.stage === "welcome" ? (
              <Button
                accessibilityLabel={
                  runtime.mode === "mock"
                    ? "Start synthetic customer onboarding"
                    : "Start customer onboarding"
                }
                size="lg"
                loading={startOnboarding.isPending}
                onPress={() =>
                  startOnboarding.mutate(
                    commandKey(commandKeys.current, "start"),
                    {
                      onSuccess: () => {
                        commandKeys.current.delete("start");
                        void acquisition.bind();
                      },
                    },
                  )
                }
              >
                Start onboarding
              </Button>
            ) : null}

            {journey.stage === "consent" && onboarding ? (
              <View style={styles.stack}>
                {documents.map((document) => {
                  const presentation = getCustomerConsentPresentation(
                    document.consentType,
                  );
                  const checked = accepted[document.consentType] === true;
                  return (
                    <View
                      key={document.consentType}
                      style={[
                        styles.consentRow,
                        {
                          borderColor: checked ? colors.primary : colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        accessibilityLabel={`Accept ${presentation.title}`}
                        onPress={() =>
                          setAccepted((current) => ({
                            ...current,
                            [document.consentType]: !checked,
                          }))
                        }
                        style={({ pressed }) => [
                          styles.consentChoice,
                          { opacity: pressed ? 0.8 : 1 },
                        ]}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: checked
                                ? colors.primary
                                : colors.mutedForeground,
                              backgroundColor: checked
                                ? colors.primary
                                : "transparent",
                            },
                          ]}
                        >
                          {checked ? (
                            <Feather
                              name="check"
                              size={14}
                              color={colors.primaryForeground}
                            />
                          ) : null}
                        </View>
                        <View style={styles.consentCopy}>
                          <Text
                            style={[
                              styles.consentTitle,
                              { color: colors.foreground },
                            ]}
                          >
                            I agree to the {presentation.title}
                          </Text>
                          <Text
                            style={[
                              styles.consentSummary,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {presentation.summary}
                          </Text>
                          <Text
                            style={[
                              styles.version,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            Version {document.documentVersion}
                          </Text>
                        </View>
                      </Pressable>
                      {presentation.href ? (
                        <Pressable
                          accessibilityRole="link"
                          accessibilityLabel={`Read ${presentation.title}`}
                          accessibilityHint="Opens the non-production document"
                          onPress={() => {
                            const legalKind = parseSamraLegalPath(
                              presentation.href,
                            );
                            if (legalKind) {
                              router.push(`/legal/${legalKind}` as Href);
                            }
                          }}
                          style={({ pressed }) => [
                            styles.legalLink,
                            { opacity: pressed ? 0.7 : 1 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.legalLinkText,
                              { color: colors.primary },
                            ]}
                          >
                            Read the document
                          </Text>
                          <Feather
                            accessibilityElementsHidden
                            name="arrow-up-right"
                            size={15}
                            color={colors.primary}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
                <BoundaryNotice />
                <Button
                  accessibilityLabel="Accept all selected agreements and continue"
                  size="lg"
                  disabled={!allAccepted}
                  loading={submitConsents.isPending}
                  onPress={() => {
                    const key = commandKey(commandKeys.current, "consents");
                    submitConsents.mutate(
                      {
                        idempotencyKey: key,
                        input: {
                          bundleVersion: onboarding.consentBundle.bundleVersion,
                          locale: onboarding.consentBundle.locale,
                          decisions: documents.map((document) => ({
                            consentType: document.consentType,
                            documentVersion: document.documentVersion,
                            decision: "accepted" as const,
                          })),
                        },
                      },
                      {
                        onSuccess: () => commandKeys.current.delete("consents"),
                      },
                    );
                  }}
                >
                  Accept and continue
                </Button>
              </View>
            ) : null}

            {journey.stage === "identity_start" ? (
              <View style={styles.stack}>
                <BoundaryNotice />
                <Button
                  accessibilityLabel="Begin identity verification"
                  size="lg"
                  loading={startIdentity.isPending}
                  onPress={() =>
                    startIdentity.mutate(
                      commandKey(commandKeys.current, "identity-start"),
                      {
                        onSuccess: () =>
                          commandKeys.current.delete("identity-start"),
                      },
                    )
                  }
                >
                  Begin identity verification
                </Button>
              </View>
            ) : null}

            {(journey.stage === "identity_pending" ||
              journey.stage === "identity_review") &&
            identityCase ? (
              <View style={styles.stack}>
                <StatusNotice
                  text={`Case ${identityCase.identityCaseId.slice(-8)} · version ${identityCase.version}`}
                />
                {runtime.demoControls ? (
                  <View
                    style={[
                      styles.demoControls,
                      {
                        borderColor: colors.primary,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    <Text style={[styles.demoLabel, { color: colors.primary }]}>
                      SYNTHETIC TEST CONTROLS
                    </Text>
                    <Text
                      style={[
                        styles.demoDescription,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      These actions create fake normalized evidence and never
                      contact Persona.
                    </Text>
                    {journey.stage === "identity_pending" ? (
                      <Button
                        accessibilityLabel="Move synthetic identity case to review"
                        variant="outline"
                        loading={advanceIdentity.isPending}
                        onPress={() =>
                          advanceDemoDecision(
                            "review",
                            identityCase.identityCaseId,
                            commandKeys.current,
                            advanceIdentity.mutate,
                          )
                        }
                      >
                        Send to review
                      </Button>
                    ) : null}
                    <Button
                      accessibilityLabel="Approve synthetic identity case"
                      loading={advanceIdentity.isPending}
                      onPress={() =>
                        advanceDemoDecision(
                          "approved",
                          identityCase.identityCaseId,
                          commandKeys.current,
                          advanceIdentity.mutate,
                        )
                      }
                    >
                      Approve demo case
                    </Button>
                  </View>
                ) : (
                  <Button
                    accessibilityLabel="Refresh identity verification status"
                    variant="outline"
                    onPress={() => {
                      void Promise.all([
                        onboardingQuery.refetch(),
                        identityQuery.refetch(),
                      ]);
                    }}
                  >
                    Refresh status
                  </Button>
                )}
              </View>
            ) : null}

            {journey.stage === "identity_error" ? (
              <Button
                accessibilityLabel="Retry identity verification"
                size="lg"
                loading={startIdentity.isPending}
                onPress={() =>
                  startIdentity.mutate(
                    commandKey(commandKeys.current, "identity-retry"),
                    {
                      onSuccess: () =>
                        commandKeys.current.delete("identity-retry"),
                    },
                  )
                }
              >
                Retry verification
              </Button>
            ) : null}

            {journey.stage === "wallet_consent" ? (
              <View style={styles.stack}>
                <WalletDisclosureNotice
                  accepted={walletDisclosureAccepted}
                  onAcceptedChange={setWalletDisclosureAccepted}
                />
                <Button
                  accessibilityLabel="Create synthetic USDC wallet"
                  accessibilityHint="Records the non-production wallet disclosure and starts idempotent synthetic provisioning"
                  size="lg"
                  disabled={!walletDisclosureAccepted}
                  loading={startWallet.isPending}
                  onPress={() => {
                    const key = commandKey(commandKeys.current, "wallet-start");
                    startWallet.mutate(
                      {
                        input: SYNTHETIC_WALLET_PROVISIONING_INPUT,
                        idempotencyKey: key,
                      },
                      {
                        onSuccess: () =>
                          commandKeys.current.delete("wallet-start"),
                      },
                    );
                  }}
                >
                  Create synthetic wallet
                </Button>
              </View>
            ) : null}

            {journey.stage === "wallet_provisioning" ? (
              <View style={styles.stack}>
                <StatusNotice text="The durable Samra wallet record is waiting for its normalized provider result. No balance or funding access exists." />
                <Button
                  accessibilityLabel="Refresh wallet status"
                  variant="outline"
                  size="lg"
                  loading={walletQuery.isFetching}
                  onPress={() => {
                    void Promise.all([
                      onboardingQuery.refetch(),
                      walletQuery.refetch(),
                    ]);
                  }}
                >
                  Refresh wallet status
                </Button>
              </View>
            ) : null}

            {journey.stage === "wallet_error" ? (
              <View style={styles.stack}>
                <StatusNotice text="No second wallet was created. Retry reuses the same safe command after the temporary failure clears." />
                <Button
                  accessibilityLabel="Retry synthetic wallet setup"
                  size="lg"
                  loading={startWallet.isPending}
                  onPress={() =>
                    startWallet.mutate({
                      input: SYNTHETIC_WALLET_PROVISIONING_INPUT,
                      idempotencyKey: commandKey(
                        commandKeys.current,
                        "wallet-start",
                      ),
                    })
                  }
                >
                  Retry wallet setup
                </Button>
              </View>
            ) : null}

            {journey.stage === "wallet_ready" && wallet ? (
              <View style={styles.stack}>
                <WalletStatusSummary wallet={wallet} />
                {runtime.mode === "mock" ? (
                  <Button
                    accessibilityLabel="Continue to the synthetic Samra dashboard"
                    variant="outline"
                    size="lg"
                    onPress={() => router.replace("/(tabs)")}
                  >
                    Continue to synthetic dashboard
                  </Button>
                ) : (
                  <Button
                    accessibilityLabel="Return to Samra Pay"
                    variant="outline"
                    size="lg"
                    onPress={() => router.replace("/login")}
                  >
                    Return to Samra Pay
                  </Button>
                )}
              </View>
            ) : null}

            {journey.stage === "identity_declined" ||
            journey.stage === "restricted" ? (
              <StatusNotice text="No financial capability was enabled. A reviewed support path is required." />
            ) : null}
          </View>
        </View>

        <Text style={[styles.truthNote, { color: colors.mutedForeground }]}>
          Samra owns the onboarding record and capability decision. Provider
          responses are evidence, not account authority.
        </Text>

        {runtime.mode === "mock" && runtime.demoControls?.reset ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset synthetic onboarding journey"
            disabled={resetDemo.isPending}
            onPress={() => resetDemo.mutate()}
            style={styles.resetButton}
          >
            <Text style={[styles.resetText, { color: colors.mutedForeground }]}>
              Reset synthetic journey
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function BoundaryNotice() {
  const colors = useColors("dark");
  return (
    <View
      style={[
        styles.notice,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Feather name="shield" size={18} color={colors.primary} />
      <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
        This non-production flow creates no account, wallet, balance, or
        transfer access.
      </Text>
    </View>
  );
}

function WalletDisclosureNotice({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const colors = useColors("dark");
  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.notice,
          { borderColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Feather name="shield" size={18} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
          Crossmint is isolated behind Samra’s adapter. This alpha creates a
          synthetic USDC record only—no tokens, public address, balance,
          funding, remittance, withdrawal, or live financial access.
        </Text>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel="I understand this is a synthetic wallet"
        accessibilityHint="Records disclosure version alpha-wallet-non-production-v1"
        onPress={() => onAcceptedChange(!accepted)}
        style={({ pressed }) => [
          styles.walletDisclosure,
          {
            borderColor: accepted ? colors.primary : colors.border,
            backgroundColor: colors.background,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: accepted ? colors.primary : colors.mutedForeground,
              backgroundColor: accepted ? colors.primary : "transparent",
            },
          ]}
        >
          {accepted ? (
            <Feather name="check" size={14} color={colors.primaryForeground} />
          ) : null}
        </View>
        <View style={styles.consentCopy}>
          <Text style={[styles.consentTitle, { color: colors.foreground }]}>
            I understand this is a synthetic wallet
          </Text>
          <Text
            style={[styles.consentSummary, { color: colors.mutedForeground }]}
          >
            Record the versioned disclosure and begin idempotent synthetic
            provisioning.
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function WalletStatusSummary({ wallet }: { wallet: CustomerWalletSnapshot }) {
  const colors = useColors("dark");
  return (
    <View style={styles.stack}>
      <StatusNotice
        text={`Synthetic wallet ${wallet.walletId.slice(-8)} is ready. Samra owns its normalized state and provider mapping.`}
      />
      <View
        accessibilityLabel={`${wallet.asset} synthetic wallet. Provider ${wallet.provider}. Financial access disabled.`}
        style={[
          styles.walletSummary,
          { borderColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <WalletSummaryRow label="Asset configuration" value={wallet.asset} />
        <WalletSummaryRow label="Provider adapter" value={wallet.provider} />
        <WalletSummaryRow
          label="Environment"
          value={wallet.network ?? "synthetic"}
        />
        <WalletSummaryRow label="Financial access" value="Disabled" />
      </View>
    </View>
  );
}

function WalletSummaryRow({ label, value }: { label: string; value: string }) {
  const colors = useColors("dark");
  return (
    <View style={styles.walletSummaryRow}>
      <Text
        style={[styles.walletSummaryLabel, { color: colors.mutedForeground }]}
      >
        {label}
      </Text>
      <Text style={[styles.walletSummaryValue, { color: colors.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

function StatusNotice({ text }: { text: string }) {
  const colors = useColors("dark");
  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        { borderColor: colors.primary, backgroundColor: colors.background },
      ]}
    >
      <Feather name="check-circle" size={18} color={colors.primary} />
      <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
        {text}
      </Text>
    </View>
  );
}

function MobileOnboardingFailure({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const colors = useColors("dark");
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.centered, { backgroundColor: colors.background }]}
    >
      <Feather
        accessibilityElementsHidden
        name="alert-triangle"
        size={30}
        color={colors.destructiveForeground}
      />
      <Text style={[styles.failureTitle, { color: colors.foreground }]}>
        Could not resume onboarding
      </Text>
      <Text
        style={[styles.failureDescription, { color: colors.mutedForeground }]}
      >
        {safeCustomerError(error)}
      </Text>
      <Button
        accessibilityLabel="Retry onboarding"
        variant="outline"
        size="lg"
        loading={retrying}
        onPress={onRetry}
        style={styles.retryButton}
      >
        Retry
      </Button>
    </View>
  );
}

function commandKey(keys: Map<string, string>, command: string): string {
  const existing = keys.get(command);
  if (existing) return existing;
  const key = `${command}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  keys.set(command, key);
  return key;
}

function advanceDemoDecision(
  decision: CustomerIdentityProviderDecision,
  identityCaseId: string,
  keys: Map<string, string>,
  mutate: (
    input: {
      identityCaseId: string;
      decision: CustomerIdentityProviderDecision;
      idempotencyKey: string;
    },
    options?: { onSuccess?: () => void },
  ) => void,
) {
  const command = `identity-${decision}`;
  mutate(
    {
      identityCaseId,
      decision,
      idempotencyKey: commandKey(keys, command),
    },
    { onSuccess: () => keys.delete(command) },
  );
}

function safeCustomerError(error: unknown): string {
  const status =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 401)
    return "Auth0 sign-in is required before onboarding can begin.";
  if (status === 403)
    return "This account cannot continue from its current state.";
  if (status === 409)
    return "Your onboarding changed elsewhere. Refresh and try again.";
  if (typeof status === "number" && status >= 500) {
    return "Onboarding is temporarily unavailable. Saved server progress was not replaced.";
  }
  return "That step could not be completed. Saved progress is unchanged.";
}

const font = nativeTheme.fontFamily;

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { marginTop: 14, fontFamily: font.sans.regular, fontSize: 14 },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  modeBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modeBadgeText: {
    fontFamily: font.sans.semibold,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  card: { borderWidth: 1, borderRadius: 20, padding: 22 },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  eyebrow: { fontFamily: font.sans.semibold, fontSize: 11, letterSpacing: 1.2 },
  progressValue: { fontFamily: font.sans.semibold, fontSize: 12 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  title: {
    fontFamily: font.serif.semibold,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 28,
  },
  description: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  stageContent: { marginTop: 24 },
  stack: { gap: 14 },
  consentRow: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  consentChoice: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  consentCopy: { flex: 1 },
  walletDisclosure: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  consentTitle: {
    fontFamily: font.sans.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  consentSummary: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  version: { fontFamily: font.sans.regular, fontSize: 10, marginTop: 6 },
  legalLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginLeft: 36,
    marginTop: 6,
  },
  legalLinkText: {
    fontFamily: font.sans.semibold,
    fontSize: 12,
    textDecorationLine: "underline",
  },
  notice: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  walletSummary: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  walletSummaryRow: {
    minHeight: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  walletSummaryLabel: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 12,
  },
  walletSummaryValue: {
    fontFamily: font.sans.semibold,
    fontSize: 12,
    textTransform: "capitalize",
  },
  errorPanel: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  demoControls: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  demoLabel: {
    fontFamily: font.sans.semibold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  demoDescription: {
    fontFamily: font.sans.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  truthNote: {
    fontFamily: font.sans.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 18,
    paddingHorizontal: 12,
  },
  resetButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  resetText: {
    fontFamily: font.sans.medium,
    fontSize: 12,
    textDecorationLine: "underline",
  },
  failureTitle: {
    fontFamily: font.serif.semibold,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 18,
    textAlign: "center",
  },
  failureDescription: {
    fontFamily: font.sans.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 420,
    textAlign: "center",
  },
  retryButton: { alignSelf: "stretch", marginTop: 22 },
});
