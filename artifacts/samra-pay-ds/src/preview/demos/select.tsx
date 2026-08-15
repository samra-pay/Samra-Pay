import { useState } from 'react';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Guidelines, Stack } from '../parts';

export function SelectDemo() {
  const [recipient, setRecipient] = useState('');

  return (
    <div className="max-w-sm space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Grouped — payout country">
        <Select defaultValue="et">
          <SelectTrigger aria-label="Payout country">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>East Africa</SelectLabel>
              <SelectItem value="et">Ethiopia (ETB)</SelectItem>
              <SelectItem value="ke">Kenya (KES)</SelectItem>
              <SelectItem value="dj">Djibouti (DJF)</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Elsewhere</SelectLabel>
              <SelectItem value="us">United States (USD)</SelectItem>
              <SelectItem value="ss" disabled>
                South Sudan (temporarily paused)
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Stack>

      <Stack label="Controlled — pick a recipient">
        <Label htmlFor="select-recipient">Send to</Label>
        <Select value={recipient} onValueChange={setRecipient}>
          <SelectTrigger id="select-recipient">
            <SelectValue placeholder="Choose a saved recipient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="selam">Selam Tesfaye — CBE</SelectItem>
            <SelectItem value="dawit">Dawit Bekele — Telebirr</SelectItem>
            <SelectItem value="hanna">Hanna Girma — Awash</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {recipient
            ? 'Recipient selected — continue to enter an amount.'
            : 'No recipient chosen yet.'}
        </p>
      </Stack>

      <Stack label="Invalid — required">
        <Select>
          <SelectTrigger aria-invalid="true" aria-label="Delivery speed">
            <SelectValue placeholder="Select delivery speed" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard — 1–2 days</SelectItem>
            <SelectItem value="express">Express — within an hour</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-destructive" role="alert">
          Choose how fast Hanna should receive the money.
        </p>
      </Stack>

      <Stack label="Disabled — locked to USD">
        <Select disabled>
          <SelectTrigger aria-label="Send currency">
            <SelectValue placeholder="USD" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="usd">USD</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Type to jump to a match; arrow keys move and Enter confirms.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a select for one choice from a longer list — countries, saved recipients, delivery speed.',
            },
            {
              kind: 'do',
              text: 'Group and label related options (East Africa vs. Elsewhere) so scanning stays quick.',
            },
            {
              kind: 'dont',
              text: 'Use a select for three or fewer visible options; a radio group shows them all at once.',
            },
            {
              kind: 'dont',
              text: 'Hide critical unavailable options — show them disabled with a reason so users know they exist.',
            },
          ]}
        />
      </div>
    </div>
  );
}
