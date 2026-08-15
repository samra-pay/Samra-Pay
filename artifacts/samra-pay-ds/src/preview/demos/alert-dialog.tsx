import { UserX } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import { buttonVariants } from '../../components/ui/button';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { Guidelines, Row } from '../parts';

function CancelTransferDialog() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Cancel transfer</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this transfer?</AlertDialogTitle>
          <AlertDialogDescription>
            The 250.00 USD sending to Hanna Tesfaye will be stopped and the
            funds returned to your wallet. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep transfer</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              buttonVariants({ variant: 'destructive' }),
            )}
          >
            Cancel transfer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveRecipientDialog() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <UserX /> Remove recipient
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Selam Girma?</AlertDialogTitle>
          <AlertDialogDescription>
            Selam will be deleted from your saved recipients. Past transfers
            stay in your history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep recipient</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: 'destructive' }))}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AlertDialogDemo() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Row label="Destructive confirmation">
        <CancelTransferDialog />
      </Row>

      <Row label="Remove a saved recipient">
        <RemoveRecipientDialog />
      </Row>

      <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <p>
          An alert dialog blocks interaction until the user chooses; it cannot
          be dismissed by clicking the overlay, only by an explicit button.
        </p>
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Reserve alert dialogs for consequential, hard-to-reverse actions like cancelling money in flight.',
            },
            {
              kind: 'do',
              text: 'Name the confirm button after the outcome (“Cancel transfer”) so the choice is unambiguous.',
            },
            {
              kind: 'dont',
              text: 'Use an alert dialog for routine or reversible steps — it trains people to click through warnings.',
            },
            {
              kind: 'dont',
              text: 'Make the safe option (Keep) look destructive; keep the danger styling on the destructive action only.',
            },
          ]}
        />
      </div>
    </div>
  );
}
