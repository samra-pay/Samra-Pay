// Dashboard composition adapted from Crossmint's fintech starter.
// See licenses/crossmint-fintech-starter.txt for provenance and license.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSamraOnboardingRuntime } from "@workspace/samra-client/react";
import type { CustomerWalletSnapshot } from "@workspace/samra-client/onboarding";
import { Button } from "@workspace/samra-pay-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/samra-pay-ds/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@workspace/samra-pay-ds/components/ui/dialog";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Copy,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Link } from "wouter";
import { SamraLogo } from "@/components/samra-logo";
import { useCustomerAuth } from "@/lib/customer-auth";

const WALLET_STATES = new Set([
  "wallet_provisioning",
  "wallet_ready",
  "funding_ready",
  "activated",
]);

export default function CustomerWalletPage() {
  const auth = useCustomerAuth();
  const { source, mode } = useSamraOnboardingRuntime();
  const query = useQuery({
    queryKey: ["samra", "wallet-overview", mode],
    queryFn: async () => {
      // Revalidate account access before reading the authenticated customer's
      // mapping. No customer ID or wallet address is accepted from the browser.
      const onboarding = await source.getOnboarding();
      if (!onboarding || !WALLET_STATES.has(onboarding.state)) return null;
      return source.getWallet();
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  // Never show a cached address while access is being revalidated or after a
  // failed refresh. A ready mapping does not authorize financial operations.
  const checking =
    query.isPending || query.isFetching || !query.isFetchedAfterMount;
  const wallet = !checking && !query.isError ? query.data : null;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" aria-label="Samra Pay home">
            <SamraLogo size="md" />
          </Link>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link href="/onboarding">Account setup</Link>
            </Button>
            <Button variant="outline" onClick={() => void auth.signOut()}>
              Log out
            </Button>
          </div>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl">Your wallet</h1>
            <p className="mt-2 text-muted-foreground">
              View your wallet details and setup status.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
            Refresh wallet
          </Button>
        </div>
        {query.isError && !query.isFetching ? (
          <Card>
            <CardContent className="space-y-3 pt-6" role="alert">
              <LockKeyhole aria-hidden="true" className="h-6 w-6" />
              <h2 className="font-medium">Wallet unavailable</h2>
              <p className="text-muted-foreground">
                We couldn’t verify access to your wallet. Refresh to try again,
                or return to account setup.
              </p>
            </CardContent>
          </Card>
        ) : checking ? (
          <Card>
            <CardContent
              className="flex min-h-64 items-center justify-center gap-3"
              role="status"
              aria-busy="true"
            >
              <LoaderCircle
                aria-hidden="true"
                className="h-5 w-5 animate-spin motion-reduce:animate-none"
              />
              {query.isPaused
                ? "You are offline. Reconnect to check your wallet."
                : "Checking your wallet…"}
            </CardContent>
          </Card>
        ) : wallet ? (
          <WalletOverview
            key={`${wallet.walletId}:${wallet.version}`}
            wallet={wallet}
            mock={mode === "mock"}
          />
        ) : (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Wallet aria-hidden="true" className="h-7 w-7 text-primary" />
              <h2 className="font-serif text-2xl">
                Wallet setup is not complete
              </h2>
              <p className="text-muted-foreground">
                Return to account setup to review your next step.
              </p>
              <Button asChild>
                <Link href="/onboarding">Continue account setup</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function WalletOverview({
  wallet,
  mock,
}: {
  wallet: CustomerWalletSnapshot;
  mock: boolean;
}) {
  const ready = wallet.state === "ready";
  const restricted = wallet.state === "restricted" || wallet.state === "error";
  const status = restricted
    ? "Wallet access unavailable"
    : ready
      ? "Wallet record ready"
      : "Wallet setup in progress";
  const StatusIcon = restricted ? LockKeyhole : ready ? CheckCircle2 : Clock3;
  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
        {mock || wallet.synthetic
          ? "Synthetic wallet preview"
          : "Staging wallet · test network only"}
      </p>
      <Card className="border-primary">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wallet aria-hidden="true" className="h-6 w-6 text-primary" />
            <CardTitle className="font-serif text-2xl">USDC wallet</CardTitle>
          </div>
          {ready ? <WalletDetails wallet={wallet} /> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Available balance · USDC
            </p>
            <p className="mt-2 font-serif text-4xl">Unavailable</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Balance information is not available for this wallet yet.
            </p>
          </div>
          <p className="flex items-center gap-2 text-sm" role="status">
            <StatusIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {status}
          </p>
          <div
            className="flex flex-wrap gap-3"
            aria-describedby="wallet-actions-unavailable"
          >
            <Button disabled aria-describedby="wallet-actions-unavailable">
              <ArrowDownLeft aria-hidden="true" className="mr-2 h-4 w-4" />
              Add money
            </Button>
            <Button
              disabled
              variant="outline"
              aria-describedby="wallet-actions-unavailable"
            >
              <ArrowUpRight aria-hidden="true" className="mr-2 h-4 w-4" />
              Send
            </Button>
          </div>
          <p
            id="wallet-actions-unavailable"
            className="text-sm text-muted-foreground"
          >
            Deposits and transfers are unavailable. Do not send funds to this
            wallet.
          </p>
          {wallet.nextAllowedActions.includes("await_customer_signer_setup") ? (
            <p className="text-sm">Customer signing setup is still required.</p>
          ) : null}
          {restricted ? (
            <Button asChild variant="outline">
              <Link href="/onboarding">Review account setup</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Wallet activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-8">
          <p className="flex items-center gap-2">
            <Clock3
              aria-hidden="true"
              className="h-5 w-5 text-muted-foreground"
            />
            Activity unavailable
          </p>
          <p className="text-sm text-muted-foreground">
            Wallet transaction history is not available yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function WalletDetails({ wallet }: { wallet: CustomerWalletSnapshot }) {
  const [copyStatus, setCopyStatus] = useState("");
  const address = wallet.publicAddress;
  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus("Wallet address copied.");
    } catch {
      setCopyStatus(
        "Couldn’t copy the address. Select the address and copy it manually.",
      );
    }
  }
  return (
    <Dialog onOpenChange={() => setCopyStatus("")}>
      <DialogTrigger asChild>
        <Button variant="outline">Wallet details</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm sm:max-w-lg">
        <DialogTitle>Wallet details</DialogTitle>
        <DialogDescription>
          This is a test wallet record. Deposits and transfers are unavailable.
        </DialogDescription>
        <dl className="space-y-5 text-sm">
          <div>
            <dt className="text-muted-foreground">Asset</dt>
            <dd className="mt-1">{wallet.asset}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Network</dt>
            <dd className="mt-1 break-words">
              {wallet.network ?? "Not available"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Public wallet address</dt>
            <dd className="mt-1 select-text break-all font-mono">
              {address ?? "Not available"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Wallet reference</dt>
            <dd className="mt-1 select-text break-all font-mono">
              {wallet.walletId}
            </dd>
          </div>
        </dl>
        {address ? (
          <Button variant="outline" onClick={() => void copyAddress()}>
            <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
            Copy wallet address
          </Button>
        ) : null}
        <p role="status" className="text-sm text-muted-foreground">
          {copyStatus}
        </p>
      </DialogContent>
    </Dialog>
  );
}
