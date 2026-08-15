import { CalendarClock, Info } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { Guidelines, Row } from '../parts';

function ScheduleTransferPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarClock /> Schedule transfer
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-3">
        <div>
          <p className="font-medium">Schedule to Selam</p>
          <p className="text-sm text-muted-foreground">
            Pick a send date and amount. Figures are illustrative.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="popover-date">Send date</Label>
          <Input id="popover-date" type="date" defaultValue="2026-08-14" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="popover-amount">Amount (USD)</Label>
          <Input id="popover-amount" defaultValue="250.00" />
        </div>
        <Button variant="gold" className="w-full">
          Schedule
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function FeeInfoPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="About fees">
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-2">
        <p className="font-medium">How fees work</p>
        <p className="text-sm text-muted-foreground">
          A flat 1.99 USD applies to instant transfers. Standard delivery is
          free. Amounts shown are illustrative for this demo.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function PopoverDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Inline form — schedule a transfer">
        <ScheduleTransferPopover />
      </Row>

      <Row label="Contextual info">
        <FeeInfoPopover />
        <span className="text-sm text-muted-foreground">
          Instant delivery · 1.99 USD fee
        </span>
      </Row>

      <Row label="Alignment">
        {(['start', 'center', 'end'] as const).map((align) => (
          <Popover key={align}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="capitalize">
                {align}
              </Button>
            </PopoverTrigger>
            <PopoverContent align={align}>
              <p className="text-sm text-muted-foreground">
                Aligned to <span className="font-medium">{align}</span> of the
                trigger.
              </p>
            </PopoverContent>
          </Popover>
        ))}
      </Row>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          The popover opens on click and traps focus for its lifetime; Esc or an
          outside click closes it and restores focus to the trigger.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a popover for a compact, focused task — scheduling a send or tweaking one setting — tied to its trigger.',
            },
            {
              kind: 'do',
              text: 'Keep the content short; a couple of fields or a sentence of context is the sweet spot.',
            },
            {
              kind: 'dont',
              text: 'Put critical confirmations in a popover — an outside click dismisses it, so use a dialog instead.',
            },
            {
              kind: 'dont',
              text: 'Confuse a click-open popover with a hover tooltip; tooltips are for labels, popovers for interaction.',
            },
          ]}
        />
      </div>
    </div>
  );
}
