import { useState } from 'react';
import { Bell, BellOff, Eye, EyeOff, Star } from 'lucide-react';
import { Toggle } from '../../components/ui/toggle';
import { Guidelines, Row, Stack } from '../parts';

export function ToggleDemo() {
  const [balanceHidden, setBalanceHidden] = useState(false);

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Variants">
        <Toggle aria-label="Toggle notifications" defaultPressed>
          <Bell /> Alerts on
        </Toggle>
        <Toggle variant="outline" aria-label="Favourite recipient">
          <Star /> Favourite
        </Toggle>
      </Row>

      <Row label="Sizes">
        <Toggle size="sm" aria-label="Small favourite">
          <Star />
        </Toggle>
        <Toggle size="default" aria-label="Default favourite">
          <Star />
        </Toggle>
        <Toggle size="lg" aria-label="Large favourite">
          <Star />
        </Toggle>
      </Row>

      <Stack label="Controlled — hide account balance">
        <div className="flex items-center gap-3">
          <Toggle
            variant="outline"
            pressed={balanceHidden}
            onPressedChange={setBalanceHidden}
            aria-label="Hide balance"
          >
            {balanceHidden ? <EyeOff /> : <Eye />}
            {balanceHidden ? 'Balance hidden' : 'Balance shown'}
          </Toggle>
          <span className="font-medium tabular-nums">
            {balanceHidden ? '••••••' : '48,920.00 ETB'}
          </span>
        </div>
      </Stack>

      <Row label="States — disabled">
        <Toggle disabled aria-label="Notifications unavailable">
          <BellOff /> Unavailable
        </Toggle>
        <Toggle variant="outline" disabled defaultPressed aria-label="Locked on">
          <Star /> Locked on
        </Toggle>
      </Row>

      <Stack label="Keyboard">
        <p className="text-sm text-muted-foreground">
          A toggle is focusable and flips its pressed state with Space or Enter;
          screen readers announce the state via aria-pressed.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a toggle for a binary preference that takes effect immediately, like hiding the balance or muting alerts.',
            },
            {
              kind: 'do',
              text: 'Give every icon-only toggle an aria-label so its purpose survives without a visible caption.',
            },
            {
              kind: 'dont',
              text: 'Use a toggle to submit a form or navigate — reach for a Button when an action needs confirmation.',
            },
            {
              kind: 'dont',
              text: 'Rely on colour alone for the on state; pair the accent fill with an icon or label change.',
            },
          ]}
        />
      </div>
    </div>
  );
}
