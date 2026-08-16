import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plane,
  RefreshCw,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { Link } from "wouter";
import {
  useAccounts,
  useActivity,
  useCurrentCustomer,
} from "@workspace/samra-client/react";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/samra-pay-ds/components/ui/card";
import { cn } from "@workspace/samra-pay-ds/lib/utils";

import { PageTransition } from "@/components/page-transition";
import {
  accountBalancePresentation,
  activityAmountPresentation,
} from "@/lib/dashboard-api-model";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The Samra API request could not be completed.";
}

function ErrorPanel({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-5"
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Backend data unavailable</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {errorMessage(error)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 border-destructive/30"
            disabled={retrying}
            onClick={onRetry}
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", retrying && "animate-spin")}
            />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <Card className="border-primary/20 bg-card/30 shadow-2xl">
      <CardContent className="flex min-h-72 items-center justify-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading ledger-derived account data…
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiDashboard() {
  const customerQuery = useCurrentCustomer();
  const accountsQuery = useAccounts();
  const primaryAccount = accountsQuery.data?.find(
    (account) =>
      account.kind === "domestic" &&
      account.currency === "USD" &&
      account.status === "active",
  );
  const activityQuery = useActivity(
    primaryAccount ? { accountId: primaryAccount.id, limit: 8 } : { limit: 8 },
  );

  const initialError = customerQuery.error ?? accountsQuery.error;
  const initialLoading = customerQuery.isLoading || accountsQuery.isLoading;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-8 pb-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-serif">Overview</h1>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
                Synthetic data · API mode
              </span>
            </div>
            <p
              className="-mt-0.5 text-xl leading-relaxed text-primary/60 font-ethiopic"
              lang="am"
            >
              ድምር ዕይታ
            </p>
            <p className="mt-1 font-light text-muted-foreground">
              {customerQuery.data
                ? `Welcome back, ${customerQuery.data.displayName}. This snapshot comes from the Samra backend.`
                : "Your backend financial snapshot is loading."}
            </p>
          </div>
          <div className="flex w-full gap-3 overflow-x-auto pb-2 md:w-auto md:pb-0">
            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0 rounded-xl border-white/10 bg-card/50 px-6"
              disabled
              title="Receiving funds is outside the current synthetic API scope"
            >
              <ArrowDownLeft className="mr-2 h-4 w-4 text-eucalyptus" />
              Receive
            </Button>
            <Button
              asChild
              variant="gold"
              className="h-12 shrink-0 rounded-xl px-6 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
            >
              <Link href="/dashboard/remittance">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Send money
              </Link>
            </Button>
          </div>
        </div>

        {initialLoading ? <LoadingPanel /> : null}

        {initialError ? (
          <Card className="border-primary/20 bg-card/30 shadow-2xl">
            <CardContent className="pt-6">
              <ErrorPanel
                error={initialError}
                retrying={customerQuery.isFetching || accountsQuery.isFetching}
                onRetry={() => {
                  void customerQuery.refetch();
                  void accountsQuery.refetch();
                }}
              />
            </CardContent>
          </Card>
        ) : null}

        {!initialLoading && !initialError ? (
          <>
            <div>
              <div className="mb-4 flex items-end justify-between">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-lg font-serif">Accounts</h2>
                  <span
                    className="hidden text-sm leading-relaxed text-muted-foreground/50 font-ethiopic sm:inline"
                    lang="am"
                  >
                    ሂሳቦች
                  </span>
                  <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60 sm:inline">
                    {accountsQuery.data?.length ?? 0} backend account
                    {(accountsQuery.data?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {(accountsQuery.data?.length ?? 0) === 0 ? (
                <Card className="border-white/5 bg-card/30">
                  <CardContent className="py-10 text-center">
                    <Wallet className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-3 font-medium">
                      No synthetic account is available.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      API mode will not substitute a local balance.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {accountsQuery.data?.map((account) => {
                    const balance = accountBalancePresentation(account);
                    return (
                      <Card
                        key={account.id}
                        data-testid={`api-account-${account.id}`}
                        className="group relative overflow-hidden border-white/5 bg-card/30 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20"
                      >
                        <div className="absolute -left-10 -top-10 h-44 w-44 rounded-full bg-gradient-to-br from-[#2D2D3F]/40 to-transparent opacity-60 blur-3xl" />
                        <div className="relative z-10">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {account.displayName}
                            </span>
                            <span className="font-mono text-[10px] tracking-widest text-white/25">
                              •••• {account.last4}
                            </span>
                          </div>
                          <div className="mt-5 flex items-baseline gap-2">
                            <span className="text-[28px] font-serif leading-none text-white/95 tabular-nums">
                              {balance.available}
                            </span>
                            <span className="text-[10px] uppercase tracking-widest text-white/30">
                              Available
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Book balance {balance.book}</span>
                            <span className="capitalize">{account.status}</span>
                          </div>
                          <p className="mt-4 text-[11px] text-eucalyptus">
                            Ledger-derived · no browser balance counter
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <Card className="border-white/5 bg-card/30 shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <CardTitle className="text-lg font-serif">
                    Recent Activity
                  </CardTitle>
                  <p
                    className="mt-0.5 text-sm leading-relaxed text-muted-foreground/50 font-ethiopic"
                    lang="am"
                  >
                    የቅርብ ጊዜ ግብይቶች
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={activityQuery.isFetching}
                  onClick={() => void activityQuery.refetch()}
                >
                  <RefreshCw
                    className={cn(
                      "mr-2 h-4 w-4",
                      activityQuery.isFetching && "animate-spin",
                    )}
                  />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="px-0 pb-0 pt-4">
                {activityQuery.error ? (
                  <div className="px-6 pb-5">
                    <ErrorPanel
                      error={activityQuery.error}
                      retrying={activityQuery.isFetching}
                      onRetry={() => void activityQuery.refetch()}
                    />
                  </div>
                ) : null}

                {!activityQuery.error && activityQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                    Loading backend activity…
                  </div>
                ) : null}

                {!activityQuery.error &&
                !activityQuery.isLoading &&
                (activityQuery.data?.items.length ?? 0) === 0 ? (
                  <div className="py-12 text-center">
                    <CircleCheck className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-3 font-medium">No activity yet.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Completed backend ledger activity will appear here.
                    </p>
                  </div>
                ) : null}

                <div className="divide-y divide-white/5">
                  {activityQuery.data?.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/5">
                          {item.category === "refund" ? (
                            <RotateCcw className="h-5 w-5 text-primary" />
                          ) : item.category === "deposit" ? (
                            <Wallet className="h-5 w-5 text-eucalyptus" />
                          ) : (
                            <Plane className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white/90">
                            {item.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <time>
                              {new Date(item.occurredAt).toLocaleString()}
                            </time>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span className="text-[9px] uppercase tracking-widest">
                              {item.category}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span className="capitalize">{item.status}</span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "ml-4 whitespace-nowrap font-mono text-base font-medium md:text-lg",
                          item.direction === "credit"
                            ? "text-eucalyptus"
                            : "text-white/90",
                        )}
                      >
                        {activityAmountPresentation(item)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
