import { useState } from 'react';
import { Landmark, Smartphone, Wallet, CreditCard as CardIcon } from 'lucide-react';
import { SelectableTile, SelectableTileGroup } from '../../components/patterns/selectable-tile';
import { Guidelines, Stack } from '../parts';

export function PatternSelectableTileDemo() {
  const [delivery, setDelivery] = useState('bank');
  const [payment, setPayment] = useState('balance');

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Radiogroup — delivery method (arrow keys move selection)">
        <div className="max-w-md">
          <SelectableTileGroup label="Delivery method" value={delivery} onValueChange={setDelivery}>
            <SelectableTile
              value="bank"
              icon={Landmark}
              title="Bank deposit"
              description="CBE · 1–2 hrs"
            />
            <SelectableTile
              value="wallet"
              icon={Smartphone}
              title="Mobile wallet"
              description="Telebirr · instant"
            />
          </SelectableTileGroup>
          <p className="pt-2 text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{delivery}</span>. Selected tile ={' '}
            <code>border-primary</code> + <code>bg-accent</code> + gold check.
          </p>
        </div>
      </Stack>

      <Stack label="Radiogroup — payment method, with a disabled option">
        <div className="max-w-2xl">
          <SelectableTileGroup label="Payment method" value={payment} onValueChange={setPayment}>
            <SelectableTile
              value="balance"
              icon={Wallet}
              title="Samra balance"
              description="No service fee"
            />
            <SelectableTile value="card" icon={CardIcon} title="Card" description="3% service fee" />
            <SelectableTile
              value="ach"
              icon={Landmark}
              title="ACH via Plaid"
              description="Coming soon"
              disabled
            />
          </SelectableTileGroup>
        </div>
      </Stack>

      <Stack label="Standalone toggle (aria-pressed) + disabled">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <SelectableTile
            icon={Wallet}
            title="Save recipient"
            description="Address book"
            selected
            onSelect={() => undefined}
          />
          <SelectableTile icon={CardIcon} title="One-time send" description="Don't save" disabled />
        </div>
      </Stack>

      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Accessibility:</span> inside a group each tile is
        a <code>role="radio"</code> in a <code>role="radiogroup"</code> with roving focus (arrow keys)
        and <code>aria-checked</code>; standalone tiles use <code>aria-pressed</code>. Disabled tiles
        expose <code>aria-disabled</code> and are non-interactive. Focus rings and states are
        token-driven for both light and dark mode.
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use a SelectableTileGroup for mutually-exclusive choices (delivery method, payment source).' },
            { kind: 'do', text: 'Pair a short title with a one-line description (rate, fee, ETA) so the trade-off is scannable.' },
            { kind: 'dont', text: 'Mix aria-pressed toggles and radio tiles in the same group — pick single-select or multi-select semantics.' },
            { kind: 'dont', text: 'Rely on the gold check alone to convey selection; the border + accent fill carry it for color-vision safety.' },
          ]}
        />
      </div>
    </div>
  );
}
