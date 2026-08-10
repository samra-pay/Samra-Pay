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
import Remittance from '@/pages/remittance';
import SocialHouse from '@/pages/social-house';
import Login from '@/pages/login';

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Switch>
        {/* No navbar/footer on login */}
        <Route path="/login" component={Login} />
        <Route>
          <Navbar />
          <main className="flex-1">
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/cards" component={Cards} />
                <Route path="/remittance" component={Remittance} />
                <Route path="/social-house" component={SocialHouse} />
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
