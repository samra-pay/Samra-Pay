import { Separator } from '../../components/ui/separator';
import { Guidelines } from '../parts';

export function SeparatorDemo() {
  return (
    <div className="space-y-6">
      <div className="max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
        <div>
          <p className="font-medium">Transfer summary</p>
          <p className="text-sm text-muted-foreground">
            Review before you send — figures are illustrative.
          </p>
        </div>
        <Separator />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You send</span>
            <span className="tabular-nums">$120.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fee</span>
            <span className="tabular-nums">$1.99</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between font-medium">
            <span>Selam receives</span>
            <span className="tabular-nums">Br 15,240</span>
          </div>
        </div>
        <Separator />
        <div className="flex h-5 items-center gap-4 text-sm text-muted-foreground">
          <span>Rate lock</span>
          <Separator orientation="vertical" />
          <span>Support</span>
          <Separator orientation="vertical" />
          <span>Receipt</span>
        </div>
      </div>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a separator to divide the total from its line items so the amount received stands out.',
            },
            {
              kind: 'do',
              text: 'Use vertical separators to space inline links or metadata in a footer row.',
            },
            {
              kind: 'dont',
              text: 'Stack separators around every element — rely on spacing first and add a line only where a real break helps.',
            },
          ]}
        />
      </div>
    </div>
  );
}
