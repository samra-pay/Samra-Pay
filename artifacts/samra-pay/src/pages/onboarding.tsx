import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildOnboardingJourneyView,
  getCustomerConsentPresentation,
  type CustomerConsentType,
  type CustomerIdentityProviderDecision,
} from "@workspace/samra-client/onboarding";
import {
  useAdvanceDemoCustomerIdentity,
  useCustomerIdentityCase,
  useCustomerOnboarding,
  useResetDemoCustomerOnboarding,
  useSamraCustomerAcquisition,
  useSamraOnboardingRuntime,
  useStartCustomerIdentityVerification,
  useStartCustomerOnboarding,
  useSubmitCustomerConsents,
} from "@workspace/samra-client/react";
import {
  Alert,
  AlertDescription,
} from "@workspace/samra-pay-ds/components/ui/alert";
import { Badge } from "@workspace/samra-pay-ds/components/ui/badge";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import { Card } from "@workspace/samra-pay-ds/components/ui/card";
import { Checkbox } from "@workspace/samra-pay-ds/components/ui/checkbox";
import { Progress } from "@workspace/samra-pay-ds/components/ui/progress";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { SamraLogo } from "@/components/samra-logo";
import { consumePostLoginRedirect } from "@/lib/remittance-handoff";

const IDENTITY_STATES = new Set([
  "identity_in_progress",
  "identity_review",
  "identity_approved",
  "restricted",
]);

