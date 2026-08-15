import { useState } from 'react';
import { Plane } from 'lucide-react';
import { QuotePanel } from '../../components/patterns/quote-panel';
import { Guidelines, Stack } from '../parts';

export function PatternQuotePanelDemo() {
  const [amount, setAmount] = useState('750.00');
  const [lastQuote, setLastQuote] = useState<number | null>(null);

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Default — uncontrolled (Samra balance, no fee)">
        <QuotePanel
          defaultAmount="500.00"
          feeRate={0}
          feeLabel="Samra balance"
          ctaLabel="Send to Selam Bekele"
        />
      </Stack>

      <Stack label="Card payment — 3% illustrative fee">
        <QuotePanel defaultAmount="500.00" feeRate={0.03} feeLabel="3% card fee" />
      </Stack>

      <Stack label="Controlled + reward footer + submit handler">
        <QuotePanel
          amount={amount}
          onAmountChange={setAmount}
          feeRate={0.01}
          feeLabel="1% ACH via Plaid"
          onSubmit={(q) => setLastQuote(q.totalCharged)}
          footerSlot={
            <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-accent px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Plane className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="font-medium text-primary">+100 Sheba Miles</div>
                <div className="text-xs text-muted-foreground">Illustrative demo reward</div>
              </div>
            </div>
          }
        />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Interaction:</span> typing in "You send"
          re-computes "They receive" via an <code>aria-live</code> output. Input is a controlled
          value ({`"${amount}"`}).{' '}
          {lastQuote !== null
            ? `Last submitted total: $${lastQuote.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
            : 'Press the gold CTA to fire onSubmit.'}
        </p>
      </Stack>

      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Trust language:</span> the exchange-rate row is
        labelled "Illustrative rate for this demo — not a live quote" directly beneath the figure. All
        surfaces are token-driven and render correctly in light and dark mode.
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            { kind: 'do', text: 'Keep the illustrative-rate disclaimer adjacent to the rate figure so the demo caveat travels with the number.' },
            { kind: 'do', text: 'Drive it controlled (amount + onAmountChange) when the value is shared with other steps in a flow.' },
            { kind: 'dont', text: 'Present the demo rate as a live or guaranteed quote, or drop the "illustrative" label.' },
            { kind: 'dont', text: 'Add a second gold CTA inside the panel — the send action is the single primary anchor.' },
          ]}
        />
      </div>
    </div>
  );
}
