import { useState } from 'react';
import { Label } from '../../components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '../../components/ui/radio-group';
import { Guidelines, Stack } from '../parts';

export function RadioGroupDemo() {
  const [speed, setSpeed] = useState('standard');

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Payout method">
        <RadioGroup defaultValue="bank">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="bank" id="radio-bank" />
            <Label htmlFor="radio-bank">Bank deposit (CBE, Awash)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="wallet" id="radio-wallet" />
            <Label htmlFor="radio-wallet">Mobile wallet (Telebirr)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="cash" id="radio-cash" />
            <Label htmlFor="radio-cash">Cash pickup</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="card" id="radio-card" disabled />
            <Label htmlFor="radio-card">Debit card (coming soon)</Label>
          </div>
        </RadioGroup>
      </Stack>

      <Stack label="Controlled — delivery speed">
        <RadioGroup value={speed} onValueChange={setSpeed}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="standard" id="radio-standard" />
            <Label htmlFor="radio-standard">Standard — 1–2 days (free)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="express" id="radio-express" />
            <Label htmlFor="radio-express">Express — within an hour</Label>
          </div>
        </RadioGroup>
        <p className="text-sm text-muted-foreground">
          {speed === 'express'
            ? 'Express adds an illustrative service fee to Dawit’s transfer.'
            : 'Standard delivery has no extra fee.'}
        </p>
      </Stack>

      <Stack label="Invalid — selection required">
        <RadioGroup aria-invalid="true">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="usd" id="radio-usd" aria-invalid="true" />
            <Label htmlFor="radio-usd">Send in USD</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="etb" id="radio-etb" aria-invalid="true" />
            <Label htmlFor="radio-etb">Send in ETB</Label>
          </div>
        </RadioGroup>
        <p className="text-sm text-destructive" role="alert">
          Choose the currency Hanna should receive.
        </p>
        <p className="text-xs text-muted-foreground">
          Arrow keys move between options; only one can be selected.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a radio group when exactly one option must win — payout method, delivery speed, currency.',
            },
            {
              kind: 'do',
              text: 'Order options by likely choice and default to the safest, cheapest one (Standard).',
            },
            {
              kind: 'dont',
              text: 'Offer more than about five radios — switch to a Select once the list gets long.',
            },
            {
              kind: 'dont',
              text: 'Leave the group with no default when a sensible one exists; blank forces needless work.',
            },
          ]}
        />
      </div>
    </div>
  );
}
