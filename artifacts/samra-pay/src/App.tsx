import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@workspace/samra-pay-ds/components/ui/toaster";
import { TooltipProvider } from "@workspace/samra-pay-ds/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";

// Layout
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

// Pages
import Home from "@/pages/home";
import Cards from "@/pages/cards";
import ChargeCardPage from "@/pages/cards/charge";
import CoBrandCardPage from "@/pages/cards/co-brand";
import { PublicRemittanceRoute } from "@/pages/remittance-route";
import SocialHouse from "@/pages/social-house";
import AskSamra from "@/pages/ask-samra";
import LegalPage from "@/pages/legal";
import Login from "@/pages/login";
import CustomerSession from "@/pages/customer-session";
import { DashboardHomeRoute } from "@/pages/dashboard-route";
import { DashboardCards } from "@/pages/dashboard/cards";
import { DashboardCredit } from "@/pages/dashboard/credit";
import { DashboardAnalytics } from "@/pages/dashboard/analytics";
import { DashboardRemittanceRoute } from "@/pages/dashboard/remittance-route";
import { DashboardSettings } from "@/pages/dashboard/settings";
import { DashboardRewards } from "@/pages/dashboard/rewards";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ApiModeUnavailable } from "@/pages/api-mode-unavailable";
import { LanguageProvider } from "@/lib/i18n";
import { SamraRuntimeProvider, useSamraDataMode } from "@/lib/samra-runtime";
import { CustomerAuthGuard, CustomerAuthProvider } from "@/lib/customer-auth";
import { isUnavailableFinancialPreview } from "@/lib/dashboard-api-model";
import { useParams } from "wouter";
import { useSamraCustomerAcquisition } from "@workspace/samra-client/react";

const queryClient = new QueryClient();
const CustomerOnboardingPage = lazy(() => import("@/pages/onboarding"));
const CustomerWalletPage = lazy(() => import("@/pages/wallet"));
const CustomerAccountPage = lazy(() => import("@/pages/account"));

function DashboardRouter() {
  const params = useParams();
  const page = params.page;
  const mode = useSamraDataMode();

  if (mode === "api" && isUnavailableFinancialPreview(page)) {
    const section =
      page === "cards"
        ? "Cards and accounts"
        : page === "credit"
          ? "Credit health"
          : page === "analytics"
            ? "Analytics"
            : "Rewards";
    return <ApiModeUnavailable section={section} />;
  }

  switch (page) {
    case "cards":
      return <DashboardCards />;
    case "credit":
      return <DashboardCredit />;
    case "analytics":
      return <DashboardAnalytics />;
    case "remittance":
      return <DashboardRemittanceRoute />;
    case "rewards":
      return <DashboardRewards />;
    case "settings":
      return <DashboardSettings />;
    default:
      return <DashboardHomeRoute />;
  }
}

function Router() {
  const [location] = useLocation();
  const acquisition = useSamraCustomerAcquisition();

  useEffect(() => {
    if (!isPublicMarketingRoute(location)) return;
    void acquisition.recordOnce("landing_view");
  }, [acquisition, location]);

  return (
    <div className="flex flex-col min-h-screen">
      <Switch>
        {/* The coming-soon surface owns its own navigation and footer. */}
        <Route path="/" component={Home} />

        {/* No navbar/footer on login */}
        <Route path="/login">
          <Login />
        </Route>
        <Route path="/signup">
          <Login signup />
        </Route>
        <Route path="/session">
          <CustomerAuthGuard>
            <CustomerSession />
          </CustomerAuthGuard>
        </Route>
        <Route path="/account">
          <CustomerAuthGuard>
            <RoutedErrorBoundary>
              <Suspense
                fallback={
                  <OnboardingRouteFallback label="Loading your account…" />
                }
              >
                <CustomerAccountPage />
              </Suspense>
            </RoutedErrorBoundary>
          </CustomerAuthGuard>
        </Route>
        <Route path="/onboarding">
          <CustomerAuthGuard>
            <RoutedErrorBoundary>
              <Suspense fallback={<OnboardingRouteFallback />}>
                <CustomerOnboardingPage />
              </Suspense>
            </RoutedErrorBoundary>
          </CustomerAuthGuard>
        </Route>

        <Route path="/wallet">
          <CustomerAuthGuard>
            <RoutedErrorBoundary>
              <Suspense
                fallback={
                  <OnboardingRouteFallback label="Loading your wallet…" />
                }
              >
                <CustomerWalletPage />
              </Suspense>
            </RoutedErrorBoundary>
          </CustomerAuthGuard>
        </Route>

        {/* Dashboard Routes - simplified for demo */}
        <Route path="/dashboard">
          <CustomerAuthGuard>
            <DashboardLayout>
              <DashboardRouter />
            </DashboardLayout>
          </CustomerAuthGuard>
        </Route>
        <Route path="/dashboard/:page">
          <CustomerAuthGuard>
            <DashboardLayout>
              <DashboardRouter />
            </DashboardLayout>
          </CustomerAuthGuard>
        </Route>

        {/* Public Shell */}
        <Route>
          <Navbar />
          <main className="flex-1">
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/cards/charge" component={ChargeCardPage} />
                <Route path="/cards/co-brand" component={CoBrandCardPage} />
                <Route path="/cards" component={Cards} />
                <Route path="/remittance" component={PublicRemittanceRoute} />
                <Route path="/social-house" component={SocialHouse} />
                <Route path="/ask-samra" component={AskSamra} />
                <Route path="/privacy">
                  <LegalPage kind="privacy" />
                </Route>
                <Route path="/terms">
                  <LegalPage kind="terms" />
                </Route>
                <Route path="/electronic-communications">
                  <LegalPage kind="electronic-communications" />
                </Route>
                <Route component={NotFound} />
              </Switch>
            </RoutedErrorBoundary>
          </main>
          <Footer />
        </Route>
      </Switch>
    </div>
  );
}

function isPublicMarketingRoute(location: string): boolean {
  return (
    location === "/" ||
    location === "/remittance" ||
    location === "/cards" ||
    location.startsWith("/cards/") ||
    location === "/social-house" ||
    location === "/ask-samra"
  );
}

function OnboardingRouteFallback({
  label = "Loading secure onboarding…",
}: {
  label?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <p role="status" className="text-sm text-muted-foreground">
        {label}
      </p>
    </main>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CustomerAuthProvider>
        <SamraRuntimeProvider>
          <TooltipProvider>
            <LanguageProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </LanguageProvider>
          </TooltipProvider>
        </SamraRuntimeProvider>
      </CustomerAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
