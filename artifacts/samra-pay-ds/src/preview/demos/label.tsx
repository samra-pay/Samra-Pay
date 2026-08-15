import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Guidelines, Stack } from '../parts';

export function LabelDemo() {
  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Linked control">
        <Label htmlFor="label-recipient">Recipient name</Label>
        <Input id="label-recipient" defaultValue="Selam Tesfaye" />
        <p className="text-xs text-muted-foreground">
          Clicking the label focuses the input via <code>htmlFor</code>.
        </p>
      </Stack>

      <Stack label="Required field">
        <Label htmlFor="label-account">
          Account number
          <span className="text-destructive" aria-hidden="true">
            {' '}
            *
          </span>
          <span className="sr-only">(required)</span>
        </Label>
        <Input
          id="label-account"
          inputMode="numeric"
          placeholder="13-digit CBE account"
          required
        />
      </Stack>

      <Stack label="Disabled peer">
        <div className="flex items-center gap-2">
          <Checkbox id="label-express" disabled className="peer" />
          <Label htmlFor="label-express">
            Express payout (unavailable for cash pickup)
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          The label dims automatically when its peer control is disabled.
        </p>
      </Stack>

      <Stack label="Error usage">
        <Label htmlFor="label-amount" className="text-destructive">
          Amount (USD)
        </Label>
        <Input
          id="label-amount"
          type="number"
          inputMode="decimal"
          defaultValue="5000"
          aria-invalid="true"
          aria-describedby="label-amount-error"
        />
        <p
          id="label-amount-error"
          className="text-sm text-destructive"
          role="alert"
        >
          Exceeds today’s $2,000 send limit.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Always pair a label with its control via htmlFor so the whole label is a click and screen-reader target.',
            },
            {
              kind: 'do',
              text: 'Mark required money-movement fields with a visible asterisk plus sr-only “(required)” text.',
            },
            {
              kind: 'dont',
              text: 'Rely on placeholder text as the label — it vanishes on typing and is easy to miss.',
            },
            {
              kind: 'dont',
              text: 'Turn the label destructive without an associated error message; color alone is not an explanation.',
            },
          ]}
        />
      </div>
    </div>
  );
}
