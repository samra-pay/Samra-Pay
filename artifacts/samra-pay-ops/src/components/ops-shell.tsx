import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@workspace/samra-pay-ds/lib/utils';
import { IS_MOCK } from '@/lib/data-mode';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  GitBranch,
  BarChart3,
  Cpu,
  ClipboardList,
  MessagesSquare,
  FileText,
  Activity,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/cases', label: 'Support Cases', icon: MessagesSquare },
  { href: '/money-flow', label: 'Money Flow', icon: GitBranch },
  { href: '/reconciliation', label: 'Reconciliation', icon: BarChart3 },
  { href: '/worker-operations', label: 'Worker Ops', icon: Cpu },
  { href: '/audit-log', label: 'Audit Log', icon: ClipboardList },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/system-health', label: 'System Health', icon: Activity },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      data-testid={`nav-${href.replace('/', '').replace('/', '-') || 'overview'}`}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-swift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-berbere text-berbere-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      {active && <ChevronRight className="size-3 ml-auto opacity-60" aria-hidden="true" />}
    </Link>
  );
}

export function OpsShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? location === '/' : location.startsWith(href);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">

      {/* Synthetic data banner */}
      {IS_MOCK && (
        <div
          data-testid="synthetic-data-banner"
          className="flex items-center justify-center gap-2 px-4 py-1.5 bg-berbere text-berbere-foreground text-xs font-semibold tracking-wide"
          role="banner"
          aria-label="Synthetic data mode active"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-berbere-foreground opacity-80 animate-pulse" aria-hidden="true" />
          Synthetic operations data — not real financial records
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — desktop */}
        <aside
          className="hidden md:flex flex-col w-56 shrink-0 border-r border-sidebar-border bg-sidebar"
          aria-label="Operations navigation"
        >
          <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-berbere">
              <span className="text-berbere-foreground text-xs font-black leading-none">S</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-sidebar-foreground leading-tight truncate">Samra Pay</div>
              <div className="text-xs text-muted-foreground leading-tight">Ops Portal</div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5" role="navigation">
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
              />
            ))}
          </nav>

          <div className="px-3 py-3 border-t border-sidebar-border">
            <div className="text-xs text-muted-foreground font-mono">
              {IS_MOCK ? 'MODE: MOCK' : 'MODE: API'}
            </div>
            <div className="text-xs text-muted-foreground">
              Financial state read-only
            </div>
          </div>
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-sidebar border-r border-sidebar-border">
              <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded bg-berbere">
                    <span className="text-berbere-foreground text-xs font-black leading-none">S</span>
                  </div>
                  <span className="text-sm font-semibold text-sidebar-foreground">Ops Portal</span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Close navigation"
                  data-testid="close-mobile-nav"
                >
                  <X className="size-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                {NAV_ITEMS.map((item) => (
                  <NavItem
                    key={item.href}
                    {...item}
                    active={isActive(item.href)}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Mobile topbar */}
          <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open navigation"
              data-testid="open-mobile-nav"
            >
              <Menu className="size-5" />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {NAV_ITEMS.find((n) => isActive(n.href))?.label ?? 'Ops Portal'}
            </span>
          </header>

          <main className="flex-1 overflow-y-auto" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
