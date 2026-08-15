import { Badge } from '../../components/ui/badge';
import { Guidelines, Row } from '../parts';

export function BadgeDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Variants">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="gold">Gold</Badge>
      </Row>

      <Row label="Gold — Samra Pay promotional / live labels">
        <Badge variant="gold">Promo Applied</Badge>
        <Badge variant="gold">New</Badge>
        <Badge variant="gold">Premium</Badge>
      </Row>

      <Row label="Semantic — status and category labels">
        <Badge variant="secondary">Pending</Badge>
        <Badge variant="outline">In Transit</Badge>
        <Badge>Completed</Badge>
        <Badge variant="destructive">Failed</Badge>
      </Row>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use gold badges for promotional, "live rate", or premium-tier labels that carry brand weight.' },
            { kind: 'do', text: 'Keep badge text to 1–3 words — badges are scannable at a glance, not explanatory.' },
            { kind: 'dont', text: 'Mix gold and default badges in the same list; gold should be the only elevated label in a set.' },
          ]}
        />
      </div>
    </div>
  );
}
