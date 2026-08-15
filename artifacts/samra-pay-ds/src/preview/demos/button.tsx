import { ArrowRight, Loader2, Mail, Send, Zap } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Guidelines, Row } from '../parts';

export function ButtonDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Variants">
        <Button variant="gold">Gold</Button>
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button variant="destructive">Destructive</Button>
      </Row>

      <Row label="Gold — Samra Pay primary action">
        <Button variant="gold" size="lg">
          <Send /> Send Money
        </Button>
        <Button variant="gold">
          <Zap /> Apply Now
        </Button>
        <Button variant="gold" size="sm">Open Account</Button>
      </Row>

      <Row label="Sizes">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Mail">
          <Mail />
        </Button>
      </Row>

      <Row label="With icon">
        <Button variant="gold">
          <Send /> Send Money
        </Button>
        <Button variant="secondary">
          Continue <ArrowRight />
        </Button>
        <Button variant="outline">
          <Mail /> Contact
        </Button>
      </Row>

      <Row label="States">
        <Button disabled>Disabled</Button>
        <Button variant="gold" disabled>
          <Loader2 className="animate-spin" /> Processing
        </Button>
      </Row>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use the gold variant for the single primary action on a screen — "Send Money", "Apply Now", "Pay Bill".' },
            { kind: 'do', text: 'Pair gold with default/outline for secondary actions so hierarchy is unambiguous.' },
            { kind: 'dont', text: 'Use more than one gold button per viewport — its ambient glow is a visual anchor, not a pattern to repeat.' },
            { kind: 'dont', text: 'Place gold buttons on a gold or bright background; the gradient needs a dark or neutral surface to read.' },
          ]}
        />
      </div>
    </div>
  );
}
