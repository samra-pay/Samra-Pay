import { useState } from 'react';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Guidelines, Stack } from '../parts';

export function CheckboxDemo() {
  const [selectAll, setSelectAll] = useState(false);

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="States">
        <div className="flex items-center gap-2">
          <Checkbox id="checkbox-terms" defaultChecked />
          <Label htmlFor="checkbox-terms">
            I accept the Samra Pay transfer agreement
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="checkbox-save" />
          <Label htmlFor="checkbox-save">Save Selam as a recipient</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="checkbox-locked" defaultChecked disabled />
          <Label htmlFor="checkbox-locked">
            Fraud monitoring (always on)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="checkbox-unavailable" disabled />
          <Label htmlFor="checkbox-unavailable">
            Same-day payout (unavailable for ETB)
          </Label>
        </div>
      </Stack>

      <Stack label="Invalid — required consent">
        <div className="flex items-center gap-2">
          <Checkbox id="checkbox-consent" aria-invalid="true" />
          <Label htmlFor="checkbox-consent">
            Confirm the recipient details are correct
          </Label>
        </div>
        <p className="text-sm text-destructive" role="alert">
          You must confirm before sending money.
        </p>
      </Stack>

      <Stack label="Controlled — transfer options">
        <div className="flex items-center gap-2">
          <Checkbox
            id="checkbox-all"
            checked={selectAll}
            onCheckedChange={(value) => setSelectAll(value === true)}
          />
          <Label htmlFor="checkbox-all">Notify me for every transfer</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          {selectAll
            ? 'You will get a push alert for each USD → ETB transfer.'
            : 'Alerts are off — you can still view transfers in history.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Space toggles the focused checkbox; the label is clickable too.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use checkboxes for independent opt-ins like saving a recipient or enabling transfer alerts.',
            },
            {
              kind: 'do',
              text: 'Pair every checkbox with a clickable label so the whole line is an easy target on mobile.',
            },
            {
              kind: 'dont',
              text: 'Use a checkbox for one-of-many choices — reach for a radio group so only a single option can win.',
            },
            {
              kind: 'dont',
              text: 'Pre-check consent that carries legal or money-movement weight; make the customer choose it deliberately.',
            },
          ]}
        />
      </div>
    </div>
  );
}
