import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../../components/ui/drawer';
import { Guidelines, Row } from '../parts';

const activity = [
  {
    id: 1,
    name: 'Selam Girma',
    note: 'School fees',
    amount: '−250.00 USD',
    dir: 'out' as const,
    date: new Date(2026, 7, 14),
  },
  {
    id: 2,
    name: 'Dawit Bekele',
    note: 'Refund',
    amount: '+120.00 USD',
    dir: 'in' as const,
    date: new Date(2026, 7, 12),
  },
  {
    id: 3,
    name: 'Ethio Electric',
    note: 'Utility bill',
    amount: '−1,450 ETB',
    dir: 'out' as const,
    date: new Date(2026, 7, 10),
  },
];

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function ActivityDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">
          <Receipt /> Recent activity
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Recent activity</DrawerTitle>
            <DrawerDescription>
              Your last transfers and bills. Figures are illustrative.
            </DrawerDescription>
          </DrawerHeader>
          <ul className="space-y-2 px-4">
            {activity.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span
                  className={
                    item.dir === 'in'
                      ? 'flex size-9 items-center justify-center rounded-full bg-eucalyptus/15 text-eucalyptus'
                      : 'flex size-9 items-center justify-center rounded-full bg-berbere/15 text-berbere'
                  }
                >
                  {item.dir === 'in' ? (
                    <ArrowDownLeft className="size-4" />
                  ) : (
                    <ArrowUpRight className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.note} · {dateFmt.format(item.date)}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-sm font-medium">
                  {item.amount}
                </span>
              </li>
            ))}
          </ul>
          <DrawerFooter>
            <Button variant="gold">View full statement</Button>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function EmptyActivityDrawer() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Empty state</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>No activity yet</DrawerTitle>
            <DrawerDescription>
              Your transfers and bills will show up here once you send money.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing to show for now.
          </div>
          <DrawerFooter>
            <Button variant="gold">Send your first transfer</Button>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function DrawerDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Bottom drawer — activity list">
        <ActivityDrawer />
      </Row>

      <Row label="Empty state">
        <EmptyActivityDrawer />
      </Row>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          The drawer slides from the bottom and supports drag-to-dismiss; Esc
          and the overlay also close it.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a bottom drawer for quick, scannable content like recent activity — it echoes the mobile app pattern.',
            },
            {
              kind: 'do',
              text: 'Always offer a clear empty state so a new account never opens onto a blank panel.',
            },
            {
              kind: 'dont',
              text: 'Use a drawer for the primary send-money flow on desktop; a dialog reads as more deliberate there.',
            },
            {
              kind: 'dont',
              text: 'Pack a drawer with tall forms — its height is constrained, so long input belongs on a page.',
            },
          ]}
        />
      </div>
    </div>
  );
}
