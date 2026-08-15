import { useState } from 'react';
import { Slider } from '../../components/ui/slider';
import { Guidelines, Stack } from '../parts';

export function SliderDemo() {
  const [amount, setAmount] = useState([250]);

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Send amount">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Amount to send</span>
          <span className="font-medium">${amount[0]} USD</span>
        </div>
        <Slider
          value={amount}
          onValueChange={setAmount}
          min={10}
          max={2000}
          step={10}
          aria-label="Send amount in USD"
        />
        <p className="text-sm text-muted-foreground">
          Selam receives an illustrative ~{(amount[0] * 130).toLocaleString()} ETB.
        </p>
      </Stack>

      <Stack label="Rate-watch range (USD → ETB)">
        <Slider
          defaultValue={[125, 140]}
          min={100}
          max={160}
          step={1}
          aria-label="Alert when the rate falls in this range"
        />
        <p className="text-sm text-muted-foreground">
          We alert you when the rate lands between the two handles.
        </p>
      </Stack>

      <Stack label="Fixed steps — monthly savings goal">
        <Slider defaultValue={[100]} min={0} max={500} step={50} />
        <p className="text-xs text-muted-foreground">
          Arrow keys nudge by one step; Home and End jump to the ends.
        </p>
      </Stack>

      <Stack label="Disabled — limit reached">
        <Slider defaultValue={[2000]} min={10} max={2000} step={10} disabled />
        <p className="text-sm text-muted-foreground">
          You’ve reached today’s send limit.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a slider for approximate, adjustable values like a send amount or a savings goal.',
            },
            {
              kind: 'do',
              text: 'Show the live value next to the track so the customer always sees the exact figure.',
            },
            {
              kind: 'dont',
              text: 'Use a slider when a precise number matters — pair it with, or replace it by, a numeric input.',
            },
            {
              kind: 'dont',
              text: 'Set a range so wide that a single step is meaningless; choose steps that map to real choices.',
            },
          ]}
        />
      </div>
    </div>
  );
}