export default function CustomerOnboardingPage() {
  const runtime = useSamraOnboardingRuntime();
  const acquisition = useSamraCustomerAcquisition();
  const [, setLocation] = useLocation();
  const onboardingQuery = useCustomerOnboarding();
  const onboarding = onboardingQuery.data ?? null;
  const identityQuery = useCustomerIdentityCase(
    Boolean(onboarding && IDENTITY_STATES.has(onboarding.state)),
  );
  const identityCase = identityQuery.data ?? null;
  const journey = buildOnboardingJourneyView(onboarding, identityCase);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const commandKeys = useRef(new Map<string, string>());
  const [accepted, setAccepted] = useState<
    Partial<Record<CustomerConsentType, boolean>>
  >({});

  const startOnboarding = useStartCustomerOnboarding();
  const submitConsents = useSubmitCustomerConsents();
  const startIdentity = useStartCustomerIdentityVerification();
  const advanceIdentity = useAdvanceDemoCustomerIdentity();
  const resetDemo = useResetDemoCustomerOnboarding();

  useEffect(() => {
    void acquisition.recordOnce("signup_started");
  }, [acquisition]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [journey.stage]);

  useEffect(() => {
    setAccepted({});
  }, [onboarding?.consentBundle.bundleVersion]);

  const documents = onboarding?.consentBundle.documents ?? [];
  const allAccepted =
    documents.length > 0 &&
    documents.every((document) => accepted[document.consentType] === true);
  const mutationError =
    startOnboarding.error ??
    submitConsents.error ??
    startIdentity.error ??
    advanceIdentity.error ??
    resetDemo.error;
  const isMutating =
    startOnboarding.isPending ||
    submitConsents.isPending ||
    startIdentity.isPending ||
    advanceIdentity.isPending ||
    resetDemo.isPending;

  const stageContent = useMemo(() => {
    if (journey.stage === "welcome") {
      return (
        <PrimaryAction
          loading={startOnboarding.isPending}
          onClick={() =>
            startOnboarding.mutate(commandKey(commandKeys.current, "start"), {
              onSuccess: () => {
                commandKeys.current.delete("start");
                void acquisition.bind();
              },
            })
          }
        >
          Start onboarding
        </PrimaryAction>
      );
    }

    if (journey.stage === "consent" && onboarding) {
      return (
        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="sr-only">Required agreements</legend>
            {documents.map((document) => {
              const presentation = getCustomerConsentPresentation(
                document.consentType,
              );
              const checkboxId = `consent-${document.consentType}`;
              return (
                <div
                  key={document.consentType}
                  className="flex min-h-20 gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 transition-colors focus-within:border-primary/60"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={accepted[document.consentType] === true}
                    onCheckedChange={(checked) =>
                      setAccepted((current) => ({
                        ...current,
                        [document.consentType]: checked === true,
                      }))
                    }
                    className="mt-1"
                    aria-describedby={`${checkboxId}-description`}
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={checkboxId}
                      className="cursor-pointer text-sm font-semibold text-foreground"
                    >
                      I agree to the {presentation.title}
                    </label>
                    <p
                      id={`${checkboxId}-description`}
                      className="mt-1 text-sm leading-6 text-muted-foreground"
                    >
                      {presentation.summary}{" "}
                      {presentation.href ? (
                        <Link
                          href={presentation.href}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Read the document
                        </Link>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/75">
                      Version {document.documentVersion}
                    </p>
                  </div>
                </div>
              );
            })}
          </fieldset>
          <Alert className="border-primary/20 bg-primary/5">
            <LockKeyhole className="h-4 w-4" />
            <AlertDescription>
              This non-production bundle is recorded as immutable evidence. It
              does not create a wallet, balance, or transfer access.
            </AlertDescription>
          </Alert>
          <PrimaryAction
            disabled={!allAccepted}
            loading={submitConsents.isPending}
            onClick={() => {
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
                { onSuccess: () => commandKeys.current.delete("consents") },
              );
            }}
          >
            Accept and continue
          </PrimaryAction>
        </div>
      );
    }

    if (journey.stage === "identity_start") {
      return (
        <div className="space-y-4">
          <BoundaryList />
          <PrimaryAction
            loading={startIdentity.isPending}
            onClick={() =>
              startIdentity.mutate(
                commandKey(commandKeys.current, "identity-start"),
                {
                  onSuccess: () => commandKeys.current.delete("identity-start"),
                },
              )
            }
          >
            Begin identity verification
          </PrimaryAction>
        </div>
      );
    }

    if (
      (journey.stage === "identity_pending" ||
        journey.stage === "identity_review") &&
      identityCase
    ) {
      return (
        <div className="space-y-4">
          <StatusPanel
            icon={journey.stage === "identity_review" ? Clock3 : ShieldCheck}
          >
            Case {identityCase.identityCaseId.slice(-8)} · version{" "}
            {identityCase.version}
          </StatusPanel>
          {runtime.demoControls ? (
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Synthetic test controls
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                These buttons create normalized fake evidence only. They never
                contact Persona.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                {journey.stage === "identity_pending" ? (
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1"
                    disabled={advanceIdentity.isPending}
                    onClick={() =>
                      runDemoDecision(
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
                  variant="gold"
                  className="min-h-11 flex-1"
                  disabled={advanceIdentity.isPending}
                  onClick={() =>
                    runDemoDecision(
                      "approved",
                      identityCase.identityCaseId,
                      commandKeys.current,
                      advanceIdentity.mutate,
                    )
                  }
                >
                  Approve demo case
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => {
                void Promise.all([
                  onboardingQuery.refetch(),
                  identityQuery.refetch(),
                ]);
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh status
            </Button>
          )}
        </div>
      );
    }

    if (journey.stage === "identity_error") {
      return (
        <PrimaryAction
          loading={startIdentity.isPending}
          onClick={() =>
            startIdentity.mutate(
              commandKey(commandKeys.current, "identity-retry"),
              {
                onSuccess: () => commandKeys.current.delete("identity-retry"),
              },
            )
          }
        >
          Retry verification
        </PrimaryAction>
      );
    }

    if (journey.stage === "identity_approved") {
      return (
        <div className="space-y-4">
          <StatusPanel icon={CheckCircle2}>
            Identity evidence accepted. Account activation and wallet
            provisioning remain disabled.
          </StatusPanel>
          {runtime.mode === "mock" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setLocation(consumePostLoginRedirect())}
            >
              Continue to synthetic dashboard
            </Button>
          ) : (
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link href="/">Return to Samra Pay</Link>
            </Button>
          )}
        </div>
      );
    }

    if (
      journey.stage === "identity_declined" ||
      journey.stage === "restricted"
    ) {
      return (
        <div className="space-y-4">
          <StatusPanel icon={XCircle}>
            No financial capability was enabled. A reviewed support path is
            required before this onboarding can continue.
          </StatusPanel>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href="/">Return home</Link>
          </Button>
        </div>
      );
    }

    return (
      <StatusPanel icon={TriangleAlert}>
        This later onboarding capability is intentionally unavailable in the
        current alpha.
      </StatusPanel>
    );
  }, [
    accepted,
    acquisition,
    advanceIdentity,
    documents,
    identityCase,
    identityQuery,
    journey.stage,
    onboarding,
    onboardingQuery,
    runtime.demoControls,
    runtime.mode,
    setLocation,
    startIdentity,
    startOnboarding,
    submitConsents,
    allAccepted,
  ]);

  if (onboardingQuery.isLoading) {
    return <OnboardingLoading />;
  }

  const queryError = onboardingQuery.error ?? identityQuery.error;
  if (queryError) {
    return (
      <OnboardingFailure
        error={queryError}
        retrying={onboardingQuery.isFetching || identityQuery.isFetching}
        onRetry={() => {
          const retries: Promise<unknown>[] = [onboardingQuery.refetch()];
          if (identityQuery.error) retries.push(identityQuery.refetch());
          void Promise.all(retries);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" aria-label="Samra Pay home">
            <SamraLogo size="md" />
          </Link>
          <Badge variant="outline" className="border-primary/30 text-primary">
            {runtime.mode === "mock"
              ? "Synthetic onboarding"
              : "API onboarding"}
          </Badge>
        </header>

        <Card className="overflow-hidden border-white/10 bg-card/85 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span>{journey.eyebrow}</span>
              <span>{journey.progressPercent}%</span>
            </div>
            <Progress
              value={journey.progressPercent}
              aria-label={`Onboarding ${journey.progressPercent}% complete`}
              className="h-2"
            />
          </div>

          <div className="px-6 py-7 sm:px-8 sm:py-9">
            <div aria-live="polite">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-serif text-3xl leading-tight outline-none sm:text-4xl"
              >
                {journey.title}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                {journey.description}
              </p>
            </div>

            {mutationError ? (
              <Alert role="alert" variant="destructive" className="mt-6">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  {safeCustomerError(mutationError)}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-7" aria-busy={isMutating ? "true" : "false"}>
              {stageContent}
            </div>
          </div>
        </Card>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Samra Pay owns the onboarding record and capability decision. Provider
          responses are evidence, not account authority.
        </p>

        {runtime.mode === "mock" && runtime.demoControls?.reset ? (
          <div className="mt-4 text-center">
            <button
              type="button"
              className="min-h-11 px-4 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              disabled={resetDemo.isPending}
              onClick={() => resetDemo.mutate()}
            >
              Reset synthetic journey
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function PrimaryAction({
  children,
  loading,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="gold"
      className="min-h-12 w-full text-base"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <>
          <Loader2
            aria-hidden="true"
            className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none"
          />
          Saving…
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="ml-2 h-5 w-5" />
        </>
      )}
    </Button>
  );
}

function BoundaryList() {
  return (
    <ul className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-muted-foreground">
      <li className="flex gap-3">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
        />
        Samra stores only normalized case state and opaque provider references.
      </li>
      <li className="flex gap-3">
        <LockKeyhole
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
        />
        Identity documents and provider payloads do not enter the Samra ledger
        or audit log.
      </li>
    </ul>
  );
}

function StatusPanel({
  icon: Icon,
  children,
}: {
  icon: typeof ShieldCheck;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground"
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-primary"
      />
      <p className="leading-6">{children}</p>
    </div>
  );
}

function OnboardingLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div role="status" className="text-center">
        <Loader2
          aria-hidden="true"
          className="mx-auto h-8 w-8 animate-spin text-primary motion-reduce:animate-none"
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Resuming your onboarding…
        </p>
      </div>
    </main>
  );
}

function OnboardingFailure({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card
        role="alert"
        aria-live="assertive"
        className="w-full max-w-lg border-destructive/30 bg-card p-6"
      >
        <TriangleAlert
          aria-hidden="true"
          className="h-8 w-8 text-destructive"
        />
        <h1 className="mt-4 text-2xl font-semibold">
          Could not resume onboarding
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {safeCustomerError(error)}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5 min-h-11 w-full"
          disabled={retrying}
          onClick={onRetry}
        >
          <RefreshCcw
            aria-hidden="true"
            className={`mr-2 h-4 w-4 ${
              retrying ? "animate-spin motion-reduce:animate-none" : ""
            }`}
          />
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </Card>
    </main>
  );
}

function commandKey(keys: Map<string, string>, command: string): string {
  const existing = keys.get(command);
  if (existing) return existing;
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `${command}-${randomPart}`;
  keys.set(command, key);
  return key;
}

function runDemoDecision(
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
  if (status === 401) {
    return "Auth0 sign-in is required before connected onboarding can begin.";
  }
  if (status === 403) {
    return "This account cannot continue onboarding from its current state.";
  }
  if (status === 409) {
    return "Your onboarding changed in another session. Refresh to continue from the latest state.";
  }
  if (typeof status === "number" && status >= 500) {
    return "Samra onboarding is temporarily unavailable. Your saved server progress was not replaced with local data.";
  }
  return "We could not complete that step. Your saved progress is unchanged; retry when ready.";
}
