import { Loader2, Inbox } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { Guidelines, Stack } from '../parts';

const transfers = [
  { name: 'Selam Bekele', amount: '$200.00', etb: '≈ ETB 24,600', when: 'Aug 14' },
  { name: 'Dawit Alemu', amount: '$120.00', etb: '≈ ETB 14,760', when: 'Aug 11' },
  { name: 'Hanna Girma', amount: '$75.00', etb: '≈ ETB 9,225', when: 'Aug 03' },
];

export function TabsDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Account sections">
        <Tabs defaultValue="activity" className="max-w-lg">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="recipients">Recipients</TabsTrigger>
            <TabsTrigger value="loading">Statements</TabsTrigger>
            <TabsTrigger value="settings" disabled>
              Limits (locked)
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="activity"
            className="rounded-md border p-4 text-sm"
          >
            <ul className="divide-y">
              {transfers.map((t) => (
                <li
                  key={t.name}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.when}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">{t.amount}</p>
                    <p className="text-xs text-muted-foreground">{t.etb}</p>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent
            value="recipients"
            className="rounded-md border p-4 text-sm"
          >
            <div className="flex flex-col items-center gap-1 py-6 text-center">
              <Inbox className="size-6 text-muted-foreground" />
              <p className="font-medium">No saved recipients yet</p>
              <p className="text-xs text-muted-foreground">
                Recipients you send to will appear here for one-tap transfers.
              </p>
            </div>
          </TabsContent>

          <TabsContent
            value="loading"
            className="rounded-md border p-4 text-sm"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading statements…
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </TabsContent>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          Arrow keys move between tabs; the disabled "Limits" tab is skipped.
        </p>
      </Stack>

      <Stack label="With count badges">
        <Tabs defaultValue="pending" className="max-w-lg">
          <TabsList>
            <TabsTrigger value="pending">
              Pending{' '}
              <Badge variant="secondary" className="ml-1.5">
                2
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <TabsContent
            value="pending"
            className="rounded-md border p-4 text-sm text-muted-foreground"
          >
            2 transfers awaiting recipient pickup.
          </TabsContent>
          <TabsContent
            value="completed"
            className="rounded-md border p-4 text-sm text-muted-foreground"
          >
            All settled transfers from the last 30 days.
          </TabsContent>
        </Tabs>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use tabs for peer views of the same account — Activity, Recipients, Statements — not for a step-by-step flow.',
            },
            {
              kind: 'do',
              text: 'Give each panel its own loading and empty state so switching tabs never shows a blank box.',
            },
            {
              kind: 'dont',
              text: 'Exceed a handful of tabs on mobile; overflow into a menu or filter instead of scrolling the tab strip.',
            },
          ]}
        />
      </div>
    </div>
  );
}
