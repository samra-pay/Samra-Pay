import { Skeleton } from '../../components/ui/skeleton';
import { Guidelines, Stack } from '../parts';

export function SkeletonDemo() {
  return (
    <div className="max-w-xl space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Recipient row — loading the address book">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </Stack>

      <Stack label="Balance card — loading account summary">
        <div className="space-y-3 rounded-lg border p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </Stack>

      <Stack label="Transaction list — loading recent transfers">
        <div className="space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Mirror the shape and layout of the real content so the swap-in feels seamless, not jarring.',
            },
            {
              kind: 'do',
              text: 'Use skeletons for the first load of a screen where the layout is already known — balances, lists, profiles.',
            },
            {
              kind: 'dont',
              text: 'Show skeletons for actions the person just triggered — a spinner or progress bar reads as "working," not "loading a page."',
            },
          ]}
        />
      </div>
    </div>
  );
}
