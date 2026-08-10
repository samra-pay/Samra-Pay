import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, CreditCard, BarChart3, LineChart, Send, Settings, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navLinks = [
    { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
    { icon: CreditCard, label: "Cards & Accounts", href: "/dashboard/cards" },
    { icon: LineChart, label: "Credit Health", href: "/dashboard/credit" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { icon: Send, label: "Remittance", href: "/dashboard/remittance" },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/5 bg-card/30">
        <div className="p-6 border-b border-white/5">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40 group-hover:bg-primary/30 transition-colors">
                <span className="font-serif text-primary text-xl leading-none">S</span>
              </div>
              <span className="font-serif text-xl tracking-wide font-medium">SAMRA PAY</span>
            </div>
          </Link>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1">
          {navLinks.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-medium",
                  isActive 
                    ? "bg-primary/10 text-primary border border-primary/20" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}>
                  <link.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                  {link.label}
                </div>
              </Link>
            )
          })}
        </div>

        <div className="p-4 border-t border-white/5 space-y-1">
          <Link href="/dashboard/settings">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground">
              <Settings className="w-5 h-5 text-muted-foreground" />
              Settings
            </div>
          </Link>
          <Link href="/">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="w-5 h-5" />
              Sign Out
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-white/5 bg-background/90 backdrop-blur-xl z-50 flex items-center justify-between px-6">
        <Link href="/">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40">
            <span className="font-serif text-primary text-xl leading-none">S</span>
          </div>
        </Link>
        <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="text-foreground">
          {isMobileOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-background z-40 border-t border-white/5 flex flex-col">
          <div className="flex-1 py-6 px-4 space-y-2">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <div 
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-4 rounded-xl cursor-pointer transition-colors text-base font-medium",
                    location === link.href 
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : "text-muted-foreground"
                  )}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:pt-0 pt-16 h-screen overflow-y-auto">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-30">
          <h2 className="text-xl font-medium tracking-wide">
            {navLinks.find(l => l.href === location)?.label || "Dashboard"}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">Selam T.</div>
              <div className="text-xs text-muted-foreground">Member since 2024</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary border border-white/10 flex items-center justify-center font-medium">
              ST
            </div>
          </div>
        </header>
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
