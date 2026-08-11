import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

// Layout
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

// Pages
import Home from '@/pages/home';
import Cards from '@/pages/cards';
import ChargeCardPage from '@/pages/cards/charge';
import CoBrandCardPage from '@/pages/cards/co-brand';
import Remittance from '@/pages/remittance';
import SocialHouse from '@/pages/social-house';
import AskSamra from '@/pages/ask-samra';
import LegalPage from '@/pages/legal';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import { DashboardCards } from '@/pages/dashboard/cards';
import { DashboardCredit } from '@/pages/dashboard/credit';
import { DashboardAnalytics } from '@/pages/dashboard/analytics';
import { DashboardRemittance } from '@/pages/dashboard/remittance';
import { DashboardSettings } from '@/pages/dashboard/settings';
import { DashboardRewards } from '@/pages/dashboard/rewards';
import { DashboardLayout } from '@/components/dashboard-layout';
import { useParams } from 'wouter';

const queryClient = new QueryClient();

function DashboardRouter() {
  const params = useParams();
  const page = params.page;
  
  switch(page) {
    case 'cards': return <DashboardCards />;
    case 'credit': return <DashboardCredit />;
    case 'analytics': return <DashboardAnalytics />;
    case 'remittance': return <DashboardRemittance />;
    case 'rewards': return <DashboardRewards />;
    case 'settings': return <DashboardSettings />;
    default: return <Dashboard />;
  }
}

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Switch>
        {/* No navbar/footer on login */}
        <Route path="/login" component={Login} />
        
        {/* Dashboard Routes - simplified for demo */}
        <Route path="/dashboard">
          <DashboardLayout>
            <DashboardRouter />
          </DashboardLayout>
        </Route>
        <Route path="/dashboard/:page">
          <DashboardLayout>
            <DashboardRouter />
          </DashboardLayout>
        </Route>

        {/* Public Shell */}
        <Route>
          <Navbar />
          <main className="flex-1">
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/cards/charge" component={ChargeCardPage} />
                <Route path="/cards/co-brand" component={CoBrandCardPage} />
                <Route path="/cards" component={Cards} />
                <Route path="/remittance" component={Remittance} />
                <Route path="/social-house" component={SocialHouse} />
                <Route path="/ask-samra" component={AskSamra} />
                <Route path="/privacy">
                  <LegalPage kind="privacy" />
                </Route>
                <Route path="/terms">
                  <LegalPage kind="terms" />
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

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
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
