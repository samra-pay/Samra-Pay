import { AlertTriangle, Loader2, Send, UserPlus, Users } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../components/ui/empty';
import { Guidelines, Stack } from '../parts';

export function EmptyDemo() {
  return (
    <div className="space-y-6">
      <Stack label="No data yet">
        <Empty className="max-w-xl border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No recipients yet</EmptyTitle>
            <EmptyDescription>
              Add family or friends in Ethiopia — like Selam or Dawit — to send
              money in just a couple of taps.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="gold">
              <UserPlus /> Add recipient
            </Button>
          </EmptyContent>
        </Empty>
      </Stack>

      <Stack label="Loading">
        <Empty className="max-w-xl border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Loader2 className="animate-spin" />
            </EmptyMedia>
            <EmptyTitle>Loading your transfers</EmptyTitle>
            <EmptyDescription>
              Fetching your recent activity. This only takes a moment.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Stack>

      <Stack label="Error">
        <Empty className="max-w-xl border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertTriangle className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>Couldn&apos;t load transfers</EmptyTitle>
            <EmptyDescription>
              We hit a snag reaching your history. Your money is safe — please
              try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">Retry</Button>
            <Button variant="ghost">
              <Send /> Send money instead
            </Button>
          </EmptyContent>
        </Empty>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Pair every empty state with one clear next step — "Add recipient" or "Send money" — so users are never stuck.',
            },
            {
              kind: 'do',
              text: 'Reassure users in error copy that their money is safe before asking them to retry.',
            },
            {
              kind: 'dont',
              text: 'Reuse the same generic icon for empty, loading, and error — differentiate them so the state is obvious.',
            },
            {
              kind: 'dont',
              text: 'Leave the region blank while data loads; show a loading empty state instead of dead space.',
            },
          ]}
        />
      </div>
    </div>
  );
}
