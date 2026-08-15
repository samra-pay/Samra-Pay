import { useState } from 'react';
import { Banknote, Landmark, Smartphone } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import {
  QuotePanel,
  computeQuote,
  ILLUSTRATIVE_RATE,
} from '../../components/patterns/quote-panel';
import {
  SelectableTile,
  SelectableTileGroup,
} from '../../components/patterns/selectable-tile';
import { Guidelines } from '../parts';

/* ─── Fixed demo data: Aug 14, 2026 ───────────────────────────────────────── */

const STEPS = ['Amount', 'Recipient', 'Delivery', 'Review'] as const;
/** We land the visitor on the "Delivery" step so every piece is visible at once. */
const ACTIVE_STEP = 2;

type Recipient = {
  id: string;
  name: string;
  location: string;
  initials: string;
  tone: 'coffee' | 'eucalyptus' | 'berbere';
};

const RECIPIENTS: Recipient[] = [
  { id: 'selam', name: 'Selam Tesfaye', location: 'Addis Ababa, ET', initials: 'ST', tone: 'coffee' },
  { id: 'dawit', name: 'Dawit Bekele', location: 'Bahir Dar, ET', initials: 'DB', tone: 'eucalyptus' },
  { id: 'hanna', name: 'Hanna Girma', location: 'Hawassa, ET', initials: 'HG', tone: 'berbere' },
];

const toneClass: Record<Recipient['tone'], string> = {
  coffee: 'bg-coffee text-coffee-foreground',
  eucalyptus: 'bg-eucalyptus text-eucalyptus-foreground',
  berbere: 'bg-berbere text-berbere-foreground',
};

const DELIVERY_LABELS: Record<string, string> = {
  bank: 'CBE bank deposit',
  wallet: 'Telebirr wallet',
  cash: 'Cash pickup',
};

function IllustrativeTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      Illustrative
    </span>
  );
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AppliedRemittancePage() {
  const [recipientId, setRecipientId] = useState<string>('selam');
  const [delivery, setDelivery] = useState<string>('bank');
  const [amount, setAmount] = useState<string>('500.00');

  const recipient =
    RECIPIENTS.find((r) => r.id === recipientId) ?? RECIPIENTS[0];
  const quote = computeQuote(parseFloat(amount || '0') || 0, 0.03);
  const progressValue = ((ACTIVE_STEP + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-2 rounded-xl border bg-card p-6 text-card-foreground">
        <h1 className="font-serif text-3xl">Applied — Send money</h1>
        <p className="text-sm text-muted-foreground">
          The remittance send-flow, rebuilt from design-system parts: a
          token-driven step indicator, an Avatar recipient picker, the
          SelectableTile delivery-method group, and the signature QuotePanel as
          the centrepiece — capped with the single gold CTA.
        </p>
        <p className="text-xs text-muted-foreground">
          Selections are live. All amounts, fees, and the exchange rate are{' '}
          <IllustrativeTag /> demo figures on a fixed date of Aug 14, 2026.
        </p>
      </div>

      {/* Bounded flow frame */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-e2 sm:p-8">
        {/* Step indicator */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Step {ACTIVE_STEP + 1} of {STEPS.length} · {STEPS[ACTIVE_STEP]}
            </p>
            <p className="text-xs text-muted-foreground">
              Sending to{' '}
              <span className="font-medium text-foreground">
                {recipient.name}
              </span>
            </p>
          </div>
          <Progress value={progressValue} aria-label="Send flow progress" />
          <ol className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {STEPS.map((label, i) => {
              const done = i < ACTIVE_STEP;
              const current = i === ACTIVE_STEP;
              return (
                <li
                  key={label}
                  className={
                    current
                      ? 'font-medium text-primary'
                      : done
                        ? 'text-eucalyptus-foreground'
                        : 'text-muted-foreground'
                  }
                >
                  <span
                    aria-current={current ? 'step' : undefined}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded-full text-[10px] ${
                        current
                          ? 'bg-primary text-primary-foreground'
                          : done
                            ? 'bg-eucalyptus text-eucalyptus-foreground'
                            : 'border border-border'
                      }`}
                    >
                      {i + 1}
                    </span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_minmax(0,26rem)]">
          {/* Left column: recipient + delivery */}
          <div className="space-y-8">
            {/* Recipient picker */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Recipient
              </p>
              <div
                role="radiogroup"
                aria-label="Choose a recipient"
                className="space-y-2"
              >
                {RECIPIENTS.map((r) => {
                  const selected = r.id === recipientId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRecipientId(r.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        selected
                          ? 'border-primary bg-accent text-accent-foreground shadow-gold-sm'
                          : 'border-border bg-background hover:border-primary/40 hover:bg-accent/40'
                      }`}
                    >
                      <Avatar className="size-9">
                        <AvatarFallback className={toneClass[r.tone]}>
                          {r.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.location}
                        </p>
                      </div>
                      {selected ? (
                        <span className="text-xs font-medium text-primary">
                          Selected
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delivery method */}
            <SelectableTileGroup
              label="Delivery method"
              value={delivery}
              onValueChange={setDelivery}
            >
              <SelectableTile
                value="bank"
                title="CBE bank deposit"
                description="1–2 hours"
                icon={Landmark}
              />
              <SelectableTile
                value="wallet"
                title="Telebirr wallet"
                description="Instant"
                icon={Smartphone}
              />
              <SelectableTile
                value="cash"
                title="Cash pickup"
                description="Same day"
                icon={Banknote}
              />
            </SelectableTileGroup>

            {/* Review summary */}
            <div className="space-y-4 rounded-2xl border bg-background p-6 shadow-e1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Review
              </p>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Recipient</dt>
                  <dd className="font-medium">{recipient.name}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Destination</dt>
                  <dd>{recipient.location}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Delivery method</dt>
                  <dd>{DELIVERY_LABELS[delivery]}</dd>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <dt className="text-muted-foreground">They receive</dt>
                  <dd className="font-mono text-primary">
                    ETB {formatMoney(quote.recipientEtb)}
                  </dd>
                </div>
                <div className="flex items-center justify-between text-base font-medium">
                  <dt>Total charged</dt>
                  <dd className="text-primary">
                    ${formatMoney(quote.totalCharged)}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground/80">
                <IllustrativeTag /> figures · rate 1 USD = {ILLUSTRATIVE_RATE}{' '}
                ETB · not a live quote.
              </p>
              <Button variant="gold" size="lg" className="w-full rounded-xl">
                Review &amp; send ${formatMoney(quote.totalCharged)}
              </Button>
            </div>
          </div>

          {/* Right column: the QuotePanel centrepiece */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Amount
            </p>
            <QuotePanel
              amount={amount}
              onAmountChange={setAmount}
              feeRate={0.03}
              feeLabel="3% card fee"
              className="max-w-none"
              ctaLabel={`Continue to send $${formatMoney(quote.totalCharged)}`}
            />
          </div>
        </div>
      </div>

      {/* Guidelines */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Make the QuotePanel the centrepiece — the "You send / They receive" moment is the emotional core of the flow, so give it room and a single gold CTA.',
            },
            {
              kind: 'do',
              text: 'Use the SelectableTileGroup radio semantics for delivery method so one option is always chosen and keyboard users can arrow between tiles.',
            },
            {
              kind: 'do',
              text: 'Reflect the live selection (recipient, method, amount) in the review summary so the person always sees exactly what they are about to confirm.',
            },
            {
              kind: 'dont',
              text: 'Show the rate or total without an illustrative tag, or imply the send is a live transfer.',
            },
            {
              kind: 'dont',
              text: 'Stack two gold buttons in one view — keep the primary action singular and let the review CTA lead.',
            },
          ]}
        />
      </div>
    </div>
  );
}
