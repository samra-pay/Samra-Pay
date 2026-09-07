import { useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Clock3, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@workspace/samra-pay-ds/components/ui/card";
import { useSamraOnboardingRuntime } from "@workspace/samra-client/react";
import { SamraLogo } from "@/components/samra-logo";
import { useCustomerAuth } from "@/lib/customer-auth";
import { useCustomerAccount } from "@/lib/customer-account";
import { customerSessionDestination } from "@/lib/customer-entry";

const WALLET_RECORD_STATES = new Set([
  "wallet_ready",
  "funding_ready",
  "activated",
]);

export default function CustomerAccountPage() {
  const auth = useCustomerAuth();
  const { mode } = useSamraOnboardingRuntime();
  const query = useCustomerAccount();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  // A cached record cannot establish current account access.
  const checking = query.isPending || query.isFetching;
  const destination = checking
    ? null
    : customerSessionDestination(query.data, query.error);
  const account = !signingOut && destination === "/account" ? query.data : null;

  const signOut = async () => {
    setSigningOut(true);
    setLogoutFailed(false);
    try {
      await auth.signOut();
    } catch {
      setLogoutFailed(true);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <SamraLogo size="md" />
          <Button
            variant="outline"
            className="min-h-11"
            disabled={signingOut && !logoutFailed}
            onClick={() => void signOut()}
          >
            {signingOut && !logoutFailed ? "Signing out…" : "Sign out"}
          </Button>
        </header>
        <p className="mb-4 text-sm text-muted-foreground">
          {mode === "mock" ? "Synthetic account preview" : "Private testing"}
          {" · No live financial access"}
        </p>
        <Card aria-busy={checking}>
          <CardHeader>
            <h1 className="font-serif text-3xl">Your Samra account</h1>
          </CardHeader>
          <CardContent className="space-y-6">
            {logoutFailed ? (
              <p role="alert">
                We couldn’t complete sign-out. Try signing out again.
              </p>
            ) : signingOut ? (
              <p role="status">Signing out…</p>
            ) : checking ? (
              <p role="status">Checking your account…</p>
            ) : account ? (
              <>
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-1 h-5 w-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="font-semibold">Account saved</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      You can sign out and return to this account with the same
                      sign-in method.
                    </p>
                  </div>
                </div>
                <dl>
                  <dt className="text-sm text-muted-foreground">
                    Account reference
                  </dt>
                  <dd className="mt-1 break-all font-mono">
                    •••• {account.customerId.slice(-8)}
                  </dd>
                </dl>
                <div className="flex items-start gap-3">
                  <Clock3
                    className="mt-1 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="font-semibold">
                      {WALLET_RECORD_STATES.has(account.state)
                        ? "Wallet record available"
                        : "Continue account setup"}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Live wallet creation and funding are not enabled. Your
                      saved account does not depend on completing verification
                      today.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="min-h-11">
                    <Link href="/onboarding">Review account setup</Link>
                  </Button>
                  {WALLET_RECORD_STATES.has(account.state) ? (
                    <Button asChild variant="outline" className="min-h-11">
                      <Link href="/wallet">View wallet record</Link>
                    </Button>
                  ) : null}
                </div>
              </>
            ) : destination === "/onboarding" ? (
              <>
                <p>No Samra account has been created for this sign-in yet.</p>
                <Button asChild className="min-h-11">
                  <Link href="/onboarding">Start account setup</Link>
                </Button>
              </>
            ) : (
              <div role="alert" className="flex items-start gap-3">
                <LockKeyhole
                  className="mt-1 h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  We couldn’t open your account. Try refreshing, or sign out and
                  use your invited account.
                </p>
              </div>
            )}
            {!signingOut ? (
              <Button
                variant="outline"
                className="min-h-11"
                disabled={checking}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Refresh account
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
