import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@workspace/samra-pay-ds/components/ui/toaster';
import { TooltipProvider } from '@workspace/samra-pay-ds/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import OverviewPage from '@/pages/overview';
import CustomersPage from '@/pages/customers';
import TransfersPage from '@/pages/transfers';
import MoneyFlowPage from '@/pages/money-flow';
import ReconciliationPage from '@/pages/reconciliation';
import WorkerOperationsPage from '@/pages/worker-operations';
import AuditLogPage from '@/pages/audit-log';
import ReportsPage from '@/pages/reports';
import SystemHealthPage from '@/pages/system-health';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { OPERATIONS_ENABLED } from '@/lib/data-mode';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/transfers" component={TransfersPage} />
        <Route path="/money-flow" component={MoneyFlowPage} />
        <Route path="/reconciliation" component={ReconciliationPage} />
        <Route path="/worker-operations" component={WorkerOperationsPage} />
        <Route path="/audit-log" component={AuditLogPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/system-health" component={SystemHealthPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  if (!OPERATIONS_ENABLED) {
    return (
      <main className="dark min-h-screen bg-background text-foreground grid place-items-center p-6">
        <section className="max-w-lg rounded-lg border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Samra Pay</p>
          <h1 className="mt-2 text-xl font-semibold">Operations Portal disabled</h1>
          <p className="mt-3 text-sm text-muted-foreground">This private employee surface requires an explicit runtime enablement.</p>
        </section>
      </main>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
