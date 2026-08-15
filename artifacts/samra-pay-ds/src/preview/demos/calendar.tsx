import { useState } from 'react';
import { Calendar } from '../../components/ui/calendar';
import { Guidelines, Stack } from '../parts';

export function CalendarDemo() {
  const [selected, setSelected] = useState<Date | undefined>(
    new Date(2026, 7, 14),
  );

  return (
    <div className="space-y-6">
      <div className="flex max-w-3xl flex-wrap gap-4">
        <Stack label="Single — schedule a transfer">
          <div className="w-fit rounded-xl border bg-card p-3 text-card-foreground">
            <Calendar
              mode="single"
              defaultMonth={new Date(2026, 7, 1)}
              selected={selected}
              onSelect={setSelected}
            />
            <p className="px-1 pt-2 text-xs text-muted-foreground">
              {selected
                ? `Transfer to Selam scheduled for ${selected.toLocaleDateString(
                    'en-US',
                    { month: 'long', day: 'numeric', year: 'numeric' },
                  )}`
                : 'Pick a send date.'}
            </p>
          </div>
        </Stack>

        <Stack label="Disabled — no past send dates">
          <div className="w-fit rounded-xl border bg-card p-3 text-card-foreground">
            <Calendar
              mode="single"
              defaultMonth={new Date(2026, 7, 1)}
              selected={new Date(2026, 7, 20)}
              disabled={{ before: new Date(2026, 7, 14) }}
            />
          </div>
        </Stack>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Echo the chosen date back in plain language so users confirm when a scheduled transfer will send.',
            },
            {
              kind: 'do',
              text: 'Disable dates that are not valid — like past days for a scheduled send — rather than erroring after the fact.',
            },
            {
              kind: 'dont',
              text: 'Use a full calendar for a near-term choice like "today or tomorrow"; offer quick presets instead.',
            },
          ]}
        />
      </div>
    </div>
  );
}
