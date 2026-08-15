import { useState } from 'react';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Guidelines, Stack } from '../parts';

export function SwitchDemo() {
  const [autoTransfer, setAutoTransfer] = useState(true);

  return (
    <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Notification preferences">
        <div className="flex items-center justify-between gap-6">
          <div>
            <Label htmlFor="switch-transfer">Transfer alerts</Label>
            <p className="text-sm text-muted-foreground">
              Push when a payout to Selam completes.
            </p>
          </div>
          <Switch id="switch-transfer" defaultChecked />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <Label htmlFor="switch-rate">Rate watch</Label>
            <p className="text-sm text-muted-foreground">
              Notify me when USD → ETB moves in my favor.
            </p>
          </div>
          <Switch id="switch-rate" />
        </div>
      </Stack>

      <Stack label="Controlled — automatic savings">
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="switch-auto">Round up every transfer to savings</Label>
          <Switch
            id="switch-auto"
            checked={autoTransfer}
            onCheckedChange={setAutoTransfer}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {autoTransfer
            ? 'Spare change is set aside toward your Addis trip fund.'
            : 'Round-up savings are paused.'}
        </p>
      </Stack>

      <Stack label="Locked states">
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="switch-fraud">Fraud monitoring (always on)</Label>
          <Switch id="switch-fraud" defaultChecked disabled />
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="switch-beta">Multi-currency wallet (waitlist)</Label>
          <Switch id="switch-beta" disabled />
        </div>
        <p className="text-xs text-muted-foreground">
          Toggle with Space or Enter when focused; the change applies immediately.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a switch for settings that take effect instantly, like alerts or round-up savings.',
            },
            {
              kind: 'do',
              text: 'Write labels as the on-state outcome so the toggle reads clearly either way.',
            },
            {
              kind: 'dont',
              text: 'Use a switch inside a form that needs a Save button — use a checkbox for deferred choices.',
            },
            {
              kind: 'dont',
              text: 'Rely on color alone for state; keep an adjacent label so the meaning is never ambiguous.',
            },
          ]}
        />
      </div>
    </div>
  );
}
