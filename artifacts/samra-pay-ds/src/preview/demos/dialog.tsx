import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Guidelines, Row } from '../parts';

function SendMoneyDialog() {
  const [sending, setSending] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Send /> Send money
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to Dawit Bekele</DialogTitle>
          <DialogDescription>
            Confirm the details before we move funds. Figures are illustrative.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="dialog-amount">Amount (USD)</Label>
            <Input id="dialog-amount" defaultValue="250.00" />
            <p className="text-sm text-muted-foreground">
              Recipient gets ≈ 31,250 ETB
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dialog-note">Note</Label>
            <Input id="dialog-note" defaultValue="For school fees" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="gold"
            disabled={sending}
            onClick={() => setSending(true)}
          >
            {sending ? (
              <>
                <Loader2 className="animate-spin" /> Sending…
              </>
            ) : (
              'Confirm & send'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvalidAmountDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Edit limit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Daily transfer limit</DialogTitle>
          <DialogDescription>
            Set how much you can send per day.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="dialog-limit">Limit (USD)</Label>
          <Input
            id="dialog-limit"
            defaultValue="20000"
            aria-invalid
            aria-describedby="dialog-limit-error"
          />
          <p id="dialog-limit-error" className="text-sm text-destructive">
            Exceeds the 10,000 USD account ceiling.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Confirm a transfer (with loading state)">
        <SendMoneyDialog />
      </Row>

      <Row label="Form with validation error">
        <InvalidAmountDialog />
      </Row>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          Focus is trapped inside the dialog while open; Esc or the overlay
          dismisses it and returns focus to the trigger.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Use a dialog to collect or confirm details mid-flow, like the amount and note before sending money.',
            },
            {
              kind: 'do',
              text: 'Lead the footer with the gold primary action and keep Cancel as a quiet outline button.',
            },
            {
              kind: 'dont',
              text: 'Use a plain dialog for irreversible actions — reach for the alert dialog so the choice is explicit.',
            },
            {
              kind: 'dont',
              text: 'Stack dialogs on dialogs; finish or dismiss one step before opening the next.',
            },
          ]}
        />
      </div>
    </div>
  );
}
