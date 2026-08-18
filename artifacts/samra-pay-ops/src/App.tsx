import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@workspace/samra-pay-ds/components/ui/toaster";
import { TooltipProvider } from "@workspace/samra-pay-ds/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import OverviewPage from "@/pages/overview";
import CustomersPage from "@/pages/customers";
import TransfersPage from "@/pages/transfers";
import MoneyFlowPage from "@/pages/money-flow";
import ReconciliationPage from "@/pages/reconciliation";
import WorkerOperationsPage from "@/pages/worker-operations";
import AuditLogPage from "@/pages/audit-log";
import ReportsPage from "@/pages/reports";
import SystemHealthPage from "@/pages/system-health";
import CasesPage from "@/pages/cases";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { IS_API, OPERATIONS_ENABLED } from "@/lib/data-mode";
import {
  closeWorkforceSession,
  createWorkforceSession,
  loadWorkforceSession,
  WorkforceSessionUnavailable,
  type WorkforceSession,
} from "@/lib/workforce-auth";
import {
  canAccessOperationsRoute,
  isOperationsRoute,
  useWorkforceRole,
  WorkforceRoleProvider,
} from "@/lib/workforce-access";

const queryClient = new QueryClient();

function Router() {
  const [location, setLocation] = useLocation();
  const workforceRole = useWorkforceRole();
  const forbidden =
    IS_API &&
    isOperationsRoute(location) &&
    !canAccessOperationsRoute(workforceRole, location);

  useEffect(() => {
    if (forbidden) setLocation("/", { replace: true });
  }, [forbidden, setLocation]);

  if (forbidden) {
    return (
      <WorkforceStatus
        title="Redirecting to an authorized page"
        detail="This workforce role does not have access to that operations route."
      />
    );
  }

  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/transfers" component={TransfersPage} />
        <Route path="/cases" component={CasesPage} />
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
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Samra Pay
          </p>
          <h1 className="mt-2 text-xl font-semibold">
            Operations Portal disabled
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This private employee surface requires an explicit runtime
            enablement.
          </p>
        </section>
      </main>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WorkforceGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </WorkforceGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function WorkforceGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WorkforceSession | null>(
    IS_API
      ? null
      : {
          operatorId: "fixture-operator",
          displayName: "Fixture operator",
          role: "support_readonly",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
  );
  const [loading, setLoading] = useState(IS_API);
  const [sessionError, setSessionError] =
    useState<WorkforceSessionUnavailable | null>(null);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setSessionError(null);
    try {
      setSession(await loadWorkforceSession());
    } catch (cause) {
      setSession(null);
      setSessionError(
        cause instanceof WorkforceSessionUnavailable
          ? cause
          : new WorkforceSessionUnavailable(),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!IS_API) return;
    void refreshSession();
  }, [refreshSession]);

  if (loading) {
    return (
      <WorkforceStatus
        title="Verifying workforce session"
        detail="Checking employee access…"
      />
    );
  }
  if (sessionError) {
    return (
      <WorkforceStatus
        title="Operations API unavailable"
        detail={`${sessionError.message} No mock employee or financial data was loaded.`}
        actionLabel="Retry connection"
        onAction={() => void refreshSession()}
      />
    );
  }
  if (!session) {
    return (
      <WorkforceLogin
        onAuthenticated={(authenticatedSession) => {
          queryClient.clear();
          setSession(authenticatedSession);
        }}
      />
    );
  }
  return (
    <>
      <div className="sr-only" data-workforce-role={session.role}>
        {session.displayName}
      </div>
      <WorkforceRoleProvider role={session.role}>
        {children}
      </WorkforceRoleProvider>
      <button
        type="button"
        className="fixed bottom-4 right-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
        onClick={() => {
          setLoading(true);
          queryClient.clear();
          void closeWorkforceSession().finally(() => {
            setSession(null);
            setLoading(false);
          });
        }}
      >
        Sign out
      </button>
    </>
  );
}

function WorkforceLogin({
  onAuthenticated,
}: {
  onAuthenticated: (session: WorkforceSession) => void;
}) {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onAuthenticated(await createWorkforceSession(loginName, password));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Authentication failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="dark min-h-screen bg-background text-foreground grid place-items-center p-6">
      <form
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6"
        onSubmit={submit}
      >
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Samra Pay
        </p>
        <h1 className="mt-2 text-xl font-semibold">
          Operations workforce sign in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Employee access only. Every sensitive read is recorded.
        </p>
        <label className="mt-6 block text-sm" htmlFor="workforce-login">
          Workforce login
        </label>
        <input
          id="workforce-login"
          autoComplete="username"
          required
          value={loginName}
          onChange={(event) => setLoginName(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
        />
        <label className="mt-4 block text-sm" htmlFor="workforce-password">
          Password
        </label>
        <input
          id="workforce-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
        />
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <button
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          type="submit"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function WorkforceStatus({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="dark min-h-screen bg-background text-foreground grid place-items-center p-6">
      <section className="max-w-lg rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

export default App;
