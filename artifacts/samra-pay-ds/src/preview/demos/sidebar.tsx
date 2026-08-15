import {
  ArrowLeftRight,
  CreditCard,
  Home,
  PiggyBank,
  Receipt,
  Settings,
  Users,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '../../components/ui/sidebar';
import { Guidelines } from '../parts';

const primaryNav = [
  { label: 'Home', icon: Home, active: true },
  { label: 'Send money', icon: ArrowLeftRight, badge: null },
  { label: 'Recipients', icon: Users, badge: '8' },
  { label: 'Bills', icon: Receipt, badge: '2' },
];

const moneyNav = [
  { label: 'Cards', icon: CreditCard },
  { label: 'Savings', icon: PiggyBank },
  { label: 'Settings', icon: Settings },
];

export function SidebarDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        App shell · bounded within the preview
      </p>
      <div className="h-80 max-w-3xl overflow-hidden rounded-xl border">
        <SidebarProvider className="h-full min-h-0">
          <Sidebar collapsible="none">
            <SidebarHeader>
              <p className="px-2 text-sm font-semibold">Samra Pay</p>
              <SidebarInput placeholder="Search transfers" />
            </SidebarHeader>
            <SidebarSeparator />
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Banking</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {primaryNav.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton isActive={item.active}>
                          <item.icon /> <span>{item.label}</span>
                        </SidebarMenuButton>
                        {item.badge ? (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Money</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {moneyNav.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton>
                          <item.icon /> <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="flex size-7 items-center justify-center rounded-full bg-coffee text-xs font-semibold text-coffee-foreground">
                  SB
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Selam Bekele</p>
                  <p className="truncate text-xs text-muted-foreground">
                    USD wallet
                  </p>
                </div>
              </div>
            </SidebarFooter>
          </Sidebar>
          <SidebarInset className="min-h-0 p-6">
            <p className="text-sm text-muted-foreground">Available balance</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">$1,240.00</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ≈ ETB 152,520 · illustrative rate
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Navigation stays contained beside the main balance view.
            </p>
          </SidebarInset>
        </SidebarProvider>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Group navigation by purpose — Banking vs Money — and mark the current section with the active state.',
            },
            {
              kind: 'do',
              text: 'Use badges for actionable counts like pending bills or new recipients, not decorative numbers.',
            },
            {
              kind: 'dont',
              text: 'Let the sidebar position itself over the whole page inside embedded shells; keep it in a bounded container with collapsible="none".',
            },
          ]}
        />
      </div>
    </div>
  );
}
