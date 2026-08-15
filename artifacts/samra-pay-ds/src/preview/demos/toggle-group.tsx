import { useState } from 'react';
import { CalendarClock, CalendarDays, CalendarRange } from 'lucide-react';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../components/ui/toggle-group';
import { Guidelines, Stack } from '../parts';

export function ToggleGroupDemo() {
  const [range, setRange] = useState('month');

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Single selection — statement period">
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(value) => {
            if (value) setRange(value);
          }}
          variant="outline"
        >
          <ToggleGroupItem value="week" aria-label="This week">
            <CalendarClock /> Week
          </ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="This month">
            <CalendarDays /> Month
          </ToggleGroupItem>
          <ToggleGroupItem value="year" aria-label="This year">
            <CalendarRange /> Year
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          Showing transfers for the current{' '}
          <span className="font-medium text-foreground">{range}</span>.
        </p>
      </Stack>

      <Stack label="Multiple selection — transaction filters">
        <ToggleGroup type="multiple" defaultValue={['sent']}>
          <ToggleGroupItem value="sent">Sent</ToggleGroupItem>
          <ToggleGroupItem value="received">Received</ToggleGroupItem>
          <ToggleGroupItem value="bills">Bills</ToggleGroupItem>
        </ToggleGroup>
      </Stack>

      <Stack label="Sizes">
        <ToggleGroup type="single" size="sm" defaultValue="usd" variant="outline">
          <ToggleGroupItem value="usd">USD</ToggleGroupItem>
          <ToggleGroupItem value="etb">ETB</ToggleGroupItem>
          <ToggleGroupItem value="eur">EUR</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" size="lg" defaultValue="etb" variant="outline">
          <ToggleGroupItem value="usd">USD</ToggleGroupItem>
          <ToggleGroupItem value="etb">ETB</ToggleGroupItem>
          <ToggleGroupItem value="eur">EUR</ToggleGroupItem>
        </ToggleGroup>
      </Stack>

      <Stack label="States — disabled item">
        <ToggleGroup type="single" defaultValue="month" variant="outline">
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
          <ToggleGroupItem value="year" disabled>
            Year
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          Yearly statements unlock after 12 months of activity.
        </p>
      </Stack>

      <Stack label="Keyboard">
        <p className="text-sm text-muted-foreground">
          Arrow keys move between items; Space or Enter selects. Single mode
          keeps exactly one item active, so guard against empty values.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use single-select groups for mutually exclusive views like a statement period or a display currency.',
            },
            {
              kind: 'do',
              text: 'Use multiple-select groups for stackable filters where several can be active at once.',
            },
            {
              kind: 'dont',
              text: 'Allow a single-select group to clear to nothing — always fall back to the last valid choice.',
            },
            {
              kind: 'dont',
              text: 'Overload a group with more than five options; switch to a Select or Tabs when the list grows.',
            },
          ]}
        />
      </div>
    </div>
  );
}
