import { Copy, Info, Repeat2, Send, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { Guidelines, Row } from '../parts';

export function TooltipDemo() {
  return (
    <TooltipProvider>
      <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
        <Row label="Icon-button labels">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="gold" size="icon" aria-label="Send money">
                <Send />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send money</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Repeat transfer">
                <Repeat2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Repeat last transfer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Copy reference">
                <Copy />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy transfer reference</TooltipContent>
          </Tooltip>
        </Row>

        <Row label="Explaining a disabled control">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="destructive" size="icon" disabled aria-label="Cancel transfer">
                  <Trash2 />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Can’t cancel — this transfer already settled
            </TooltipContent>
          </Tooltip>
          <span className="text-sm text-muted-foreground">
            Wrap disabled buttons so the tooltip still receives hover and focus.
          </span>
        </Row>

        <Row label="Sides">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <Tooltip key={side}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label={`Info ${side}`}>
                  <Info />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={side} className="capitalize">
                {side}
              </TooltipContent>
            </Tooltip>
          ))}
        </Row>

        <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
          <p>
            Tooltips appear on hover and on keyboard focus of the trigger, so
            icon-only actions stay labelled for every input method.
          </p>
          <Guidelines
            items={[
              {
                kind: 'do',
                text: 'Use tooltips to name icon-only actions like Send, Repeat, or Copy where space is tight.',
              },
              {
                kind: 'do',
                text: 'Keep the text to a few words; a tooltip supplements a label, it doesn’t replace instructions.',
              },
              {
                kind: 'dont',
                text: 'Hide essential information — amounts, fees, errors — in a tooltip; it’s absent on touch devices.',
              },
              {
                kind: 'dont',
                text: 'Put links or buttons inside a tooltip; use a popover or hover card when the content is interactive.',
              },
            ]}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
