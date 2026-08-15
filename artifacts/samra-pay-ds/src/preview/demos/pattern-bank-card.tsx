import { BankCard, Card3DWrapper } from '../../components/patterns/bank-card';
import { Guidelines, Stack } from '../parts';

export function PatternBankCardDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Variants — click / Enter / Space to flip">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <BankCard
              variant="charge"
              cardholderName="SELAM BEKELE"
              last4="8821"
              expiry="08/29"
              showFlipHint
            />
            <p className="text-xs text-muted-foreground pt-6">
              Charge — deep eucalyptus. Front + back with signature panel.
            </p>
          </div>

          <div className="space-y-2">
            <BankCard
              variant="co-brand"
              cardholderName="DAWIT ASSEFA"
              last4="4917"
              expiry="11/28"
              coBrandSlot="ETHIOPIAN"
            />
            <p className="text-xs text-muted-foreground">
              Co-brand — gold face with an optional partner slot (placeholder wordmark).
            </p>
          </div>

          <div className="space-y-2">
            <BankCard variant="debit" cardholderName="SELAM BEKELE" last4="2043" expiry="04/27" />
            <p className="text-xs text-muted-foreground">Debit — graphite face.</p>
          </div>
        </div>
      </Stack>

      <Stack label="3D tilt + glare — hover to tilt (respects reduced motion)">
        <div className="max-w-sm">
          <Card3DWrapper>
            <BankCard variant="charge" cardholderName="SELAM BEKELE" last4="8821" expiry="08/29" />
          </Card3DWrapper>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Interaction:</span> pointer position drives
          perspective rotation and a radial glare. With OS "reduce motion" enabled, the tilt flattens
          and the glare is hidden.
        </p>
      </Stack>

      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Accessibility:</span> the card is a{' '}
        <code>role="button"</code> toggle with <code>aria-pressed</code> reflecting the flipped state,
        keyboard-operable (Enter / Space), a visible focus ring, and an <code>sr-only</code>{' '}
        <code>aria-live</code> region announcing which face is showing. Card faces are fixed art, so
        they are identical in light and dark mode. Figures are illustrative demo data.
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            { kind: 'do', text: 'Wrap a single hero card in Card3DWrapper for a premium landing/onboarding moment.' },
            { kind: 'do', text: 'Keep the panels and text around the card token-driven so the surrounding UI adapts to light/dark; the card art stays fixed by design.' },
            { kind: 'dont', text: 'Recolor the card faces with tokens — the physical-object gradients are intentional and mode-independent.' },
            { kind: 'dont', text: 'Stack many tilting cards in one viewport; the parallax competes for attention and hurts performance.' },
          ]}
        />
      </div>
    </div>
  );
}
