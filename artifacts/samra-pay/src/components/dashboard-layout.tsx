import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@workspace/samra-pay-ds/lib/utils";
import { LayoutDashboard, CreditCard, BarChart3, LineChart, Send, Settings, LogOut, Menu, X, Plane } from "lucide-react";
import { useState } from "react";
import { SamraLogo } from "@/components/samra-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { t, langClass, langAttr } = useLanguage();

  const navLinks = [
    { icon: LayoutDashboard, label: t("dash.overview"), href: "/dashboard" },
    { icon: CreditCard, label: t("dash.cardsAccounts"), href: "/dashboard/cards" },
    { icon: LineChart, label: t("dash.creditHealth"), href: "/dashboard/credit" },
    { icon: BarChart3, label: t("dash.analytics"), href: "/dashboard/analytics" },
    { icon: Send, label: t("dash.remittance"), href: "/dashboard/remittance" },
    { icon: Plane, label: t("dash.rewards"), href: "/dashboard/rewards" },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/5 bg-card/30">
        <div className="p-6 border-b border-white/5">
          <Link href="/">
            <div className="cursor-pointer group">
              <SamraLogo size="sm" showWordmark={true} />
            </div>
          </Link>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1">
          {navLinks.map((link) => {
            const isActive = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <div lang={langAttr} className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-medium",
                  langClass,
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
            <div lang={langAttr} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground", langClass)}>
              <Settings className="w-5 h-5 text-muted-foreground" />
              {t("dash.settings")}
            </div>
          </Link>
          <Link href="/">
            <div lang={langAttr} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors text-sm font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive", langClass)}>
              <LogOut className="w-5 h-5" />
              {t("dash.signOut")}
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-white/5 bg-background/90 backdrop-blur-xl z-50 flex items-center justify-between px-6">
        <Link href="/">
          <div className="cursor-pointer">
            <SamraLogo size="sm" showWordmark={false} />
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
                  lang={langAttr}
                  className={cn(
                    "flex items-center gap-3 px-4 py-4 rounded-xl cursor-pointer transition-colors text-base font-medium",
                    langClass,
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
            <div className="px-4 pt-4">
              <LanguageToggle />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:pt-0 pt-16 h-screen overflow-y-auto">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-30">
          <h2 lang={langAttr} className={cn("text-xl font-medium tracking-wide", langClass)}>
            {navLinks.find(l => l.href === location)?.label || (location === "/dashboard/settings" ? t("dash.settings") : t("dash.dashboard"))}
          </h2>
          <div className="flex items-center gap-4">
            <LanguageToggle className="hidden sm:inline-flex" />
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">Selam T.</div>
              <div className="text-xs text-muted-foreground">Member since 2024</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary border border-white/10 flex items-center justify-center font-medium">
              ST
            </div>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
