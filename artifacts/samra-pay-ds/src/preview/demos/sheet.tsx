import { useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../components/ui/sheet';
import { Guidelines, Row } from '../parts';

function TransferSettingsSheet() {
  const [saving, setSaving] = useState(false);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Transfer settings
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Transfer settings</SheetTitle>
          <SheetDescription>
            Defaults applied to every new transfer. Figures are illustrative.
          </SheetDescription>
        </SheetHeader>
        <div className="my-6 space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="sheet-limit">Daily limit (USD)</Label>
            <Input id="sheet-limit" defaultValue="1,000" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sheet-instant">Prefer instant delivery</Label>
            <Switch id="sheet-instant" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sheet-receipt">Email receipts</Label>
            <Switch id="sheet-receipt" />
          </div>
        </div>
        <SheetFooter>
          <Button
            variant="gold"
            disabled={saving}
            onClick={() => setSaving(true)}
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" /> Saving…
              </>
            ) : (
              'Save settings'
            )}
          </Button>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function SheetDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Settings panel (with save loading state)">
        <TransferSettingsSheet />
      </Row>

      <Row label="Sides">
        {(['right', 'left', 'top', 'bottom'] as const).map((side) => (
          <Sheet key={side}>
            <SheetTrigger asChild>
              <Button variant="outline" className="capitalize">
                {side}
              </Button>
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle className="capitalize">{side} sheet</SheetTitle>
                <SheetDescription>
                  Slides in from the {side} edge.
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="outline">Close</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </Row>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          Focus is trapped while the sheet is open; Esc or the overlay closes it
          and returns focus to the trigger.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a side sheet for secondary configuration — transfer defaults, filters — that keeps the main view in context.',
            },
            {
              kind: 'do',
              text: 'Anchor a right-side sheet on desktop; it maps to how people expect settings and detail panels to appear.',
            },
            {
              kind: 'dont',
              text: 'Bury the primary send/pay flow in a sheet; a full dialog or page reads as more committed.',
            },
            {
              kind: 'dont',
              text: 'Fill a sheet with a long multi-step form — break long journeys into their own screens.',
            },
          ]}
        />
      </div>
    </div>
  );
}
