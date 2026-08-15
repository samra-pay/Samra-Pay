import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import { Guidelines } from '../parts';

const recipients = ['Selam Tesfaye', 'Dawit Bekele', 'Hanna Girma'];

export function CollapsibleDemo() {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-6">
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="max-w-md space-y-2 rounded-xl border bg-card p-6 text-card-foreground"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Saved recipients</p>
            <p className="text-xs text-muted-foreground">
              3 people in your Ethiopia address book
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Toggle recipients">
              <ChevronsUpDown />
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-4 py-2 text-sm font-medium">
          {recipients[0]}
        </div>
        <CollapsibleContent className="space-y-2">
          {recipients.slice(1).map((name) => (
            <div
              key={name}
              className="rounded-md border px-4 py-2 text-sm font-medium"
            >
              {name}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <p className="text-xs text-muted-foreground">
        The trigger is a real button: focus it and press Enter or Space to
        expand or collapse the saved recipients.
      </p>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Keep the most-used item (the top recipient) visible and tuck the overflow behind the toggle.',
            },
            {
              kind: 'do',
              text: 'Show a count in the header so users know how much is hidden before they expand.',
            },
            {
              kind: 'dont',
              text: 'Use a collapsible when there are only one or two items — just show them.',
            },
          ]}
        />
      </div>
    </div>
  );
}
