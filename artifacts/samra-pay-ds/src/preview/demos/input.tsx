import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Guidelines, Stack } from '../parts';

export function InputDemo() {
  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Types">
        <div className="space-y-2">
          <Label htmlFor="input-name">Recipient name</Label>
          <Input id="input-name" placeholder="Selam Tesfaye" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="input-email">Email for receipts</Label>
          <Input id="input-email" type="email" placeholder="name@example.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="input-account">Account number</Label>
          <Input
            id="input-account"
            inputMode="numeric"
            placeholder="13-digit CBE account"
          />
        </div>
      </Stack>

      <Stack label="Prefix / suffix (composed)">
        <div className="space-y-2">
          <Label htmlFor="input-amount">Amount to send</Label>
          <div className="flex items-center rounded-md border border-input bg-transparent shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <span className="pl-3 text-sm text-muted-foreground">$</span>
            <Input
              id="input-amount"
              type="number"
              inputMode="decimal"
              defaultValue="200"
              className="border-0 shadow-none focus-visible:ring-0"
            />
            <span className="pr-3 text-sm text-muted-foreground">USD</span>
          </div>
        </div>
      </Stack>

      <Stack label="File upload">
        <div className="space-y-2">
          <Label htmlFor="input-doc">Verification document</Label>
          <Input id="input-doc" type="file" />
        </div>
      </Stack>

      <Stack label="States">
        <div className="space-y-2">
          <Label htmlFor="input-ref">Transfer reference</Label>
          <Input
            id="input-ref"
            defaultValue="SP-2026-0814-DB"
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="input-limit">Daily limit</Label>
          <Input
            id="input-limit"
            defaultValue="$2,000 USD"
            disabled
          />
        </div>
      </Stack>

      <Stack label="Invalid — with error message">
        <div className="space-y-2">
          <Label htmlFor="input-send" className="text-destructive">
            Amount (USD)
          </Label>
          <Input
            id="input-send"
            type="number"
            inputMode="decimal"
            defaultValue="5000"
            aria-invalid="true"
            aria-describedby="input-send-error"
          />
          <p
            id="input-send-error"
            className="text-sm text-destructive"
            role="alert"
          >
            Exceeds today’s $2,000 send limit.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Tab moves between fields; the ring shows the focused input for
          keyboard users.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Set inputMode / type so mobile keyboards match the value — numeric for accounts, decimal for amounts.',
            },
            {
              kind: 'do',
              text: 'Tie every invalid input to a visible message via aria-describedby, not color alone.',
            },
            {
              kind: 'dont',
              text: 'Use readOnly and disabled interchangeably — readOnly still submits and copies; disabled does neither.',
            },
            {
              kind: 'dont',
              text: 'Drop the label to save space; a placeholder is a hint, never a substitute for a label.',
            },
          ]}
        />
      </div>
    </div>
  );
}
